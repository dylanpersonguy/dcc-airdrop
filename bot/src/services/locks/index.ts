// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Lock Service — Off-chain DCC staking with referral boosts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import prisma from '../../db/prisma';
import { audit } from '../../utils/audit';
import { logger } from '../../utils/logger';
import { getUpline } from '../referrals';
import { getDepositBalance } from '../deposit';
import { getFullBalance, invalidateBalanceCache } from '../balance';

const LOCK_DURATION_DAYS = 30;
const DAILY_RATE = 0.03; // 3% per day (base)
const MIN_LOCK_AMOUNT = 100;
const MAX_LOCK_AMOUNT = 15_000;
const MAX_ACTIVE_LOCKS = 15;

export { MIN_LOCK_AMOUNT, MAX_LOCK_AMOUNT, MAX_ACTIVE_LOCKS, LOCK_DURATION_DAYS, DAILY_RATE };

// ── Referral-based boost tiers ────────────
// Users earn a higher daily rate based on their direct (tier-1) referral count.
// Sorted highest-first so the first match wins.

const BOOST_TIERS: { minRefs: number; rate: number }[] = [
  { minRefs: 5000, rate: 0.05 },
  { minRefs: 2000, rate: 0.045 },
  { minRefs: 1000, rate: 0.042 },
  { minRefs: 500,  rate: 0.04 },
  { minRefs: 100,  rate: 0.038 },
  { minRefs: 60,   rate: 0.036 },
  { minRefs: 30,   rate: 0.034 },
  { minRefs: 10,   rate: 0.032 },
  { minRefs: 0,    rate: DAILY_RATE },
];

export { BOOST_TIERS };

// Commission rates on lock earnings paid to upline referrers
const LOCK_COMMISSION_RATES: Record<number, number> = {
  1: 0.10,  // 10% to direct referrer
  2: 0.05,  // 5% to second-level
  3: 0.02,  // 2% to third-level
};

/**
 * Get the boosted daily lock rate for a user based on their tier-1 referral count.
 */
export async function getBoostedRate(userId: string): Promise<{
  rate: number;
  referralCount: number;
  nextTier: { minRefs: number; rate: number } | null;
}> {
  const referralCount = await prisma.referralEvent.count({
    where: { referrerUserId: userId, tier: 1 },
  });

  let rate = DAILY_RATE;
  let nextTier: { minRefs: number; rate: number } | null = null;

  for (let i = 0; i < BOOST_TIERS.length; i++) {
    if (referralCount >= BOOST_TIERS[i].minRefs) {
      rate = BOOST_TIERS[i].rate;
      nextTier = i > 0 ? BOOST_TIERS[i - 1] : null;
      break;
    }
  }

  return { rate, referralCount, nextTier };
}

// ── Earnings calculation ──────────────────

/**
 * Calculate earned DCC for a lock based on elapsed days (capped at lock duration).
 */
export function calculateEarnings(amount: number, startedAt: Date, dailyRate: number): number {
  const now = new Date();
  const msElapsed = now.getTime() - startedAt.getTime();
  const daysElapsed = Math.min(msElapsed / (1000 * 60 * 60 * 24), LOCK_DURATION_DAYS);
  return Math.floor(amount * dailyRate * daysElapsed * 100) / 100;
}

/**
 * Days remaining on a lock.
 */
export function daysRemaining(expiresAt: Date): number {
  const ms = expiresAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

// ── Create lock ───────────────────────────

export async function createLock(userId: string, amount: number): Promise<{
  success: boolean;
  error?: string;
  lockId?: string;
  dailyRate?: number;
}> {
  if (amount < MIN_LOCK_AMOUNT) {
    return { success: false, error: `Minimum lock amount is ${MIN_LOCK_AMOUNT} DCC.` };
  }

  if (amount > MAX_LOCK_AMOUNT) {
    return { success: false, error: `Maximum lock amount is ${MAX_LOCK_AMOUNT.toLocaleString()} DCC per lock.` };
  }

  // Check active lock count
  const activeCount = await prisma.dccLock.count({ where: { userId, status: 'ACTIVE' } });
  if (activeCount >= MAX_ACTIVE_LOCKS) {
    return { success: false, error: `You already have ${MAX_ACTIVE_LOCKS} active locks. Wait for one to complete before creating another.` };
  }

  // Check unlocked off-chain balance
  const balance = await getUnlockedBalance(userId);
  if (balance < amount) {
    return { success: false, error: `Insufficient unlocked balance. You have ${balance.toFixed(2)} DCC available.` };
  }

  const { rate } = await getBoostedRate(userId);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_DURATION_DAYS * 24 * 60 * 60 * 1000);

  const lock = await prisma.dccLock.create({
    data: {
      userId,
      amount,
      dailyRate: rate,
      startedAt: now,
      expiresAt,
      status: 'ACTIVE',
    },
  });

  await audit({
    actorType: 'user',
    actorId: userId,
    action: 'dcc_locked',
    targetType: 'user',
    targetId: userId,
    metadata: { lockId: lock.id, amount, dailyRate: rate, expiresAt: expiresAt.toISOString() },
  });

  logger.info({ userId, lockId: lock.id, amount, dailyRate: rate }, 'DCC locked');
  await invalidateBalanceCache(userId);
  return { success: true, lockId: lock.id, dailyRate: rate };
}

// ── Get user locks ────────────────────────

export interface LockInfo {
  id: string;
  amount: number;
  earned: number;
  dailyRate: number;
  startedAt: Date;
  expiresAt: Date;
  daysLeft: number;
  status: string;
}

export async function getActiveLocks(userId: string): Promise<LockInfo[]> {
  const locks = await prisma.dccLock.findMany({
    where: { userId, status: 'ACTIVE' },
    orderBy: { startedAt: 'desc' },
  });

  return locks.map((l) => ({
    id: l.id,
    amount: l.amount,
    earned: calculateEarnings(l.amount, l.startedAt, l.dailyRate),
    dailyRate: l.dailyRate,
    startedAt: l.startedAt,
    expiresAt: l.expiresAt,
    daysLeft: daysRemaining(l.expiresAt),
    status: l.status,
  }));
}

export async function getLockSummary(userId: string): Promise<{
  activeLocks: number;
  totalLocked: number;
  totalEarned: number;
  totalCompleted: number;
}> {
  const active = await getActiveLocks(userId);
  const completed = await prisma.dccLock.findMany({
    where: { userId, status: { in: ['COMPLETED', 'WITHDRAWN'] } },
  });

  return {
    activeLocks: active.length,
    totalLocked: active.reduce((s, l) => s + l.amount, 0),
    totalEarned: active.reduce((s, l) => s + l.earned, 0),
    totalCompleted: completed.length,
  };
}

// ── Unlock expired locks ──────────────────

/**
 * Check and finalize any expired locks for a user.
 * Moves earned DCC to unlocked off-chain balance by storing earnedDcc snapshot.
 * Also credits referral commissions to the lock owner's upline (3 tiers).
 * Returns the total DCC unlocked (principal + earnings added to off-chain balance).
 */
export async function finalizeExpiredLocks(userId: string): Promise<number> {
  const now = new Date();
  const expired = await prisma.dccLock.findMany({
    where: { userId, status: 'ACTIVE', expiresAt: { lte: now } },
  });

  if (expired.length === 0) return 0;

  let totalUnlocked = 0;

  for (const lock of expired) {
    const earned = calculateEarnings(lock.amount, lock.startedAt, lock.dailyRate);
    totalUnlocked += lock.amount + earned;

    await prisma.dccLock.update({
      where: { id: lock.id },
      data: { status: 'COMPLETED', earnedDcc: earned, unlockedAt: now },
    });

    // Credit referral commission to upline — non-fatal if this fails
    try {
      await creditLockCommissions(lock.id, userId, earned);
    } catch (err) {
      logger.error({ err, lockId: lock.id, userId }, 'Failed to credit lock commissions');
    }
  }

  await audit({
    actorType: 'system',
    action: 'locks_finalized',
    targetType: 'user',
    targetId: userId,
    metadata: { count: expired.length, totalUnlocked },
  });

  logger.info({ userId, count: expired.length, totalUnlocked }, 'Expired locks finalized');
  await invalidateBalanceCache(userId);
  return totalUnlocked;
}

/**
 * Credit referral commissions on lock earnings to the lock owner's upline.
 * T1 = 10%, T2 = 5%, T3 = 2% of the earned DCC.
 */
async function creditLockCommissions(lockId: string, lockOwnerId: string, earnedDcc: number): Promise<void> {
  if (earnedDcc <= 0) return;

  const upline = await getUpline(lockOwnerId);
  if (upline.length === 0) return;

  for (let i = 0; i < upline.length; i++) {
    const tier = i + 1;
    const commissionRate = LOCK_COMMISSION_RATES[tier];
    if (!commissionRate) break;

    const amount = Math.floor(earnedDcc * commissionRate * 100) / 100;
    if (amount <= 0) continue;

    // Idempotent: one reward per referrer per lock
    const existing = await prisma.lockReferralReward.findUnique({
      where: { userId_lockId: { userId: upline[i], lockId } },
    });
    if (existing) continue;

    await prisma.lockReferralReward.create({
      data: {
        userId: upline[i],
        lockId,
        lockOwnerId,
        tier,
        rate: commissionRate,
        amount,
      },
    });

    logger.info({ referrerId: upline[i], lockOwnerId, lockId, tier, amount }, 'Lock commission credited');
  }
}

// ── Balance helpers ───────────────────────

/**
 * Get the total amount currently locked in active locks.
 */
export async function getLockedAmount(userId: string): Promise<number> {
  const locks = await prisma.dccLock.findMany({
    where: { userId, status: 'ACTIVE' },
  });
  return locks.reduce((s, l) => s + l.amount, 0);
}

/**
 * Get DCC earned from completed locks that is sitting as unlocked off-chain balance.
 * Only counts unredeemed earnings.
 */
export async function getCompletedLockEarnings(userId: string): Promise<number> {
  const completed = await prisma.dccLock.findMany({
    where: { userId, status: { in: ['COMPLETED', 'WITHDRAWN'] }, earningsRedeemed: false },
  });
  return completed.reduce((s, l) => s + l.earnedDcc, 0);
}

/**
 * Get DCC earned as referral commission from other users' locks.
 */
export async function getLockCommissionEarnings(userId: string): Promise<number> {
  const rewards = await prisma.lockReferralReward.findMany({
    where: { userId },
  });
  return rewards.reduce((s, r) => s + r.amount, 0);
}

/**
 * Get the user's unlocked off-chain DCC balance, accounting for active locks.
 * Delegates to the consolidated balance service with Redis caching.
 */
export async function getUnlockedBalance(userId: string): Promise<number> {
  const bal = await getFullBalance(userId);
  return bal.totalAvailable;
}

/**
 * Mark all unredeemed lock earnings as redeemed and return the DCC amount.
 */
export async function markLockEarningsRedeemed(userId: string, txId: string): Promise<number> {
  const unredeemed = await prisma.dccLock.findMany({
    where: { userId, status: { in: ['COMPLETED', 'WITHDRAWN'] }, earningsRedeemed: false, earnedDcc: { gt: 0 } },
  });
  if (unredeemed.length === 0) return 0;

  const amount = unredeemed.reduce((s, l) => s + l.earnedDcc, 0);
  const now = new Date();

  await prisma.$transaction(
    unredeemed.map((l) =>
      prisma.dccLock.update({
        where: { id: l.id },
        data: { earningsRedeemed: true, earningsRedeemedAt: now, earningsRedeemTxId: txId },
      }),
    ),
  );

  await invalidateBalanceCache(userId);
  return amount;
}

/**
 * Mark all unredeemed lock commissions as redeemed and return the DCC amount.
 */
export async function markLockCommissionsRedeemed(userId: string, txId: string): Promise<number> {
  const unredeemed = await prisma.lockReferralReward.findMany({
    where: { userId, redeemed: false },
  });
  if (unredeemed.length === 0) return 0;

  const amount = unredeemed.reduce((s, r) => s + r.amount, 0);
  const now = new Date();

  await prisma.$transaction(
    unredeemed.map((r) =>
      prisma.lockReferralReward.update({
        where: { id: r.id },
        data: { redeemed: true, redeemedAt: now, redeemTxId: txId },
      }),
    ),
  );

  await invalidateBalanceCache(userId);
  return amount;
}
