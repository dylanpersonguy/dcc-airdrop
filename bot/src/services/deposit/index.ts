// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Deposit Service — Auto-transfer on-chain DCC → off-chain balance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Automatically transfers DCC from the user's on-chain wallet to the
// rewards wallet and credits their off-chain balance in one step.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { address as deriveAddress } from '@waves/ts-lib-crypto';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { audit } from '../../utils/audit';
import prisma from '../../db/prisma';
import { sendDCCFromWallet } from '../transfer';
import { decryptWalletSeed, getUserWallet } from '../wallet';
import { getCachedBalances, invalidateCache } from '../blockchain';
import { DCC_CHAIN_ID, WAVELETS_PER_DCC, FEE_WAVELETS } from '../../config/constants';
import { invalidateBalanceCache } from '../balance';

const CHAIN_ID = String.fromCharCode(DCC_CHAIN_ID);

/** Derive the rewards wallet address from the seed */
export function getRewardsWalletAddress(): string {
  return deriveAddress(config.REWARDS_WALLET_SEED, CHAIN_ID);
}

export interface DepositResult {
  txId: string;
  amount: number;
}

/**
 * Automatically deposit all on-chain DCC from the user's wallet
 * to the rewards wallet and credit their off-chain balance.
 * Returns the deposit result or null if nothing to deposit.
 */
export async function autoDeposit(userId: string): Promise<DepositResult | null> {
  const wallet = await getUserWallet(userId);
  if (!wallet) throw new Error('No wallet found');

  const balances = await getCachedBalances(wallet.address);
  const balanceWavelets = Number(balances.dccBalance);

  // Need enough for the transfer amount + fee
  const transferableWavelets = balanceWavelets - FEE_WAVELETS;
  if (transferableWavelets <= 0) {
    return null;
  }

  const dccAmount = transferableWavelets / WAVELETS_PER_DCC;
  const rewardsAddr = getRewardsWalletAddress();

  // Decrypt user's seed to sign the transfer
  const seed = await decryptWalletSeed(userId);
  if (!seed) throw new Error('Could not decrypt wallet seed');

  // Send DCC from user's wallet to rewards wallet
  const txId = await sendDCCFromWallet(seed, rewardsAddr, dccAmount);

  // Credit the deposit to off-chain balance
  await prisma.dccDeposit.create({
    data: {
      userId,
      txId,
      amount: dccAmount,
      senderAddress: wallet.address,
    },
  });

  // Invalidate cached balances so next read is fresh
  await invalidateCache(wallet.address);
  await invalidateBalanceCache(userId);

  await audit({
    actorType: 'user',
    actorId: userId,
    action: 'dcc_auto_deposited',
    targetType: 'user',
    targetId: userId,
    metadata: { txId, amount: dccAmount, senderAddress: wallet.address },
  });

  logger.info(
    { userId, txId, amount: dccAmount },
    'Auto-deposit: on-chain DCC transferred to rewards wallet and credited',
  );

  return { txId, amount: dccAmount };
}

/**
 * Get total deposit balance for a user.
 */
export async function getDepositBalance(userId: string): Promise<number> {
  const deposits = await prisma.dccDeposit.findMany({
    where: { userId, status: 'COMPLETED' },
  });
  return deposits.reduce((sum: number, d: { amount: number }) => sum + d.amount, 0);
}

/**
 * Get deposit history for a user.
 */
export async function getDepositHistory(userId: string): Promise<Array<{ txId: string; amount: number; createdAt: Date }>> {
  return prisma.dccDeposit.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { txId: true, amount: true, createdAt: true },
    take: 20,
  });
}
