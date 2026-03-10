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

🎰 *Games Analytics:*
/admin\\_games — Global games dashboard
/admin\\_games\\_leaderboard — Top players & whales
/admin\\_games\\_user <tgId> — Player game profile
/admin\\_games\\_export — CSV game transactions
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Games Analytics — Admin Dashboard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GAME_NAMES: Record<string, string> = {
  slots: '🎰 Slots',
  mines: '💣 Mines',
  crash: '🚀 Crash',
  wheel: '🎡 Wheel',
  hilo: '🃏 Hi-Lo',
  daily_prize: '🎁 Daily',

};

const fmtDcc = (n: number) => n.toFixed(2);

/**
 * /admin_games — Global games analytics dashboard
 */
export async function handleAdminGames(ctx: BotContext): Promise<void> {
  // 1. Global aggregates
  const [globalAgg, uniquePlayers, gameBreakdown, last24hAgg, last7dAgg] = await Promise.all([
    prisma.gameTransaction.aggregate({
      _sum: { betAmount: true, payout: true, profit: true },
      _count: true,
    }),
    prisma.gameTransaction.groupBy({
      by: ['userId'],
      _count: true,
    }),
    prisma.gameTransaction.groupBy({
      by: ['game'],
      _sum: { betAmount: true, payout: true, profit: true },
      _count: true,
      orderBy: { _count: { game: 'desc' } },
    }),
    prisma.gameTransaction.aggregate({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      _sum: { betAmount: true, payout: true, profit: true },
      _count: true,
    }),
    prisma.gameTransaction.aggregate({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      _sum: { betAmount: true, payout: true, profit: true },
      _count: true,
    }),
  ]);

  const totalWagered = globalAgg._sum.betAmount ?? 0;
  const totalPayout = globalAgg._sum.payout ?? 0;
  const totalProfit = globalAgg._sum.profit ?? 0; // Player profit (negative = house won)
  const houseEdge = totalWagered > 0 ? ((-totalProfit / totalWagered) * 100).toFixed(2) : '0.00';
  const totalGames = globalAgg._count;
  const avgBet = totalGames > 0 ? totalWagered / totalGames : 0;

  const h24Bet = last24hAgg._sum.betAmount ?? 0;
  const h24Profit = last24hAgg._sum.profit ?? 0;
  const h24Count = last24hAgg._count;

  const d7Bet = last7dAgg._sum.betAmount ?? 0;
  const d7Profit = last7dAgg._sum.profit ?? 0;
  const d7Count = last7dAgg._count;

  // 2. Per-game breakdown
  const gameLines = gameBreakdown.map((g) => {
    const name = GAME_NAMES[g.game] ?? g.game;
    const wagered = g._sum.betAmount ?? 0;
    const profit = g._sum.profit ?? 0;
    const count = g._count;
    const edge = wagered > 0 ? ((-profit / wagered) * 100).toFixed(1) : '0.0';
    return `│ ${name.padEnd(10)} │ ${String(count).padStart(6)} │ ${fmtDcc(wagered).padStart(11)} │ ${fmtDcc(-profit).padStart(11)} │ ${edge.padStart(5)}% │`;
  }).join('\n');

  // 3. Biggest single wins & losses
  const [biggestWin, biggestLoss] = await Promise.all([
    prisma.gameTransaction.findFirst({
      orderBy: { profit: 'desc' },
      include: { user: { select: { username: true, telegramId: true } } },
    }),
    prisma.gameTransaction.findFirst({
      orderBy: { profit: 'asc' },
      include: { user: { select: { username: true, telegramId: true } } },
    }),
  ]);

  const bigWinLine = biggestWin
    ? `+${fmtDcc(biggestWin.profit)} DCC by ${biggestWin.user.username ? '@' + escapeMarkdown(biggestWin.user.username) : biggestWin.user.telegramId} (${GAME_NAMES[biggestWin.game] ?? biggestWin.game} ${biggestWin.multiplier}x)`
    : 'N/A';
  const bigLossLine = biggestLoss
    ? `${fmtDcc(biggestLoss.profit)} DCC by ${biggestLoss.user.username ? '@' + escapeMarkdown(biggestLoss.user.username) : biggestLoss.user.telegramId} (${GAME_NAMES[biggestLoss.game] ?? biggestLoss.game})`
    : 'N/A';

  // 4. Active players today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const activeTodayResult = await prisma.gameTransaction.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: todayStart } },
  });

  const msg = `
🎰 *GAMES ANALYTICS DASHBOARD*

┌─── 📊 *Global Overview* ───────
│ 🎮 Total Games: *${totalGames.toLocaleString()}*
│ 👤 Unique Players: *${uniquePlayers.length.toLocaleString()}*
│ 👥 Active Today: *${activeTodayResult.length}*
│ ──────────────────
│ 💰 Total Wagered: *${fmtDcc(totalWagered)} DCC*
│ 💸 Total Payouts: *${fmtDcc(totalPayout)} DCC*
│ 🏦 House Revenue: *${fmtDcc(-totalProfit)} DCC*
│ 📈 House Edge: *${houseEdge}%*
│ 📊 Avg Bet: *${fmtDcc(avgBet)} DCC*
└────────────────────────────

┌─── ⏰ *Last 24 Hours* ─────────
│ 🎮 Games: *${h24Count.toLocaleString()}*
│ 💰 Wagered: *${fmtDcc(h24Bet)} DCC*
│ 🏦 Revenue: *${fmtDcc(-h24Profit)} DCC*
└────────────────────────────

┌─── 📅 *Last 7 Days* ──────────
│ 🎮 Games: *${d7Count.toLocaleString()}*
│ 💰 Wagered: *${fmtDcc(d7Bet)} DCC*
│ 🏦 Revenue: *${fmtDcc(-d7Profit)} DCC*
└────────────────────────────

📋 *Per-Game Breakdown:*
┌────────────┬────────┬─────────────┬─────────────┬───────┐
│ Game       │ Played │ Wagered     │ House Rev   │ Edge  │
├────────────┼────────┼─────────────┼─────────────┼───────┤
${gameLines}
└────────────┴────────┴─────────────┴─────────────┴───────┘

🏆 *Records:*
💎 Biggest Win: ${bigWinLine}
💀 Biggest Loss: ${bigLossLine}
`.trim();

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

/**
 * /admin_games_leaderboard — Top players, whales, biggest winners/losers
 */
export async function handleAdminGamesLeaderboard(ctx: BotContext): Promise<void> {
  // Top 10 by volume (whales)
  const topVolume = await prisma.gameTransaction.groupBy({
    by: ['userId'],
    _sum: { betAmount: true, profit: true },
    _count: true,
    orderBy: { _sum: { betAmount: 'desc' } },
    take: 10,
  });

  // Top 10 winners (most profit)
  const topWinners = await prisma.gameTransaction.groupBy({
    by: ['userId'],
    _sum: { profit: true, betAmount: true },
    _count: true,
    orderBy: { _sum: { profit: 'desc' } },
    take: 10,
  });

  // Top 10 losers (most loss = house revenue sources)
  const topLosers = await prisma.gameTransaction.groupBy({
    by: ['userId'],
    _sum: { profit: true, betAmount: true },
    _count: true,
    orderBy: { _sum: { profit: 'asc' } },
    take: 10,
  });

  // Top 10 most active (by game count)
  const topActive = await prisma.gameTransaction.groupBy({
    by: ['userId'],
    _count: true,
    _sum: { betAmount: true },
    orderBy: { _count: { game: 'desc' } },
    take: 10,
  });

  // Resolve all unique user IDs
  const allIds = new Set([
    ...topVolume.map((r) => r.userId),
    ...topWinners.map((r) => r.userId),
    ...topLosers.map((r) => r.userId),
    ...topActive.map((r) => r.userId),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: [...allIds] } },
    select: { id: true, username: true, telegramId: true, firstName: true },
  });
  const uMap = new Map(users.map((u) => [u.id, u]));

  const userName = (id: string) => {
    const u = uMap.get(id);
    if (!u) return id.slice(0, 8);
    return u.username ? '@' + escapeMarkdown(u.username) : escapeMarkdown(u.firstName ?? String(u.telegramId));
  };

  // Format sections
  const whaleLines = topVolume.map((r, i) =>
    `${i + 1}. ${userName(r.userId)} — ${fmtDcc(r._sum.betAmount ?? 0)} wagered (${r._count} games)`,
  ).join('\n');

  const winnerLines = topWinners
    .filter((r) => (r._sum.profit ?? 0) > 0)
    .map((r, i) =>
      `${i + 1}. ${userName(r.userId)} — +${fmtDcc(r._sum.profit ?? 0)} DCC (${r._count} games)`,
    ).join('\n') || '  (no profitable players)';

  const loserLines = topLosers
    .filter((r) => (r._sum.profit ?? 0) < 0)
    .map((r, i) =>
      `${i + 1}. ${userName(r.userId)} — ${fmtDcc(r._sum.profit ?? 0)} DCC (${r._count} games)`,
    ).join('\n') || '  (no losing players)';

  const activeLines = topActive.map((r, i) =>
    `${i + 1}. ${userName(r.userId)} — ${r._count} games (${fmtDcc(r._sum.betAmount ?? 0)} wagered)`,
  ).join('\n');

  const msg = `
🏆 *GAMES LEADERBOARD*

🐋 *Top Whales (Volume):*
${whaleLines || '  (none)'}

💎 *Biggest Winners (Profit):*
${winnerLines}

💀 *Biggest Losers (House Revenue):*
${loserLines}

🔥 *Most Active Players:*
${activeLines || '  (none)'}
`.trim();

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

/**
 * /admin_games_user <telegramId> — Detailed player game profile
 */
export async function handleAdminGamesUser(ctx: BotContext): Promise<void> {
  const text = ctx.message?.text ?? '';
  const parts = text.split(/\s+/);
  const query = sanitize(parts[1] ?? '', 50);

  if (!query) {
    await ctx.reply('Usage: /admin\\_games\\_user <telegramId>', { parse_mode: 'Markdown' });
    return;
  }

  let user = null;
  const asBigInt = BigInt(query).toString() === query ? BigInt(query) : null;
  if (asBigInt) {
    user = await prisma.user.findUnique({ where: { telegramId: asBigInt } });
  }
  if (!user) {
    const wallet = await prisma.wallet.findFirst({ where: { address: query } });
    if (wallet) user = await prisma.user.findUnique({ where: { id: wallet.userId } });
  }

  if (!user) {
    await ctx.reply('User not found.');
    return;
  }

  // Aggregate stats
  const [globalStats, perGame, recentGames, biggestWin, biggestLoss, dailyClaims, firstGame, lastGame] = await Promise.all([
    prisma.gameTransaction.aggregate({
      where: { userId: user.id },
      _sum: { betAmount: true, payout: true, profit: true },
      _count: true,
    }),
    prisma.gameTransaction.groupBy({
      by: ['game'],
      where: { userId: user.id },
      _sum: { betAmount: true, payout: true, profit: true },
      _count: true,
      orderBy: { _count: { game: 'desc' } },
    }),
    prisma.gameTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.gameTransaction.findFirst({
      where: { userId: user.id, profit: { gt: 0 } },
      orderBy: { profit: 'desc' },
    }),
    prisma.gameTransaction.findFirst({
      where: { userId: user.id, profit: { lt: 0 } },
      orderBy: { profit: 'asc' },
    }),
    prisma.gameTransaction.count({
      where: { userId: user.id, game: 'daily_prize' },
    }),
    prisma.gameTransaction.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.gameTransaction.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const total = globalStats._count;
  const wagered = globalStats._sum.betAmount ?? 0;
  const payout = globalStats._sum.payout ?? 0;
  const profit = globalStats._sum.profit ?? 0;
  const avgBet = total > 0 ? wagered / total : 0;
  const returnRate = wagered > 0 ? ((payout / wagered) * 100).toFixed(1) : '0.0';
  const profitSign = profit >= 0 ? '+' : '';

  const displayName = user.username ? '@' + escapeMarkdown(user.username) : escapeMarkdown(user.firstName ?? 'Unknown');

  // Win/loss per game
  const gameLines = perGame.map((g) => {
    const name = GAME_NAMES[g.game] ?? g.game;
    const gProfit = g._sum.profit ?? 0;
    const gSign = gProfit >= 0 ? '+' : '';
    return `│ ${name.padEnd(10)} │ ${String(g._count).padStart(5)} │ ${fmtDcc(g._sum.betAmount ?? 0).padStart(10)} │ ${(gSign + fmtDcc(gProfit)).padStart(10)} │`;
  }).join('\n');

  // Recent games list
  const recentLines = recentGames.map((g) => {
    const name = GAME_NAMES[g.game] ?? g.game;
    const pSign = g.profit >= 0 ? '+' : '';
    const time = g.createdAt.toISOString().slice(5, 16).replace('T', ' ');
    return `  ${time} │ ${name} │ ${fmtDcc(g.betAmount)} → ${pSign}${fmtDcc(g.profit)}`;
  }).join('\n');

  const msg = `
🔍 *PLAYER GAME PROFILE*

👤 ${displayName} (TG: ${user.telegramId})
📅 First game: ${firstGame?.createdAt.toISOString().slice(0, 10) ?? 'N/A'}
📅 Last game: ${lastGame?.createdAt.toISOString().slice(0, 10) ?? 'N/A'}
🎁 Daily prizes claimed: ${dailyClaims}

┌─── 📊 *Overall Stats* ────────
│ 🎮 Total Games: *${total.toLocaleString()}*
│ 💰 Total Wagered: *${fmtDcc(wagered)} DCC*
│ 💸 Total Payouts: *${fmtDcc(payout)} DCC*
│ ${profit >= 0 ? '📈' : '📉'} Net P&L: *${profitSign}${fmtDcc(profit)} DCC*
│ 📊 Avg Bet: *${fmtDcc(avgBet)} DCC*
│ 📈 Return Rate: *${returnRate}%*
│ 💎 Biggest Win: *${biggestWin ? '+' + fmtDcc(biggestWin.profit) + ' DCC (' + (GAME_NAMES[biggestWin.game] ?? biggestWin.game) + ' ' + biggestWin.multiplier + 'x)' : 'N/A'}*
│ 💀 Biggest Loss: *${biggestLoss ? fmtDcc(biggestLoss.profit) + ' DCC (' + (GAME_NAMES[biggestLoss.game] ?? biggestLoss.game) + ')' : 'N/A'}*
└────────────────────────────

📋 *Per-Game Breakdown:*
┌────────────┬───────┬────────────┬────────────┐
│ Game       │ Count │ Wagered    │ P&L        │
├────────────┼───────┼────────────┼────────────┤
${gameLines || '│ (no games played)                        │'}
└────────────┴───────┴────────────┴────────────┘

🕐 *Recent Activity:*
${recentLines || '  (no games)'}
`.trim();

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

/**
 * /admin_games_export — CSV export of all game transactions
 */
export async function handleAdminGamesExport(ctx: BotContext): Promise<void> {
  const count = await prisma.gameTransaction.count();

  if (count === 0) {
    await ctx.reply('No game transactions to export.');
    return;
  }

  if (count > 50000) {
    await ctx.reply(`⚠️ ${count.toLocaleString()} transactions — exporting last 50,000.`);
  }

  const txns = await prisma.gameTransaction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50000,
    include: { user: { select: { telegramId: true, username: true } } },
  });

  const header = 'id,telegramId,username,game,betAmount,payout,profit,multiplier,createdAt';
  const rows = txns.map((t) => [
    t.id,
    t.user.telegramId.toString(),
    t.user.username ?? '',
    t.game,
    t.betAmount.toFixed(2),
    t.payout.toFixed(2),
    t.profit.toFixed(2),
    t.multiplier.toFixed(2),
    t.createdAt.toISOString(),
  ].join(','));

  const csv = [header, ...rows].join('\n');

  await ctx.replyWithDocument(
    new InputFile(Buffer.from(csv, 'utf-8'), `game_transactions_${new Date().toISOString().slice(0, 10)}.csv`),
  );

  await ctx.reply(`✅ Exported ${txns.length.toLocaleString()} game transactions.`);
}
