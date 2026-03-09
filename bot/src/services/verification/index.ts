// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Verification Service — Wallet ownership proof
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Flow (transfer_memo method):
//   1. User submits wallet address.
//   2. Service creates a unique challenge string and stores it in DB.
//   3. User sends a DataTransaction from their wallet containing:
//        key = "dcc-airdrop-verify"
//        value = <challenge string>
//   4. Bot polls / user clicks "Verify" → service checks on-chain for
//      the DataTransaction from that wallet with the correct challenge.
//   5. On success, wallet is marked verified.
//
// The challenge expires after CHALLENGE_EXPIRY_MINUTES to prevent replay.
// Changing wallet invalidates any pending challenge for the old wallet.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { nanoid } from 'nanoid';
import prisma from '../../db/prisma';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { audit } from '../../utils/audit';
import { verifyDataTransaction } from '../blockchain';
import { isValidDccAddress } from '../../utils/validation';
import type { Wallet } from '@prisma/client';

const VERIFICATION_DATA_KEY = 'dcc-airdrop-verify';

export interface ChallengeResult {
  success: boolean;
  challenge?: string;
  expiresAt?: Date;
  error?: string;
  wallet?: Wallet;
}

export interface VerifyResult {
  success: boolean;
  error?: string;
}

/**
 * Initiate wallet connection: upsert wallet record and generate challenge.
 */
export async function initiateWalletVerification(
  userId: string,
  address: string,
): Promise<ChallengeResult> {
  if (!isValidDccAddress(address)) {
    return { success: false, error: 'Invalid wallet address format.' };
  }

  // Check if this wallet is already verified by another user
  const existingVerified = await prisma.wallet.findFirst({
    where: { address, isVerified: true, userId: { not: userId } },
  });
  if (existingVerified) {
    return { success: false, error: 'This wallet is already verified by another account.' };
  }

  const challenge = `verify-${nanoid(16)}`;
  const expiresAt = new Date(Date.now() + config.CHALLENGE_EXPIRY_MINUTES * 60 * 1000);

  // Upsert wallet record for this user + address
  const wallet = await prisma.wallet.upsert({
    where: { userId_address: { userId, address } },
    update: {
      verificationChallenge: challenge,
      verificationChallengeExpiresAt: expiresAt,
      verificationMethod: config.VERIFICATION_METHOD,
      isVerified: false,
      verifiedAt: null,
    },
    create: {
      userId,
      address,
      verificationChallenge: challenge,
      verificationChallengeExpiresAt: expiresAt,
      verificationMethod: config.VERIFICATION_METHOD,
    },
  });

  await audit({
    actorType: 'user',
    actorId: userId,
    action: 'wallet_challenge_created',
    targetType: 'wallet',
    targetId: wallet.id,
    metadata: { address },
  });

  return { success: true, challenge, expiresAt, wallet };
}

/**
 * Attempt to verify the wallet by checking on-chain for the challenge proof.
 */
export async function checkWalletVerification(
  userId: string,
  walletId: string,
): Promise<VerifyResult> {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet || wallet.userId !== userId) {
    return { success: false, error: 'Wallet not found.' };
  }

  if (wallet.isVerified) {
    return { success: true };
  }

  if (!wallet.verificationChallenge || !wallet.verificationChallengeExpiresAt) {
    return { success: false, error: 'No pending verification challenge. Please reconnect your wallet.' };
  }

  if (new Date() > wallet.verificationChallengeExpiresAt) {
    return { success: false, error: 'Verification challenge expired. Please reconnect your wallet to get a new challenge.' };
  }

  // Check on-chain for the data transaction with the challenge
  const verified = await verifyDataTransaction(
    wallet.address,
    VERIFICATION_DATA_KEY,
    wallet.verificationChallenge,
  );

  if (!verified) {
    return {
      success: false,
      error: 'Verification not found on-chain yet. Make sure you sent a Data Transaction from your wallet with:\n'
        + `  Key: \`${VERIFICATION_DATA_KEY}\`\n`
        + `  Value: \`${wallet.verificationChallenge}\``,
    };
  }

  // Mark as verified
  await prisma.wallet.update({
    where: { id: wallet.id },
    data: {
      isVerified: true,
      verifiedAt: new Date(),
      verificationChallenge: null,
      verificationChallengeExpiresAt: null,
    },
  });

  await audit({
    actorType: 'user',
    actorId: userId,
    action: 'wallet_verified',
    targetType: 'wallet',
    targetId: wallet.id,
    metadata: { address: wallet.address },
  });

  logger.info({ userId, wallet: wallet.address }, 'Wallet verified successfully');

  return { success: true };
}

/**
 * Get the pending (unverified) wallet with an active challenge for a user.
 */
export async function getPendingWallet(userId: string): Promise<Wallet | null> {
  return prisma.wallet.findFirst({
    where: {
      userId,
      isVerified: false,
      verificationChallenge: { not: null },
      verificationChallengeExpiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
}
