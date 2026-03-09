// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Deposit Handler — One-tap on-chain DCC → off-chain balance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import { isActionLimited } from '../middleware';
import { backToMainKeyboard, depositMenuKeyboard, afterDepositKeyboard } from '../keyboards';
import { editOrReply } from '../utils';
import { getUserWallet } from '../../services/wallet';
import { autoDeposit, getDepositHistory } from '../../services/deposit';
import { getCachedBalances } from '../../services/blockchain';
import { logger } from '../../utils/logger';
import { getRedis } from '../../utils/redis';
import { WAVELETS_PER_DCC, FEE_DCC } from '../../config/constants';

/**
 * Show deposit screen with on-chain balance and one-tap deposit button.
 */
export async function handleDeposit(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const wallet = await getUserWallet(ctx.dbUser.id);
  if (!wallet) {
    await editOrReply(ctx, '⚠️ No wallet found. Use /start to create one.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToMainKeyboard(),
    });
    return;
  }

  const balances = await getCachedBalances(wallet.address);
  const onChainDCC = Number(balances.dccBalance) / WAVELETS_PER_DCC;
  const fee = FEE_DCC;
  const depositable = Math.max(0, onChainDCC - fee);

  if (depositable <= 0) {
    await editOrReply(ctx, `
📥 *Deposit DCC*

Your on-chain wallet has no DCC available to deposit.

┌─────────────────────────
│ 🔗 On-Chain: *${onChainDCC.toFixed(2)} DCC*
│ 🏦 Wallet: \`${wallet.address}\`
└─────────────────────────

Send DCC to your wallet address above, then come back to deposit.
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: depositMenuKeyboard(false),
    });
    return;
  }

  await editOrReply(ctx, `
📥 *Deposit DCC*

Move your on-chain DCC to your off-chain balance in one tap.

┌─────────────────────────
│ 🔗 On-Chain: *${onChainDCC.toFixed(2)} DCC*
│ 💸 Network Fee: *${fee} DCC*
│ ──────────────────
│ 📥 You'll Receive: *${depositable.toFixed(2)} DCC*
└─────────────────────────

Tap *📥 Deposit Now* to automatically transfer your on-chain DCC to your off-chain balance.
  `.trim(), {
    parse_mode: 'Markdown' as const,
    reply_markup: depositMenuKeyboard(true),
  });
}

/**
 * Execute the auto-deposit: transfer on-chain DCC to rewards wallet
 * and credit off-chain balance.
 */
export async function handleDepositConfirm(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  if (await isActionLimited(ctx.dbUser.id, 'deposit', 5, 300)) {
    await editOrReply(ctx, '⚠️ Too many deposit attempts. Please try again in a few minutes.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToMainKeyboard(),
    });
    return;
  }

  // Acquire a per-user deposit lock to prevent concurrent deposits
  const redis = getRedis();
  const lockKey = `deposit_lock:${ctx.dbUser.id}`;
  const acquired = await redis.set(lockKey, '1', 'EX', 60, 'NX');
  if (!acquired) {
    await editOrReply(ctx, '⚠️ A deposit is already in progress. Please wait a moment and try again.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToMainKeyboard(),
    });
    return;
  }

  await editOrReply(ctx, '⏳ Transferring your DCC to off-chain balance...', {
    parse_mode: 'Markdown' as const,
  });

  try {
    const result = await autoDeposit(ctx.dbUser.id);

    if (!result) {
      await ctx.reply(`
⚠️ *No DCC to Deposit*

Your on-chain wallet doesn't have enough DCC to cover the transfer fee.
      `.trim(), {
        parse_mode: 'Markdown' as const,
        reply_markup: backToMainKeyboard(),
      });
      return;
    }

    await ctx.reply(`
✅ *Deposit Successful!*

*${result.amount.toFixed(2)} DCC* moved to your off-chain balance!

┌─────────────────────────
│ 📥 Deposited: *${result.amount.toFixed(2)} DCC*
│ 🔗 TX: \`${result.txId.slice(0, 16)}…\`
└─────────────────────────

Your DCC is now available to lock, earn rewards, or use however you like!

🔒 /lock — Lock & earn daily rewards
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: afterDepositKeyboard(),
    });
  } catch (err) {
    logger.error({ err, userId: ctx.dbUser.id }, 'Auto-deposit failed');
    await ctx.reply(`
⚠️ *Deposit Failed*

Something went wrong transferring your DCC. Please try again in a moment.
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: depositMenuKeyboard(false),
    });
  } finally {
    await redis.del(lockKey);
  }
}

/**
 * Show deposit history.
 */
export async function handleDepositHistory(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const deposits = await getDepositHistory(ctx.dbUser.id);

  if (deposits.length === 0) {
    await editOrReply(ctx, `
📥 *Deposit History*

No deposits yet. Use /deposit to move your on-chain DCC to your balance.
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: depositMenuKeyboard(false),
    });
    return;
  }

  const total = deposits.reduce((s, d) => s + d.amount, 0);
  const lines = deposits.map(
    (d) => `│ ${d.amount.toFixed(2)} DCC — ${d.createdAt.toLocaleDateString()} — \`${d.txId.slice(0, 12)}…\``,
  );

  await editOrReply(ctx, `
📥 *Deposit History*

Total Deposited: *${total.toFixed(2)} DCC*

┌─────────────────────────
${lines.join('\n')}
└─────────────────────────
  `.trim(), {
    parse_mode: 'Markdown' as const,
    reply_markup: depositMenuKeyboard(false),
  });
}
