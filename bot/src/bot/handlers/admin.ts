// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin Command Handlers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// All admin handlers are behind the requireAdmin middleware.
// Admin IDs are allowlisted in ADMIN_TELEGRAM_IDS.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import { InputFile } from 'grammy';
import prisma from '../../db/prisma';
import { getUserStats } from '../../services/users';
import { getGlobalReferralStats } from '../../services/referrals';
import { setClaimLive, isClaimLive } from '../../services/claims';
import { invalidateCache, getUserTrackerState, getWalletBalances, getCurrentHeight } from '../../services/blockchain';
import { evaluateEligibility } from '../../services/eligibility';
import { sanitize, escapeMarkdown } from '../../utils/validation';
import { audit } from '../../utils/audit';

/**
 * /admin — show admin panel summary
 */
export async function handleAdmin(ctx: BotContext): Promise<void> {
  const claimLive = await isClaimLive();
  const msg = `
🔧 *Admin Panel*

Claim Live: ${claimLive ? '✅ YES' : '❌ NO'}

Commands:
/admin\\_stats — Campaign statistics
/admin\\_user <tgId or wallet> — Inspect user
/admin\\_referrals — Global referral stats
/admin\\_sync\\_wallet <wallet> — Refresh cache
/admin\\_set\\_claim\\_live true|false
/admin\\_export\\_allocations — CSV export
`.trim();

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

/**
 * /admin_stats
 */
export async function handleAdminStats(ctx: BotContext): Promise<void> {
  const [userStats, refStats, claimCount, snapshotCount] = await Promise.all([
    getUserStats(),
    getGlobalReferralStats(),
    prisma.claimRecord.count({ where: { status: 'CONFIRMED' } }),
    prisma.eligibilitySnapshot.count(),
  ]);

  const msg = `
📊 *Campaign Stats*

👤 Total Users: ${userStats.totalUsers}
✅ Verified Wallets: ${userStats.verifiedUsers}
👥 Users with Referrals: ${userStats.usersWithReferrals}

🔗 Total Referral Events: ${refStats.totalReferralEvents}
💎 Rewards Issued: ${refStats.totalRewardsIssued}
💰 Total Reward Amount: ${refStats.totalRewardAmount} DCC

📋 Claims Confirmed: ${claimCount}
📸 Eligibility Snapshots: ${snapshotCount}
`.trim();

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

/**
 * /admin_user <telegramId | walletAddress>
 */
export async function handleAdminUser(ctx: BotContext): Promise<void> {
  const text = ctx.message?.text ?? '';
  const parts = text.split(/\s+/);
  const query = sanitize(parts[1] ?? '', 50);

  if (!query) {
    await ctx.reply('Usage: /admin_user <telegramId or walletAddress>');
    return;
  }

  // Try to find by telegram ID first
  let user = null;
  const asBigInt = BigInt(query).toString() === query ? BigInt(query) : null;
  if (asBigInt) {
    user = await prisma.user.findUnique({ where: { telegramId: asBigInt } });
  }

  // Otherwise search by wallet address
  let wallet = null;
  if (!user) {
    wallet = await prisma.wallet.findFirst({ where: { address: query } });
    if (wallet) {
      user = await prisma.user.findUnique({ where: { id: wallet.userId } });
    }
  }

  if (!user) {
    await ctx.reply('User not found.');
    return;
  }

  // Fetch wallets
  const wallets = await prisma.wallet.findMany({ where: { userId: user.id } });
  const referrals = await prisma.referralEvent.count({ where: { referrerUserId: user.id } });
  const claims = await prisma.claimRecord.findMany({ where: { userId: user.id } });

  const walletLines = wallets
    .map((w) => `  • \`${w.address}\` ${w.isVerified ? '✅' : '⏳'}`)
    .join('\n');

  const msg = `
🔍 *User Inspect*

ID: ${user.id}
Telegram: ${user.telegramId}
Username: @${escapeMarkdown(user.username ?? 'none')}
Name: ${escapeMarkdown((user.firstName ?? '') + ' ' + (user.lastName ?? '')).trim()}
Admin: ${user.isAdmin ? 'Yes' : 'No'}
Referral Code: \`${user.referralCode}\`
Referred By: ${user.referredByUserId ?? 'none'}
Referrals Made: ${referrals}
Claims: ${claims.length}
Created: ${user.createdAt.toISOString()}

*Wallets:*
${walletLines || '  (none)'}
`.trim();

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

/**
 * /admin_referrals
 */
export async function handleAdminReferrals(ctx: BotContext): Promise<void> {
  const stats = await getGlobalReferralStats();

  // Top referrers
  const topReferrers = await prisma.referralEvent.groupBy({
    by: ['referrerUserId'],
    _count: true,
    orderBy: { _count: { referrerUserId: 'desc' } },
    take: 10,
  });

  const userIds = topReferrers.map((row) => row.referrerUserId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, firstName: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const lines: string[] = [];
  for (const row of topReferrers) {
    const user = userMap.get(row.referrerUserId);
    const name = user?.username ? `@${escapeMarkdown(user.username)}` : (user?.firstName ? escapeMarkdown(user.firstName) : row.referrerUserId);
    lines.push(`  ${name}: ${row._count} referrals`);
  }

  const msg = `
👥 *Global Referral Stats*

Total Events: ${stats.totalReferralEvents}
Rewards Issued: ${stats.totalRewardsIssued}
Total Amount: ${stats.totalRewardAmount} DCC

*Top Referrers:*
${lines.join('\n') || '  (none)'}
`.trim();

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

/**
 * /admin_sync_wallet <address>
 */
export async function handleAdminSyncWallet(ctx: BotContext): Promise<void> {
  const text = ctx.message?.text ?? '';
  const parts = text.split(/\s+/);
  const address = sanitize(parts[1] ?? '', 50);

  if (!address) {
    await ctx.reply('Usage: /admin_sync_wallet <walletAddress>');
    return;
  }

  await invalidateCache(address);

  // Fetch fresh data
  const [tracker, balances, currentHeight] = await Promise.all([
    getUserTrackerState(address),
    getWalletBalances(address),
    getCurrentHeight(),
  ]);

  const elig = evaluateEligibility({ tracker, balances, currentHeight });

  await ctx.reply(
    `🔄 Cache cleared for \`${address}\`\n\n`
    + `Eligible: ${elig.eligible ? '✅' : '❌'}\n`
    + `Progress: ${elig.completedCount}/${elig.totalCount}\n`
    + `Pools: ${tracker.poolCount}, Swaps: ${tracker.swapCount}, dApps: ${tracker.dappCount}\n`
    + `stDCC: ${balances.stDCCBalance.toString()}`,
    { parse_mode: 'Markdown' },
  );
}

/**
 * /admin_set_claim_live true|false
 */
export async function handleAdminSetClaimLive(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  const text = ctx.message?.text ?? '';
  const parts = text.split(/\s+/);
  const val = parts[1]?.toLowerCase();

  if (val !== 'true' && val !== 'false') {
    await ctx.reply('Usage: /admin_set_claim_live true|false');
    return;
  }

  const live = val === 'true';
  await setClaimLive(live, ctx.dbUser.id);
  await audit({
    actorType: 'admin',
    actorId: ctx.dbUser.id,
    action: 'claim_live_toggled',
    metadata: { claimLive: live },
  });
  await ctx.reply(`Claim Live set to: ${live ? '✅ TRUE' : '❌ FALSE'}`);
}

/**
 * /admin_export_allocations — export a CSV of all verified users
 */
export async function handleAdminExportAllocations(ctx: BotContext): Promise<void> {
  const verifiedWallets = await prisma.wallet.findMany({
    where: { isVerified: true },
    include: { user: true },
  });

  if (verifiedWallets.length === 0) {
    await ctx.reply('No verified wallets to export.');
    return;
  }

  const header = 'telegramId,username,walletAddress,referralCode,createdAt';
  const rows = verifiedWallets.map((w) => {
    const u = w.user;
    return [
      u.telegramId.toString(),
      u.username ?? '',
      w.address,
      u.referralCode,
      u.createdAt.toISOString(),
    ].join(',');
  });

  const csv = [header, ...rows].join('\n');

  await ctx.replyWithDocument(
    new InputFile(Buffer.from(csv, 'utf-8'), `allocations_${new Date().toISOString().slice(0, 10)}.csv`),
  );
}
