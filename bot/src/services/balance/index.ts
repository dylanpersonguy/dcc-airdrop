// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Balance Service — Consolidated off-chain balance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Single source of truth for a user's off-chain DCC balance.
// Replaces the duplicate logic in purchases/index.ts and locks/index.ts.
// Cached in Redis for 30s to eliminate redundant DB queries.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import prisma from '../../db/prisma';
import { getRedis } from '../../utils/redis';
import { getDepositBalance } from '../deposit';

const BALANCE_CACHE_TTL = 30; // seconds

export interface FullBalance {
  inviteAvailable: number;
  purchaseAvailable: number;
  lockEarnings: number;
  commissionEarnings: number;
  depositBalance: number;
  gameProfit: number;
  locked: number;
  totalAvailable: number;
}

/**
 * Compute the full off-chain balance breakdown for a user.
 * Cached in Redis for BALANCE_CACHE_TTL seconds.
 */
export async function getFullBalance(userId: string): Promise<FullBalance> {
  const redis = getRedis();
  const cacheKey = `balance:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as FullBalance;
  }

  const result = await computeBalance(userId);

  await redis.set(cacheKey, JSON.stringify(result), 'EX', BALANCE_CACHE_TTL);
  return result;
}

/**
 * Invalidate the cached balance for a user.
 * Call this after any balance-mutating action (buy, lock, redeem, deposit, commission).
 */
export async function invalidateBalanceCache(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`balance:${userId}`);
}

/**
 * Internal: compute the balance from the database without caching.
 */
async function computeBalance(userId: string): Promise<FullBalance> {
  const [inviteRewards, purchases, activeLocks, completedLocks, commissionRewards, depositBal, gameAgg] = await Promise.all([
    prisma.inviteReward.findMany({ where: { userId } }),
    prisma.dccPurchase.findMany({ where: { userId, status: 'COMPLETED' } }),
    prisma.dccLock.findMany({ where: { userId, status: 'ACTIVE' } }),
    prisma.dccLock.findMany({ where: { userId, status: { in: ['COMPLETED', 'WITHDRAWN'] }, earningsRedeemed: false } }),
    prisma.lockReferralReward.findMany({ where: { userId } }),
    getDepositBalance(userId),
    prisma.gameTransaction.aggregate({ where: { userId }, _sum: { profit: true } }),
  ]);

  const inviteTotal = inviteRewards.reduce((s, r) => s + r.amount, 0);
  const inviteRedeemed = inviteRewards.filter((r) => r.redeemed).reduce((s, r) => s + r.amount, 0);
  const inviteAvailable = inviteTotal - inviteRedeemed;

  const purchaseTotal = purchases.reduce((s, p) => s + p.dccAmount, 0);
  const purchaseRedeemed = purchases.filter((p) => p.redeemed).reduce((s, p) => s + p.dccAmount, 0);
  const purchaseAvailable = purchaseTotal - purchaseRedeemed;

  const locked = activeLocks.reduce((s, l) => s + l.amount, 0);
  const lockEarnings = completedLocks.reduce((s, l) => s + l.earnedDcc, 0);
  const commissionEarnings = commissionRewards
    .filter((r) => !r.redeemed)
    .reduce((s, r) => s + r.amount, 0);

  const gameProfit = gameAgg._sum.profit ?? 0;

  const totalAvailable = Math.max(0, inviteAvailable + purchaseAvailable - locked + lockEarnings + commissionEarnings + depositBal + gameProfit);

  return {
    inviteAvailable,
    purchaseAvailable,
    lockEarnings,
    commissionEarnings,
    depositBalance: depositBal,
    gameProfit,
    locked,
    totalAvailable,
  };
}
