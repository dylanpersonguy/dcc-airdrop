// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Activity History — Unified transaction log
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import { backToMainKeyboard, paginationKeyboard } from '../keyboards';
import { editOrReply } from '../utils';
import prisma from '../../db/prisma';

interface ActivityEntry {
  date: Date;
  icon: string;
  label: string;
}

const PAGE_SIZE = 10;

export async function handleHistory(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  // Extract page from callback data (e.g. "history_page_2")
  const data = ctx.callbackQuery?.data ?? '';
  const pageMatch = data.match(/history_page_(\d+)/);
  const page = pageMatch ? parseInt(pageMatch[1], 10) : 1;

  const userId = ctx.dbUser.id;

  const [purchases, locks, deposits, inviteRewards, commissions] = await Promise.all([
    prisma.dccPurchase.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { createdAt: true, token: true, dccAmount: true, status: true },
    }),
    prisma.dccLock.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { createdAt: true, amount: true, status: true, earnedDcc: true, unlockedAt: true },
    }),
    prisma.dccDeposit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { createdAt: true, amount: true },
    }),
    prisma.inviteReward.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { createdAt: true, amount: true, redeemed: true },
    }),
    prisma.lockReferralReward.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { createdAt: true, amount: true, tier: true, redeemed: true },
    }),
  ]);

  const entries: ActivityEntry[] = [];

  for (const p of purchases) {
    const statusIcon = p.status === 'COMPLETED' ? '✅' : p.status === 'FAILED' ? '❌' : '⏳';
    entries.push({ date: p.createdAt, icon: '💳', label: `Buy ${p.dccAmount} DCC (${p.token}) ${statusIcon}` });
  }
  for (const l of locks) {
    if (l.status === 'ACTIVE') {
      entries.push({ date: l.createdAt, icon: '🔒', label: `Locked ${l.amount} DCC` });
    } else {
      entries.push({ date: l.unlockedAt ?? l.createdAt, icon: '🔓', label: `Unlocked ${l.amount} DCC (+${l.earnedDcc.toFixed(2)} earned)` });
    }
  }
  for (const d of deposits) {
    entries.push({ date: d.createdAt, icon: '📥', label: `Deposited ${d.amount.toFixed(2)} DCC` });
  }
  for (const r of inviteRewards) {
    entries.push({ date: r.createdAt, icon: '🎁', label: `Invite reward: ${r.amount} DCC${r.redeemed ? ' (redeemed)' : ''}` });
  }
  for (const c of commissions) {
    entries.push({ date: c.createdAt, icon: '💎', label: `T${c.tier} commission: ${c.amount.toFixed(2)} DCC${c.redeemed ? ' (redeemed)' : ''}` });
  }

  // Sort newest first, paginate
  entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  const totalEntries = entries.length;
  const start = (page - 1) * PAGE_SIZE;
  const top = entries.slice(start, start + PAGE_SIZE);
  const hasMore = start + PAGE_SIZE < totalEntries;

  if (top.length === 0) {
    await editOrReply(ctx, `
📜 *Activity History*

No activity yet. Start by buying or earning DCC!
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: backToMainKeyboard(),
    });
    return;
  }

  const lines = top.map((e) => {
    const d = e.date;
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
    return `${e.icon} \`${dateStr}\` ${e.label}`;
  });

  await editOrReply(ctx, `
📜 *Activity History* (page ${page})

${lines.join('\n')}
  `.trim(), {
    parse_mode: 'Markdown' as const,
    reply_markup: paginationKeyboard('history', page, hasMore, 'main_menu'),
  });
}
