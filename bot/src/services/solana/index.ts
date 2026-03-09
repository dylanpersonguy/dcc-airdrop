// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Solana Service — Custodial keypair & bridge signing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Each user gets a Solana keypair generated and stored
// encrypted at rest.  The bot watches for SOL deposits
// and auto-signs the bridge program instruction.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import prisma from '../../db/prisma';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { audit } from '../../utils/audit';
import type { SolanaWallet } from '@prisma/client';

// ── Encryption (mirrors DCC wallet pattern) ──

const SOL_ENC_KEY = scryptSync(config.WALLET_ENCRYPTION_SECRET, 'sol-wallet-salt', 32);

function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', SOL_ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(encoded: string): string {
  const parts = encoded.split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted Solana key data');
  const [ivHex, tagHex, ctHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', SOL_ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ct) + decipher.final('utf8');
}

// ── Connection ────────────────────────────

let _connection: Connection | null = null;

export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(config.SOLANA_RPC_URL, 'confirmed');
  }
  return _connection;
}

// ── Wallet Management ─────────────────────

/**
 * Get or create a Solana keypair for the given user.
 * Returns the DB record (with publicKey).  Secret key is encrypted in DB.
 */
export async function getOrCreateSolanaWallet(userId: string): Promise<SolanaWallet> {
  const existing = await prisma.solanaWallet.findUnique({ where: { userId } });
  if (existing) return existing;

  const keypair = Keypair.generate();
  const pubkey = keypair.publicKey.toBase58();
  const secretKeyHex = Buffer.from(keypair.secretKey).toString('hex');
  const encryptedKey = encrypt(secretKeyHex);

  try {
    const wallet = await prisma.solanaWallet.create({
      data: { userId, publicKey: pubkey, encryptedKey },
    });

    await audit({
      actorType: 'system',
      action: 'solana_wallet_generated',
      targetType: 'user',
      targetId: userId,
      metadata: { publicKey: pubkey },
    });

    logger.info({ userId, publicKey: pubkey }, 'Solana custodial wallet created');
    return wallet;
  } catch (err: any) {
    // Race condition
    if (err?.code === 'P2002') {
      const raceWinner = await prisma.solanaWallet.findUnique({ where: { userId } });
      if (raceWinner) return raceWinner;
    }
    throw err;
  }
}

/**
 * Decrypt secret key and reconstruct Keypair (internal use only).
 */
export function decryptKeypair(wallet: SolanaWallet): Keypair {
  const secretHex = decrypt(wallet.encryptedKey);
  const secretKey = Uint8Array.from(Buffer.from(secretHex, 'hex'));
  return Keypair.fromSecretKey(secretKey);
}

// ── Balance ───────────────────────────────

export async function getSolBalance(pubkey: string): Promise<number> {
  const conn = getConnection();
  const balance = await conn.getBalance(new PublicKey(pubkey));
  return balance / LAMPORTS_PER_SOL;
}

// ── Bridge Transaction Signing ────────────

/**
 * Build, sign, and submit the bridge deposit instruction returned by the API.
 * Returns the Solana transaction signature.
 */
export async function signAndSendBridgeDeposit(
  wallet: SolanaWallet,
  instruction: {
    programId: string;
    accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
    data: { recipientDcc: string; amount: number };
  },
): Promise<string> {
  const conn = getConnection();
  const keypair = decryptKeypair(wallet);

  // Reconstruct the TransactionInstruction from the API response
  const ix = new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((acc) => ({
      pubkey: new PublicKey(acc.pubkey),
      isSigner: acc.isSigner,
      isWritable: acc.isWritable,
    })),
    data: Buffer.from(JSON.stringify(instruction.data)),
  });

  const { blockhash } = await conn.getLatestBlockhash();

  const messageV0 = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);
  tx.sign([keypair]);

  const sig = await conn.sendTransaction(tx, { skipPreflight: false });

  logger.info(
    { publicKey: wallet.publicKey, sig },
    'Bridge deposit transaction sent',
  );

  return sig;
}
