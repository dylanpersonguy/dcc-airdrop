// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Wallet Service — Auto-generated custodial wallets
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Each user gets a wallet auto-created on /start.
// Seed phrases are encrypted at rest using AES-256-GCM.
// Users can export their seed via the bot menu.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { randomSeed, address as deriveAddress, privateKey, publicKey } from '@waves/ts-lib-crypto';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import prisma from '../../db/prisma';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { audit } from '../../utils/audit';
import type { Wallet } from '@prisma/client';

// DecentralChain uses chain ID byte 63 which produces 3D-prefixed addresses.
// The @waves/ts-lib-crypto library interprets the chain ID as a character code,
// so we must pass the raw byte value rather than the letter 'D'.
const CHAIN_ID = String.fromCharCode(63);
const ENC_KEY = deriveEncKey();

function deriveEncKey(): Buffer {
  const secret = config.WALLET_ENCRYPTION_SECRET;
  return scryptSync(secret, 'dcc-wallet-salt', 32);
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(encoded: string): string {
  const parts = encoded.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted wallet data');
  }
  const [ivHex, tagHex, ctHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ct) + decipher.final('utf8');
}

export interface GeneratedWallet {
  address: string;
  publicKey: string;
  wallet: Wallet;
}

/**
 * Generate a new wallet for a user. Creates seed phrase,
 * derives keypair + address, stores encrypted seed in DB.
 */
export async function generateWalletForUser(userId: string): Promise<GeneratedWallet> {
  // Check if user already has a wallet
  const existing = await prisma.wallet.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    const pubKey = publicKey(decrypt(existing.encryptedSeed!));
    return {
      address: existing.address,
      publicKey: pubKey,
      wallet: existing,
    };
  }

  const seed = randomSeed();
  const addr = deriveAddress(seed, CHAIN_ID);
  const pubKey = publicKey(seed);
  const encSeed = encrypt(seed);

  let wallet: Wallet;
  try {
    wallet = await prisma.wallet.create({
      data: {
        userId,
        address: addr,
        encryptedSeed: encSeed,
        isVerified: true,
        verifiedAt: new Date(),
      },
    });
  } catch (err: any) {
    // Race condition: another request created the wallet first
    if (err?.code === 'P2002') {
      const raceWinner = await prisma.wallet.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (raceWinner) {
        const existingPubKey = publicKey(decrypt(raceWinner.encryptedSeed!));
        return { address: raceWinner.address, publicKey: existingPubKey, wallet: raceWinner };
      }
    }
    throw err;
  }

  await audit({
    actorType: 'system',
    action: 'wallet_generated',
    targetType: 'wallet',
    targetId: wallet.id,
    metadata: { address: addr },
  });

  logger.info({ userId, address: addr }, 'Wallet auto-generated for user');

  return { address: addr, publicKey: pubKey, wallet };
}

/**
 * Get the user's wallet address.
 */
export async function getUserWallet(userId: string): Promise<Wallet | null> {
  return prisma.wallet.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Decrypt and return the seed phrase for internal use (e.g. auto-deposit).
 * Does NOT audit — caller is responsible for audit logging.
 */
export async function decryptWalletSeed(userId: string): Promise<string | null> {
  const wallet = await prisma.wallet.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  if (!wallet?.encryptedSeed) return null;
  return decrypt(wallet.encryptedSeed);
}

/**
 * Decrypt and return the seed phrase for a user's wallet.
 * Only call this when the user explicitly requests it.
 */
export async function exportSeedPhrase(userId: string): Promise<string | null> {
  const wallet = await prisma.wallet.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  if (!wallet?.encryptedSeed) return null;

  await audit({
    actorType: 'user',
    actorId: userId,
    action: 'seed_phrase_exported',
    targetType: 'wallet',
    targetId: wallet.id,
  });

  return decrypt(wallet.encryptedSeed);
}
