// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Referral Service — Multi-level referral lifecycle
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Multi-level referral lifecycle:
//   1. PENDING   — referred user joined via referral link
//   2. WALLET_CONNECTED — referred user connected a wallet
//   3. WALLET_VERIFIED  — referred user's wallet verified
//   4. ELIGIBLE  — referred user became airdrop-eligible
//   5. REWARDED  — referral bonuses credited to all upline tiers
//   6. REJECTED  — referral rejected (abuse, self-referral, etc.)
//
// When a user joins via a referral code, a tier-1 event is created
// for the direct referrer. Additionally, tier-2 and tier-3 (etc.)
// events are created for ancestors up the referral chain, up to
// REFERRAL_MAX_DEPTH.
//
// Anti-abuse:
//   - No self-referrals
//   - No circular referral chains
//   - One referred user → one direct referrer
//   - Referral reward cap per tier per user
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import prisma from '../../db/prisma';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { audit } from '../../utils/audit';
import { invalidateBalanceCache } from '../balance';
import type { ReferralStatus } from '@prisma/client';
import type { ReferralStats, TierStats, ReferralTreeNode } from '../../types';

// ── Tier bonus lookup ──────────────────────

function tierBonus(tier: number): number {
  switch (tier) {
    case 1: return config.REFERRAL_TIER1_BONUS;
    case 2: return config.REFERRAL_TIER2_BONUS;
    case 3: return config.REFERRAL_TIER3_BONUS;
    default: return 0;
  }
}

// ── Upline walker ──────────────────────────

/**
 * Walk up the referral chain from a userId, returning an ordered list
 * of ancestor user IDs: [directReferrer, grandReferrer, …].
 * Stops at REFERRAL_MAX_DEPTH or when the chain ends.
 */
export async function getUpline(userId: string): Promise<string[]> {
  const upline: string[] = [];
  let currentId: string | null = userId;
  const seen = new Set<string>();

  for (let depth = 0; depth < config.REFERRAL_MAX_DEPTH; depth++) {
    const row: { referredByUserId: string | null } | null = await prisma.user.findUnique({
      where: { id: currentId! },
      select: { referredByUserId: true },
    });
    if (!row?.referredByUserId) break;
    // Circular chain protection
    if (seen.has(row.referredByUserId)) break;
    seen.add(row.referredByUserId);
    upline.push(row.referredByUserId);
    currentId = row.referredByUserId;
  }
  return upline;
}

// ── Record referral attempt ────────────────

/**
 * Record a referral attempt when a new user joins via /start with a referral code.
 * Creates tier-1 event for the direct referrer, and tier-2..N events for the upline.
 */
export async function recordReferralAttempt(
  referrerCode: string,
  referredUserId: string,
): Promise<{ success: boolean; error?: string; referrerUserId?: string }> {
  const referrer = await prisma.user.findUnique({ where: { referralCode: referrerCode } });
  if (!referrer) {
    return { success: false, error: 'Invalid referral code.' };
  }

  if (referrer.id === referredUserId) {
    logger.warn({ referredUserId }, 'Self-referral attempt blocked');
    return { success: false, error: 'Self-referrals are not allowed.' };
  }

  // Check if referred user already has a direct referrer
  const existingDirect = await prisma.referralEvent.findFirst({
    where: { referredUserId, tier: 1 },
  });
  if (existingDirect) {
    return { success: false, error: 'Already referred by another user.' };
  }

  // Link referred user → direct referrer
  await prisma.user.update({
    where: { id: referredUserId },
    data: { referredByUserId: referrer.id },
  });

  // Build upline: direct referrer + their ancestors
  const ancestors = await getUpline(referredUserId); // [referrer, grandReferrer, …]

  // Create events for each tier up the chain
  const creates = ancestors.map((ancestorId, idx) => {
    const tier = idx + 1;
    return prisma.referralEvent.create({
      data: {
        referrerUserId: ancestorId,
        referredUserId,
        code: referrerCode,
        tier,
        status: 'PENDING',
      },
    });
  });

  await prisma.$transaction(creates);

  await audit({
    actorType: 'user',
    actorId: referredUserId,
    action: 'referral_recorded',
    targetType: 'user',
    targetId: referrer.id,
    metadata: { code: referrerCode, tiers: ancestors.length },
  });

  return { success: true, referrerUserId: referrer.id };
}

// ── Advance referral status ────────────────

const STATUS_ORDER: ReferralStatus[] = [
  'PENDING',
  'WALLET_CONNECTED',
  'WALLET_VERIFIED',
  'ELIGIBLE',
  'REWARDED',
];

/**
 * Advance referral status for ALL tier events that reference this referred user.
 * When reaching ELIGIBLE, credits tiered rewards to every ancestor.
 */
export async function advanceReferralStatus(
  referredUserId: string,
  newStatus: ReferralStatus,
): Promise<void> {
  const events = await prisma.referralEvent.findMany({
    where: { referredUserId, status: { notIn: ['REJECTED', 'REWARDED'] } },
  });
  if (events.length === 0) return;

  const newIdx = STATUS_ORDER.indexOf(newStatus);

  for (const event of events) {
    const currentIdx = STATUS_ORDER.indexOf(event.status);
    if (newIdx <= currentIdx) continue;

    await prisma.referralEvent.update({
      where: { id: event.id },
      data: { status: newStatus },
    });

    if (newStatus === 'ELIGIBLE') {
      await creditTieredReward(event.referrerUserId, event.id, event.tier);
    }
  }

  logger.info(
    { referredUserId, tiers: events.map((e) => e.tier), to: newStatus },
    'Referral status advanced for all tiers',
  );
}

// ── Credit tiered rewards ──────────────────

async function creditTieredReward(
  referrerUserId: string,
  referralEventId: string,
  tier: number,
): Promise<void> {
  const bonus = tierBonus(tier);
  if (bonus <= 0) return;

  // Idempotent: check for existing reward
  const existing = await prisma.referralReward.findFirst({
    where: { sourceReferralEventId: referralEventId, userId: referrerUserId },
  });
  if (existing) return;

  // Tier-specific cap
  const tierRewards = await prisma.referralReward.count({
    where: { userId: referrerUserId, tier, status: { not: 'CANCELLED' } },
  });
  if (tierRewards >= config.MAX_REFERRAL_REWARDS_PER_TIER) {
    logger.info({ referrerUserId, tier }, 'Referral reward cap reached for tier');
    return;
  }

  await prisma.referralReward.create({
    data: {
      userId: referrerUserId,
      sourceReferralEventId: referralEventId,
      rewardType: 'referral_bonus',
      tier,
      amount: bonus,
      status: 'CREDITED',
    },
  });

  await audit({
    actorType: 'system',
    action: 'referral_reward_credited',
    targetType: 'user',
    targetId: referrerUserId,
    metadata: { referralEventId, tier, amount: bonus },
  });
}

// ── Referral stats ─────────────────────────

export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const events = await prisma.referralEvent.findMany({
    where: { referrerUserId: userId },
  });

  const rewardRows = await prisma.referralReward.findMany({
    where: { userId, status: { not: 'CANCELLED' } },
  });

  // Build per-tier stats
  const tiersMap = new Map<number, TierStats>();
  for (let t = 1; t <= config.REFERRAL_MAX_DEPTH; t++) {
    tiersMap.set(t, { tier: t, referred: 0, verified: 0, eligible: 0, rewardAmount: 0 });
  }

  for (const e of events) {
    const ts = tiersMap.get(e.tier);
    if (!ts) continue;
    ts.referred++;
    if (['WALLET_VERIFIED', 'ELIGIBLE', 'REWARDED'].includes(e.status)) ts.verified++;
    if (['ELIGIBLE', 'REWARDED'].includes(e.status)) ts.eligible++;
  }

  for (const r of rewardRows) {
    const ts = tiersMap.get(r.tier);
    if (ts) ts.rewardAmount += r.amount;
  }

  const tiers = Array.from(tiersMap.values());

  const totalReferred = tiers.reduce((s, t) => s + t.referred, 0);
  const verifiedReferred = tiers.reduce((s, t) => s + t.verified, 0);
  const eligibleReferred = tiers.reduce((s, t) => s + t.eligible, 0);
  const totalRewardAmount = tiers.reduce((s, t) => s + t.rewardAmount, 0);

  // Network size: distinct referred users where this user appears in the upline
  const networkSize = await prisma.referralEvent.count({
    where: { referrerUserId: userId },
  });
  const activeNetworkSize = await prisma.referralEvent.count({
    where: {
      referrerUserId: userId,
      status: { in: ['WALLET_VERIFIED', 'ELIGIBLE', 'REWARDED'] },
    },
  });

  return {
    referralCode: user.referralCode,
    referralLink: `https://t.me/${config.BOT_USERNAME}?start=${user.referralCode}`,
    totalReferred,
    verifiedReferred,
    eligibleReferred,
    totalRewardAmount,
    tiers,
    maxDepth: config.REFERRAL_MAX_DEPTH,
    networkSize,
    activeNetworkSize,
  };
}

// ── Referral tree ──────────────────────────

/**
 * Build a downline tree for a user (max 2 levels deep for display).
 */
export async function getReferralTree(
  userId: string,
  maxDisplayDepth = 2,
): Promise<ReferralTreeNode[]> {
  async function buildChildren(parentId: string, depth: number): Promise<ReferralTreeNode[]> {
    if (depth >= maxDisplayDepth) return [];

    const events = await prisma.referralEvent.findMany({
      where: { referrerUserId: parentId, tier: 1 },
      include: {
        referredUser: { select: { telegramId: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const nodes: ReferralTreeNode[] = [];
    for (const e of events) {
      const children = await buildChildren(e.referredUserId, depth + 1);
      nodes.push({
        telegramId: e.referredUser.telegramId.toString(),
        username: e.referredUser.username,
        tier: depth + 1,
        status: e.status,
        joinedAt: e.createdAt,
        children,
      });
    }
    return nodes;
  }

  return buildChildren(userId, 0);
}

// ── Admin: global referral stats ───────────

export async function getGlobalReferralStats(): Promise<{
  totalReferralEvents: number;
  totalRewardsIssued: number;
  totalRewardAmount: number;
}> {
  const [totalEvents, rewardAgg] = await Promise.all([
    prisma.referralEvent.count(),
    prisma.referralReward.aggregate({
      where: { status: { not: 'CANCELLED' } },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  return {
    totalReferralEvents: totalEvents,
    totalRewardsIssued: rewardAgg._count,
    totalRewardAmount: rewardAgg._sum.amount ?? 0,
  };
}

// ── Invite rewards (instant 1 DCC per invite) ───

/**
 * Credit 1 DCC invite reward to the direct referrer when a new user starts the bot.
 * Idempotent — won't double-credit for the same invited user.
 */
export async function creditInviteReward(
  referrerUserId: string,
  invitedUserId: string,
): Promise<boolean> {
  const existing = await prisma.inviteReward.findUnique({
    where: { userId_invitedUserId: { userId: referrerUserId, invitedUserId } },
  });
  if (existing) return false;

  await prisma.inviteReward.create({
    data: {
      userId: referrerUserId,
      invitedUserId,
      amount: 1,
    },
  });

  await audit({
    actorType: 'system',
    action: 'invite_reward_credited',
    targetType: 'user',
    targetId: referrerUserId,
    metadata: { invitedUserId, amount: 1 },
  });

  await invalidateBalanceCache(referrerUserId);

  logger.info({ referrerUserId, invitedUserId }, 'Invite reward credited (1 DCC)');
  return true;
}

/**
 * Get the invite reward balance for a user:
 * total earned, total redeemed, and available to redeem.
 */
export async function getInviteBalance(userId: string): Promise<{
  total: number;
  redeemed: number;
  available: number;
}> {
  const rewards = await prisma.inviteReward.findMany({ where: { userId } });
  const total = rewards.reduce((s, r) => s + r.amount, 0);
  const redeemed = rewards.filter((r) => r.redeemed).reduce((s, r) => s + r.amount, 0);
  return { total, redeemed, available: total - redeemed };
}

/**
 * Mark all unredeemed invite rewards as redeemed and return the amount.
 * Returns 0 if nothing to redeem.
 */
export async function markInviteRewardsRedeemed(
  userId: string,
  txId: string,
): Promise<number> {
  const unredeemed = await prisma.inviteReward.findMany({
    where: { userId, redeemed: false },
  });
  if (unredeemed.length === 0) return 0;

  const amount = unredeemed.reduce((s, r) => s + r.amount, 0);
  const now = new Date();

  await prisma.$transaction(
    unredeemed.map((r) =>
      prisma.inviteReward.update({
        where: { id: r.id },
        data: { redeemed: true, redeemedAt: now, redeemTxId: txId },
      }),
    ),
  );

  await audit({
    actorType: 'user',
    actorId: userId,
    action: 'invite_rewards_redeemed',
    targetType: 'user',
    targetId: userId,
    metadata: { amount, txId, count: unredeemed.length },
  });

  await invalidateBalanceCache(userId);

  return amount;
}
