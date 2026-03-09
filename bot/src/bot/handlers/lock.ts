// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Lock Handler — Lock off-chain DCC for 3% daily
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import { setSession, getSession, clearSession } from '../middleware';
import { backToMainKeyboard } from '../keyboards';
import { lockMenuKeyboard, lockConfirmKeyboard, backToLockKeyboard, afterLockKeyboard, lockAmountPickerKeyboard } from '../keyboards';
import { editOrReply } from '../utils';
import {
  getActiveLocks,
  getLockSummary,
  getUnlockedBalance,
  createLock,
  getBoostedRate,
  BOOST_TIERS,
  MIN_LOCK_AMOUNT,
  MAX_LOCK_AMOUNT,
  MAX_ACTIVE_LOCKS,
  LOCK_DURATION_DAYS,
  DAILY_RATE,
} from '../../services/locks';
import { getUserWallet } from '../../services/wallet';
import { getCachedBalances } from '../../services/blockchain';
import { WAVELETS_PER_DCC } from '../../config/constants';

// ── Lock dashboard ────────────────────────

export async function handleLock(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const wallet = await getUserWallet(ctx.dbUser.id);
  const [summary, unlocked, boost, onChain] = await Promise.all([
    getLockSummary(ctx.dbUser.id),
    getUnlockedBalance(ctx.dbUser.id),
    getBoostedRate(ctx.dbUser.id),
    wallet ? getCachedBalances(wallet.address) : Promise.resolve({ dccBalance: BigInt(0), stDCCBalance: BigInt(0) }),
  ]);

  const onChainDCC = Number(onChain.dccBalance) / WAVELETS_PER_DCC;
  const dailyEarn = summary.totalLocked * boost.rate;
  const rateDisplay = (boost.rate * 100).toFixed(1);
  const nextTierLine = boost.nextTier
    ? `\n│ 🎯 Next: ${(boost.nextTier.rate * 100).toFixed(1)}% at ${boost.nextTier.minRefs} referrals`
    : '';

  const canLock = unlocked >= MIN_LOCK_AMOUNT && summary.activeLocks < MAX_ACTIVE_LOCKS;

  // Show on-chain balance info and deposit hint if user has on-chain DCC but low off-chain
  let onChainHint = '';
  if (onChainDCC > 0 && unlocked < MIN_LOCK_AMOUNT) {
    onChainHint = `\n\n💡 You have *${onChainDCC.toFixed(2)} DCC on-chain*! Use /deposit to move it to your off-chain balance, then lock it to start earning.`;
  } else if (onChainDCC > 0) {
    onChainHint = `\n\n💡 You also have *${onChainDCC.toFixed(2)} DCC on-chain*. Use /deposit to add it to your lockable balance.`;
  }

  // Guidance when balance is too low
  let lowBalanceHint = '';
  if (unlocked < MIN_LOCK_AMOUNT && onChainDCC <= 0) {
    lowBalanceHint = `\n\n💡 You need at least *${MIN_LOCK_AMOUNT} DCC* to create a lock.\n💳 /buy — Purchase DCC ($0.15/DCC)\n👥 /referrals — Earn 1 DCC per invite`;
  }

  await editOrReply(ctx, `
🔒 *DCC Lock — ${rateDisplay}% Daily Rewards*

┌─────────────────────────
│ 🔓 Unlocked: *${unlocked.toFixed(2)} DCC*
│ 🔒 Locked: *${summary.totalLocked.toFixed(2)} DCC*
│ 💰 Earned: *${summary.totalEarned.toFixed(2)} DCC*
│ 📈 Daily Earnings: *${dailyEarn.toFixed(2)} DCC/day*${onChainDCC > 0 ? `\n│ 🔗 On-Chain: *${onChainDCC.toFixed(2)} DCC*` : ''}
│ ──────────────────
│ 👥 Referrals: *${boost.referralCount}*
│ 📊 Your Rate: *${rateDisplay}% daily*${nextTierLine}
└─────────────────────────

📋 Active Locks: *${summary.activeLocks}/${MAX_ACTIVE_LOCKS}*
✅ Completed Locks: *${summary.totalCompleted}*

Lock *${MIN_LOCK_AMOUNT}–${MAX_LOCK_AMOUNT.toLocaleString()} DCC* for *${LOCK_DURATION_DAYS} days* at *${rateDisplay}% daily*.${onChainHint}${lowBalanceHint}
  `.trim(), {
    parse_mode: 'Markdown' as const,
    reply_markup: lockMenuKeyboard(canLock),
  });
}

// ── View active locks ─────────────────────

export async function handleLockList(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const locks = await getActiveLocks(ctx.dbUser.id);

  if (locks.length === 0) {
    const { rate } = await getBoostedRate(ctx.dbUser.id);
    await editOrReply(ctx, `
🔒 *Active Locks*

No active locks. Lock your DCC to start earning ${(rate * 100).toFixed(1)}% daily!
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLockKeyboard(),
    });
    return;
  }

  const lines = locks.map((l, i) => {
    const elapsed = LOCK_DURATION_DAYS - l.daysLeft;
    const pct = Math.round((elapsed / LOCK_DURATION_DAYS) * 100);
    const barLen = 10;
    const filled = Math.round((elapsed / LOCK_DURATION_DAYS) * barLen);
    const bar = '▓'.repeat(filled) + '░'.repeat(barLen - filled);
    const totalProjected = Math.floor(l.amount * l.dailyRate * LOCK_DURATION_DAYS * 100) / 100;
    return [
      `*Lock #${i + 1}*`,
      `├ Amount: ${l.amount.toFixed(2)} DCC`,
      `├ Earned: ${l.earned.toFixed(2)} / ~${totalProjected.toFixed(2)} DCC`,
      `├ Rate: ${(l.dailyRate * 100).toFixed(1)}%/day (${(l.amount * l.dailyRate).toFixed(2)}/day)`,
      `├ ${bar} ${pct}%`,
      `└ ${l.daysLeft}d remaining · Unlocks ${l.expiresAt.toLocaleDateString()}`,
    ].join('\n');
  });

  await editOrReply(ctx, `
🔒 *Active Locks (${locks.length})*

${lines.join('\n\n')}
  `.trim(), {
    parse_mode: 'Markdown' as const,
    reply_markup: backToLockKeyboard(),
  });
}

// ── Start new lock → ask amount ───────────

export async function handleLockNew(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const wallet = await getUserWallet(ctx.dbUser.id);
  const [unlocked, boost, onChain] = await Promise.all([
    getUnlockedBalance(ctx.dbUser.id),
    getBoostedRate(ctx.dbUser.id),
    wallet ? getCachedBalances(wallet.address) : Promise.resolve({ dccBalance: BigInt(0), stDCCBalance: BigInt(0) }),
  ]);

  const onChainDCC = Number(onChain.dccBalance) / WAVELETS_PER_DCC;

  if (unlocked < MIN_LOCK_AMOUNT) {
    let hint = '💳 Use /buy to purchase more DCC.';
    if (onChainDCC >= MIN_LOCK_AMOUNT) {
      hint = `💡 You have *${onChainDCC.toFixed(2)} DCC on-chain*!\nUse /deposit to move it to your off-chain balance first, then come back to lock it.`;
    } else if (onChainDCC > 0) {
      hint = `💡 You have *${onChainDCC.toFixed(2)} DCC on-chain*.\nUse /deposit to add it to your balance, then /buy more to reach ${MIN_LOCK_AMOUNT} DCC.`;
    }

    await editOrReply(ctx, `
⚠️ *Insufficient Balance*

You need at least *${MIN_LOCK_AMOUNT} DCC* unlocked to create a lock.
Your unlocked balance: *${unlocked.toFixed(2)} DCC*

${hint}
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLockKeyboard(),
    });
    return;
  }

  const rateDisplay = (boost.rate * 100).toFixed(1);

  await setSession(ctx.dbUser.id, { step: 'lock:enter_amount' });

  await editOrReply(ctx, `
🔒 *New Lock*

🔓 Available: *${unlocked.toFixed(2)} DCC*
📏 Min: *${MIN_LOCK_AMOUNT} DCC* / Max: *${MAX_LOCK_AMOUNT.toLocaleString()} DCC*
📅 Duration: *${LOCK_DURATION_DAYS} days*
📈 Rate: *${rateDisplay}% daily* (${boost.referralCount} referrals)

Pick an amount or type a custom one:
  `.trim(), {
    parse_mode: 'Markdown' as const,
    reply_markup: lockAmountPickerKeyboard(unlocked),
  });
}

// ── Amount picked from inline buttons ─────

export async function handleLockAmountPick(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const unlocked = await getUnlockedBalance(ctx.dbUser.id);
  let amount: number;
  if (data === 'lock_amount_max') {
    amount = Math.floor(Math.min(unlocked, MAX_LOCK_AMOUNT) * 100) / 100;
  } else {
    amount = parseInt(data.replace('lock_amount_', ''), 10);
  }

  if (isNaN(amount) || amount <= 0 || amount < MIN_LOCK_AMOUNT) {
    await editOrReply(ctx, `⚠️ Invalid amount. Minimum is *${MIN_LOCK_AMOUNT} DCC*.`, {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLockKeyboard(),
    });
    return;
  }

  if (amount > unlocked) {
    await editOrReply(ctx, `⚠️ Insufficient balance. You have *${unlocked.toFixed(2)} DCC* unlocked.`, {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLockKeyboard(),
    });
    return;
  }

  await setSession(ctx.dbUser.id, { step: 'lock:confirm', lockAmount: amount.toString() });

  const { rate } = await getBoostedRate(ctx.dbUser.id);
  const rateDisplay = (rate * 100).toFixed(1);
  const totalEarnings = Math.floor(amount * rate * LOCK_DURATION_DAYS * 100) / 100;
  const daily = Math.floor(amount * rate * 100) / 100;

  await editOrReply(ctx, `
🔒 *Confirm Lock*

┌─────────────────────────
│ Lock: *${amount.toFixed(2)} DCC*
│ Duration: *${LOCK_DURATION_DAYS} days*
│ Rate: *${rateDisplay}% daily*
│ ──────────────────
│ Daily Earnings: *${daily.toFixed(2)} DCC*
│ Total Earnings: *~${totalEarnings.toFixed(2)} DCC*
│ Total at Unlock: *~${(amount + totalEarnings).toFixed(2)} DCC*
└─────────────────────────

⚠️ Your DCC will be locked for ${LOCK_DURATION_DAYS} days.
Confirm?
  `.trim(), {
    parse_mode: 'Markdown' as const,
    reply_markup: lockConfirmKeyboard(),
  });
}

// ── Amount entered → show confirmation ────

export async function handleLockAmount(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.message?.text) return;

  const input = ctx.message.text.trim().toLowerCase();
  const unlocked = await getUnlockedBalance(ctx.dbUser.id);

  let amount: number;
  if (input === 'max') {
    amount = Math.floor(Math.min(unlocked, MAX_LOCK_AMOUNT) * 100) / 100;
  } else {
    amount = parseFloat(input);
  }

  if (isNaN(amount) || amount <= 0) {
    await clearSession(ctx.dbUser.id);
    await ctx.reply('⚠️ Please enter a valid positive number or "max".', {
      reply_markup: backToLockKeyboard(),
    });
    return;
  }

  if (amount < MIN_LOCK_AMOUNT) {
    await clearSession(ctx.dbUser.id);
    await ctx.reply(`⚠️ Minimum lock is *${MIN_LOCK_AMOUNT} DCC*. Try a larger amount.`, {
      parse_mode: 'Markdown',
      reply_markup: backToLockKeyboard(),
    });
    return;
  }

  if (amount > MAX_LOCK_AMOUNT) {
    await clearSession(ctx.dbUser.id);
    await ctx.reply(`⚠️ Maximum lock is *${MAX_LOCK_AMOUNT.toLocaleString()} DCC* per lock.`, {
      parse_mode: 'Markdown',
      reply_markup: backToLockKeyboard(),
    });
    return;
  }

  if (amount > unlocked) {
    await clearSession(ctx.dbUser.id);
    await ctx.reply(`⚠️ Insufficient balance. You have *${unlocked.toFixed(2)} DCC* unlocked.`, {
      parse_mode: 'Markdown',
      reply_markup: backToLockKeyboard(),
    });
    return;
  }

  // Store amount in session and move to confirm step
  await setSession(ctx.dbUser.id, { step: 'lock:confirm', lockAmount: amount.toString() });

  const { rate } = await getBoostedRate(ctx.dbUser.id);
  const rateDisplay = (rate * 100).toFixed(1);
  const totalEarnings = Math.floor(amount * rate * LOCK_DURATION_DAYS * 100) / 100;
  const daily = Math.floor(amount * rate * 100) / 100;

  await ctx.reply(`
🔒 *Confirm Lock*

┌─────────────────────────
│ Lock: *${amount.toFixed(2)} DCC*
│ Duration: *${LOCK_DURATION_DAYS} days*
│ Rate: *${rateDisplay}% daily*
│ ──────────────────
│ Daily Earnings: *${daily.toFixed(2)} DCC*
│ Total Earnings: *~${totalEarnings.toFixed(2)} DCC*
│ Total at Unlock: *~${(amount + totalEarnings).toFixed(2)} DCC*
└─────────────────────────

⚠️ Your DCC will be locked for ${LOCK_DURATION_DAYS} days.
Confirm?
  `.trim(), {
    parse_mode: 'Markdown',
    reply_markup: lockConfirmKeyboard(),
  });
}

// ── Confirm lock ──────────────────────────

export async function handleLockConfirm(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const session = await getSession(ctx.dbUser.id);
  const amountStr = session.lockAmount;

  if (!amountStr) {
    await clearSession(ctx.dbUser.id);
    await editOrReply(ctx, '⚠️ Session expired. Please use /lock to start over.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLockKeyboard(),
    });
    return;
  }

  const amount = parseFloat(amountStr);
  await clearSession(ctx.dbUser.id);

  const result = await createLock(ctx.dbUser.id, amount);

  if (!result.success) {
    await editOrReply(ctx, `⚠️ ${result.error}`, {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLockKeyboard(),
    });
    return;
  }

  const lockRate = result.dailyRate ?? DAILY_RATE;
  const rateDisplay = (lockRate * 100).toFixed(1);
  const totalEarnings = Math.floor(amount * lockRate * LOCK_DURATION_DAYS * 100) / 100;

  await editOrReply(ctx, `
✅ *Lock Created!*

🔒 *${amount.toFixed(2)} DCC* locked for *${LOCK_DURATION_DAYS} days*

┌─────────────────────────
│ Rate: ${rateDisplay}% daily
│ Est. Total Earnings: ~${totalEarnings.toFixed(2)} DCC
│ Unlocks: ${new Date(Date.now() + LOCK_DURATION_DAYS * 86400000).toLocaleDateString()}
└─────────────────────────

Your earnings accumulate daily. After ${LOCK_DURATION_DAYS} days, your principal returns and earnings are added to your off-chain balance — ready to redeem or re-lock!

💡 You can lock more DCC or compound your earnings anytime!
  `.trim(), {
    parse_mode: 'Markdown' as const,
    reply_markup: afterLockKeyboard(),
  });
}

// ── Cancel lock ───────────────────────────

export async function handleLockCancel(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  await clearSession(ctx.dbUser.id);

  await editOrReply(ctx, '❌ Lock cancelled.', {
    parse_mode: 'Markdown' as const,
    reply_markup: backToLockKeyboard(),
  });
}

// ── Lock info / rates ─────────────────────

export async function handleLockInfo(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const boost = await getBoostedRate(ctx.dbUser.id);
  const rateDisplay = (boost.rate * 100).toFixed(1);

  // Build tier table (descending by minRefs)
  const tierLines = BOOST_TIERS
    .filter((t) => t.minRefs > 0)
    .map((t) => {
      const marker = boost.rate === t.rate ? ' ◀️' : '';
      return `│ ${t.minRefs.toLocaleString()}+ refs → *${(t.rate * 100).toFixed(1)}%* daily${marker}`;
    });

  await editOrReply(ctx, `
📊 *Lock Rates & Info*

━━ *Your Status* ━━━━━━━━━━━
👥 Referrals: *${boost.referralCount}*
📈 Your Rate: *${rateDisplay}% daily*${boost.nextTier ? `\n🎯 Next: *${(boost.nextTier.rate * 100).toFixed(1)}%* at ${boost.nextTier.minRefs.toLocaleString()} referrals` : '\n🏆 Max tier reached!'}

━━ *Boost Tiers* ━━━━━━━━━━━
┌─────────────────────────
│ Base rate → *${(DAILY_RATE * 100).toFixed(1)}%* daily
${tierLines.join('\n')}
└─────────────────────────

━━ *Lock Rules* ━━━━━━━━━━━━
📏 Min: *${MIN_LOCK_AMOUNT} DCC* / Max: *${MAX_LOCK_AMOUNT.toLocaleString()} DCC* per lock
🔢 Max active locks: *${MAX_ACTIVE_LOCKS}*
📅 Lock duration: *${LOCK_DURATION_DAYS} days*
🔓 Auto-unlocks — earnings go to your balance

━━ *Referral Commission* ━━━
When your referrals' locks complete, you earn:
🥇 Tier 1 (direct): *10%* of their lock earnings
🥈 Tier 2: *5%* of their lock earnings
🥉 Tier 3: *2%* of their lock earnings

💡 _Invite more friends to boost your rate and earn commissions!_
  `.trim(), {
    parse_mode: 'Markdown' as const,
    reply_markup: backToLockKeyboard(),
  });
}
