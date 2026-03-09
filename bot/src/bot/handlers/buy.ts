// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Buy Handler — Purchase DCC with SOL/USDC/USDT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import { InlineKeyboard } from 'grammy';
import { setSession, getSession, clearSession } from '../middleware';
import { backToMainKeyboard, afterBuyKeyboard } from '../keyboards';
import { buyTokenKeyboard, buyConfirmKeyboard, buyCheckStatusKeyboard } from '../keyboards';
import { editOrReply } from '../utils';
import {
  generateSolDeposit,
  generateSplDeposit,
  getDepositLimits,
  registerTransfer,
  getTransferStatus,
  getLocalQuote,
  DCC_PRICE_USD,
} from '../../services/bridge';
import prisma from '../../db/prisma';
import { logger } from '../../utils/logger';
import { audit } from '../../utils/audit';

const SUPPORTED_TOKENS = ['SOL', 'USDC', 'USDT'] as const;

// ── Step 1: Show token selection ──────────

export async function handleBuy(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  await editOrReply(ctx, `
💳 *Buy DCC — $${DCC_PRICE_USD}/DCC*

Select the token you want to pay with:

🔶 *SOL* — Native Solana
🔵 *USDC* — USD Coin (Solana)
🟢 *USDT* — Tether (Solana)

💲 Price: *$${DCC_PRICE_USD} per DCC*
All purchases are processed via the SOL-Gateway bridge.
  `.trim(), {
    parse_mode: 'Markdown' as const,
    reply_markup: buyTokenKeyboard(),
  });
}

// ── Step 2: Token selected → ask amount ───

export async function handleBuyToken(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const token = data.replace('buy_token_', '').toUpperCase();
  if (!SUPPORTED_TOKENS.includes(token as any)) return;

  // Store selected token in session
  await setSession(ctx.dbUser.id, { step: 'buy:enter_amount', buyToken: token });

  let limitsText = '';
  try {
    const limits = await getDepositLimits(token);
    limitsText = `\nMin: *${limits.min} ${token}* · Max: *${limits.max} ${token}*`;
  } catch {
    // Bridge may be unavailable — proceed without limits
  }

  const hint = token === 'SOL'
    ? '_Type a SOL amount (e.g. 0.5, 1, 5):_'
    : `_Type a ${token} amount (e.g. 10, 50, 100):_`;

  await editOrReply(ctx, `
💳 *Buy DCC with ${token}*

💲 Price: *$${DCC_PRICE_USD} per DCC*

Enter the amount of *${token}* you want to spend:
${limitsText}

${hint}
  `.trim(), {
    parse_mode: 'Markdown' as const,
    reply_markup: backToMainKeyboard(),
  });
}

// ── Step 3: Amount entered → show quote ───

export async function handleBuyAmount(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.message?.text) return;

  const amount = parseFloat(ctx.message.text.trim());
  if (isNaN(amount) || amount <= 0) {
    await clearSession(ctx.dbUser.id);
    await ctx.reply('⚠️ Please enter a valid positive number.', {
      parse_mode: 'Markdown',
      reply_markup: backToMainKeyboard(),
    });
    return;
  }

  const session = await getSession(ctx.dbUser.id);
  const token = session.buyToken;
  if (!token) {
    await clearSession(ctx.dbUser.id);
    await ctx.reply('⚠️ Session expired. Please use /buy to start over.', {
      reply_markup: backToMainKeyboard(),
    });
    return;
  }

  try {
    const quote = await getLocalQuote(token, amount);

    if (quote.dccAmount <= 0) {
      await ctx.reply('⚠️ Amount too small — would result in 0 DCC. Try a larger amount.', {
        parse_mode: 'Markdown',
        reply_markup: backToMainKeyboard(),
      });
      return;
    }

    // Store quote data in session
    await setSession(ctx.dbUser.id, {
      step: 'buy:confirm',
      buyAmount: amount.toString(),
      buyDccAmount: quote.dccAmount.toString(),
      buyUsdValue: quote.usdValue.toString(),
    });

    const solLine = quote.solPrice
      ? `│ SOL Price: *$${quote.solPrice.toFixed(2)}*\n` : '';

    await ctx.reply(`
💳 *Buy DCC — Quote*

┌─────────────────────────
│ Pay: *${amount} ${token}*
${solLine}│ USD Value: *$${quote.usdValue.toFixed(2)}*
│ DCC Price: *$${DCC_PRICE_USD}/DCC*
│ ──────────────────
│ You receive: *${quote.dccAmount} DCC*
└─────────────────────────

DCC will be added to your *off-chain balance*.
Use /redeem to move DCC to your on-chain wallet.

Confirm this purchase?
    `.trim(), {
      parse_mode: 'Markdown',
      reply_markup: buyConfirmKeyboard(),
    });
  } catch (err) {
    logger.error({ err, token, amount }, 'Failed to generate quote');
    await clearSession(ctx.dbUser.id);
    await ctx.reply('⚠️ Unable to generate a quote right now. Please try again.', {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('🔄 Retry', 'buy')
        .text('◀️ Main Menu', 'main_menu'),
    });
  }
}

// ── Step 4: Confirmed → generate deposit ──

export async function handleBuyConfirm(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const session = await getSession(ctx.dbUser.id);
  const { buyToken: token, buyAmount: amountStr, buyDccAmount: dccAmountStr } = session;

  if (!token || !amountStr || !dccAmountStr) {
    await clearSession(ctx.dbUser.id);
    await editOrReply(ctx, '⚠️ Session expired. Please use /buy to start over.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToMainKeyboard(),
    });
    return;
  }

  const amount = parseFloat(amountStr);
  const dccAmount = parseFloat(dccAmountStr);

  try {
    // Generate deposit instruction
    const deposit = token === 'SOL'
      ? await generateSolDeposit(amount)
      : await generateSplDeposit(token, amount);

    // Register transfer with bridge
    const transfer = await registerTransfer({
      token,
      amount,
      depositAddress: deposit.depositAddress,
      userId: ctx.dbUser.id,
    });

    // Create purchase record in DB
    await prisma.dccPurchase.create({
      data: {
        userId: ctx.dbUser.id,
        token,
        amountPaid: amount,
        dccAmount,
        bridgeTransferId: transfer.id,
        depositAddress: deposit.depositAddress,
        status: 'PENDING',
      },
    });

    await audit({
      actorType: 'user',
      actorId: ctx.dbUser.id,
      action: 'purchase_initiated',
      targetType: 'user',
      targetId: ctx.dbUser.id,
      metadata: { token, amount, dccAmount, transferId: transfer.id },
    });

    // Clear session
    await clearSession(ctx.dbUser.id);

    const memoLine = 'memo' in deposit && deposit.memo
      ? `│ Memo: \`${deposit.memo}\`\n` : '';

    await editOrReply(ctx, `
✅ *Deposit Instructions*

Send exactly *${amount} ${token}* to:

┌─────────────────────────
│ Address:
│ \`${deposit.depositAddress}\`
${memoLine}│ ──────────────────
│ Amount: *${amount} ${token}*
│ You'll receive: *${dccAmount} DCC*
│ Transfer ID: \`${transfer.id}\`
└─────────────────────────

⏳ After sending, use the button below to check your transfer status.

⚠️ Send *only ${token}* to this address on the *Solana* network.
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: buyCheckStatusKeyboard(transfer.id),
    });
  } catch (err) {
    logger.error({ err, token, amount }, 'Failed to generate deposit');
    await clearSession(ctx.dbUser.id);
    await editOrReply(ctx, `
⚠️ *Deposit Generation Failed*

The bridge service could not generate deposit instructions.
Your funds are safe — nothing was charged.

Tap Retry to try again.
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: new InlineKeyboard()
        .text('🔄 Retry', 'buy')
        .text('◀️ Main Menu', 'main_menu'),
    });
  }
}

// ── Cancel buy flow ───────────────────────

export async function handleBuyCancel(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  await clearSession(ctx.dbUser.id);

  await editOrReply(ctx, '❌ Purchase cancelled.', {
    parse_mode: 'Markdown' as const,
    reply_markup: backToMainKeyboard(),
  });
}

// ── Check transfer status ─────────────────

export async function handleBuyStatus(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const transferId = data.replace('buy_status_', '');
  if (!transferId) return;

  try {
    const status = await getTransferStatus(transferId);

    // Update DB purchase status if changed
    if (status.status === 'completed') {
      await prisma.dccPurchase.updateMany({
        where: { bridgeTransferId: transferId, userId: ctx.dbUser.id },
        data: {
          status: 'COMPLETED',
          solanaTxId: status.solanaTxId ?? undefined,
        },
      });
      await audit({
        actorType: 'system',
        action: 'purchase_completed',
        targetType: 'user',
        targetId: ctx.dbUser.id,
        metadata: { transferId, dccAmount: status.dccAmount, solanaTxId: status.solanaTxId },
      });
    } else if (status.status === 'failed') {
      await prisma.dccPurchase.updateMany({
        where: { bridgeTransferId: transferId, userId: ctx.dbUser.id },
        data: { status: 'FAILED' },
      });
      await audit({
        actorType: 'system',
        action: 'purchase_failed',
        targetType: 'user',
        targetId: ctx.dbUser.id,
        metadata: { transferId },
      });
    }

    const statusEmoji = {
      pending: '⏳',
      processing: '🔄',
      completed: '✅',
      failed: '❌',
    }[status.status] ?? '❓';

    const completedNote = status.status === 'completed'
      ? '\n\n💰 DCC has been added to your off-chain balance!\nUse /redeem to move it to your on-chain wallet.'
      : '';

    await editOrReply(ctx, `
📋 *Transfer Status*

┌─────────────────────────
│ ID: \`${status.id}\`
│ Status: ${statusEmoji} *${status.status.toUpperCase()}*
│ Token: ${status.token}
│ Paid: ${status.inputAmount} ${status.token}
│ DCC: ${status.dccAmount} DCC
${status.solanaTxId ? `│ Solana TX: \`${status.solanaTxId}\`\n` : ''}└─────────────────────────
${completedNote}
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: status.status === 'completed'
        ? afterBuyKeyboard()
        : status.status === 'failed'
        ? backToMainKeyboard()
        : buyCheckStatusKeyboard(transferId),
    });
  } catch (err) {
    logger.error({ err, transferId }, 'Failed to check transfer status');
    await editOrReply(ctx, '⚠️ Could not check transfer status. Please try again.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToMainKeyboard(),
    });
  }
}

// ── Purchase history ──────────────────────

export async function handleBuyHistory(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const purchases = await prisma.dccPurchase.findMany({
    where: { userId: ctx.dbUser.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  if (purchases.length === 0) {
    await editOrReply(ctx, `
📋 *Purchase History*

No purchases yet. Use /buy to purchase DCC!
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: backToMainKeyboard(),
    });
    return;
  }

  const lines = purchases.map((p) => {
    const statusEmoji = {
      PENDING: '⏳',
      DEPOSITED: '🔄',
      COMPLETED: '✅',
      FAILED: '❌',
      EXPIRED: '⌛',
    }[p.status] ?? '❓';
    const redeemTag = p.redeemed ? ' (redeemed)' : '';
    return `${statusEmoji} ${p.amountPaid} ${p.token} → ${p.dccAmount} DCC${redeemTag}`;
  });

  await editOrReply(ctx, `
📋 *Purchase History*

${lines.join('\n')}
  `.trim(), {
    parse_mode: 'Markdown' as const,
    reply_markup: backToMainKeyboard(),
  });
}
