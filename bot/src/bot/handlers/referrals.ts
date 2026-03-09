// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Referral Handlers — Multi-Level
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import {
  referralStatsMessage,
  referralLinkMessage,
  referralTreeMessage,
  referralLeaderboardMessage,
  REFERRAL_RULES,
} from '../messages';
import {
  referralsMenuKeyboard,
  backToReferralsKeyboard,
} from '../keyboards';
import { editOrReply } from '../utils';
import { getReferralStats, getReferralTree } from '../../services/referrals';
import { config } from '../../config';
import prisma from '../../db/prisma';

const MD = { parse_mode: 'Markdown' as const };

/**
 * Referrals submenu.
 */
export async function handleReferralsMenu(ctx: BotContext): Promise<void> {
  await editOrReply(
    ctx,
    '👥 *Multi-Level Referral Program*\n\nEarn rewards across 3 tiers by growing your network!',
    { ...MD, reply_markup: referralsMenuKeyboard() },
  );
}

/**
 * Show referral link with multi-tier info.
 */
export async function handleReferralLink(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  const stats = await getReferralStats(ctx.dbUser.id);
  await editOrReply(ctx, referralLinkMessage(stats), { ...MD, reply_markup: backToReferralsKeyboard() });
}

/**
 * Show multi-tier referral stats dashboard.
 */
export async function handleReferralStats(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  const stats = await getReferralStats(ctx.dbUser.id);
  await editOrReply(ctx, referralStatsMessage(stats), { ...MD, reply_markup: backToReferralsKeyboard() });
}

/**
 * Show referral tree visualization.
 */
export async function handleReferralTree(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  const tree = await getReferralTree(ctx.dbUser.id);
  await editOrReply(ctx, referralTreeMessage(tree), { ...MD, reply_markup: backToReferralsKeyboard() });
}

/**
 * Show referral leaderboard.
 */
export async function handleReferralLeaderboard(ctx: BotContext): Promise<void> {
  // Top 10 referrers by total reward amount
  const topUsers = await prisma.referralReward.groupBy({
    by: ['userId'],
    where: { status: { not: 'CANCELLED' } },
    _sum: { amount: true },
    _count: { id: true },
    orderBy: { _sum: { amount: 'desc' } },
    take: 10,
  });

  const userIds = topUsers.map((row) => row.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u.username]));

  const entries = topUsers.map((row, idx) => ({
    rank: idx + 1,
    username: userMap.get(row.userId) ?? null,
    count: row._count.id,
    earned: row._sum.amount ?? 0,
  }));

  await editOrReply(ctx, referralLeaderboardMessage(entries), { ...MD, reply_markup: backToReferralsKeyboard() });
}

/**
 * Show tier rewards breakdown.
 */
export async function handleReferralRewards(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  const stats = await getReferralStats(ctx.dbUser.id);

  const tierLines = stats.tiers.map((t) => {
    const emoji = t.tier === 1 ? '🥇' : t.tier === 2 ? '🥈' : '🥉';
    const bonus = t.tier === 1 ? config.REFERRAL_TIER1_BONUS
      : t.tier === 2 ? config.REFERRAL_TIER2_BONUS : config.REFERRAL_TIER3_BONUS;
    return `${emoji} *Tier ${t.tier}:* ${bonus} DCC/ref · Earned: ${t.rewardAmount} DCC (${t.eligible} eligible)`;
  });

  const capPerTier = config.MAX_REFERRAL_REWARDS_PER_TIER;

  const msg = `
💎 *Tier Rewards*

${tierLines.join('\n')}

━━━━━━━━━━━━━━━━━━━
💰 *Total Earned:* ${stats.totalRewardAmount} DCC
📏 Cap: ${capPerTier} rewards per tier
`.trim();

  await editOrReply(ctx, msg, { ...MD, reply_markup: backToReferralsKeyboard() });
}

/**
 * Show referral rules.
 */
export async function handleReferralRules(ctx: BotContext): Promise<void> {
  await editOrReply(ctx, REFERRAL_RULES, { ...MD, reply_markup: backToReferralsKeyboard() });
}
