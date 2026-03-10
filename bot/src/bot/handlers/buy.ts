// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Buy Handler — Purchase DCC via NOWPayments
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import { InlineKeyboard } from 'grammy';
import { setSession, getSession, clearSession } from '../middleware';
import { backToMainKeyboard, afterBuyKeyboard, buyConfirmKeyboard } from '../keyboards';
import { editOrReply } from '../utils';
import {
  createPayment,
  getPaymentStatus,
  getEstimatedPrice,
} from '../../services/nowpayments';
import { DCC_PRICE_USD } from '../../config/constants';
import prisma from '../../db/prisma';
import { logger } from '../../utils/logger';
import { audit } from '../../utils/audit';

const POPULAR_CRYPTOS = [
  { symbol: 'BTC', emoji: '🟠', name: 'Bitcoin' },
  { symbol: 'ETH', emoji: '🔷', name: 'Ethereum' },
  { symbol: 'SOL', emoji: '🟣', name: 'Solana' },
  { symbol: 'USDT', emoji: '🟢', name: 'Tether' },
  { symbol: 'USDC', emoji: '🔵', name: 'USD Coin' },
  { symbol: 'LTC', emoji: '⚪', name: 'Litecoin' },
  { symbol: 'DOGE', emoji: '🐕', name: 'Dogecoin' },
  { symbol: 'XRP', emoji: '⚫', name: 'Ripple' },
  { symbol: 'BNB', emoji: '🟡', name: 'BNB' },
  { symbol: 'MATIC', emoji: '🟣', name: 'Polygon' },
  { symbol: 'TRX', emoji: '🔴', name: 'Tron' },
  { symbol: 'ADA', emoji: '🔵', name: 'Cardano' },
] as const;

function buyTokenKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let i = 0; i < POPULAR_CRYPTOS.length; i++) {
    const { symbol, emoji } = POPULAR_CRYPTOS[i];
    kb.text(`${emoji} ${symbol}`, `buy_token_${symbol.toLowerCase()}`);
    if (i % 3 === 2) kb.row();
  }
  if (POPULAR_CRYPTOS.length % 3 !== 0) kb.row();
  kb.text('📋 Purchase History', 'buy_history').row();
  kb.text('◀️ Main Menu', 'main_menu');
  return kb;
}

// ── Step 1: Show crypto selection ─────────

export async function handleBuy(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  await editOrReply(ctx, `
💳 *Buy DCC — $${DCC_PRICE_USD}/DCC*

Select the crypto you want to pay with:

Powered by NOWPayments — 150+ cryptocurrencies supported.
  `.trim(), {
    parse_mode: 'Markdown' as const,
    reply_markup: buyTokenKeyboard(),
  });
}

// ── Step 2: Crypto selected → ask DCC amount

export async function handleBuyToken(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const token = data.replace('buy_token_', '').toLowerCase();

  await setSession(ctx.dbUser.id, { step: 'buy:enter_amount', buyToken: token });

  await editOrReply(ctx, `
💳 *Buy DCC with ${token.toUpperCase()}*

💲 Price: *$${DCC_PRICE_USD} per DCC*

Enter the amount of *DCC* you want to buy:

_Example: 100, 500, 1000, 5000_
  `.trim(), {
    parse_mode: 'Markdown' as const,
    reply_markup: backToMainKeyboard(),
  });
}

// ── Step 3: DCC amount entered → show quote

export async function handleBuyAmount(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.message?.text) return;

  const dccAmount = parseFloat(ctx.message.text.trim());
  if (isNaN(dccAmount) || dccAmount <= 0) {
    await clearSession(ctx.dbUser.id);
    await ctx.reply('⚠️ Please enter a valid positive number.', {
      parse_mode: 'Markdown',
      reply_markup: backToMainKeyboard(),
    });
    return;
  }

  if (dccAmount < 10) {
    await ctx.reply('⚠️ Minimum purchase is *10 DCC*. Please enter a larger amount.', {
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
    const usdValue = dccAmount * DCC_PRICE_USD;
    const estimatedCrypto = await getEstimatedPrice(usdValue, token);

    await setSession(ctx.dbUser.id, {
      step: 'buy:confirm',
      buyDccAmount: dccAmount.toString(),
      buyUsdValue: usdValue.toString(),
      buyAmount: estimatedCrypto.toString(),
    });

    await ctx.reply(`
💳 *Buy DCC — Quote*

┌─────────────────────────
│ DCC: *${dccAmount.toLocaleString()} DCC*
│ USD Value: *$${usdValue.toFixed(2)}*
│ ──────────────────
│ Estimated: *~${estimatedCrypto} ${token.toUpperCase()}*
│ DCC Price: *$${DCC_PRICE_USD}/DCC*
└─────────────────────────

⚠️ Final amount may vary slightly due to exchange rate fluctuations.

DCC will be added to your *off-chain balance*.
Use /redeem to move DCC to your on-chain wallet.

Confirm this purchase?
    `.trim(), {
      parse_mode: 'Markdown',
      reply_markup: buyConfirmKeyboard(),
    });
  } catch (err) {
    logger.error({ err, token, dccAmount }, 'Failed to generate quote');
    await clearSession(ctx.dbUser.id);
    await ctx.reply('⚠️ Unable to generate a quote right now. Please try again.', {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('🔄 Retry', 'buy')
        .text('◀️ Main Menu', 'main_menu'),
    });
  }
}

// ── Step 4: Confirmed → create NOWPayments payment

export async function handleBuyConfirm(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const session = await getSession(ctx.dbUser.id);
  const { buyToken: token, buyDccAmount: dccAmountStr, buyUsdValue: usdValueStr } = session;

  if (!token || !dccAmountStr || !usdValueStr) {
    await clearSession(ctx.dbUser.id);
    await editOrReply(ctx, '⚠️ Session expired. Please use /buy to start over.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToMainKeyboard(),
    });
    return;
  }

  const dccAmount = parseFloat(dccAmountStr);
  const usdValue = parseFloat(usdValueStr);

  try {
    // Create purchase record first
    const purchase = await prisma.dccPurchase.create({
      data: {
        userId: ctx.dbUser.id,
        token: token.toUpperCase(),
        amountPaid: 0,
        dccAmount,
        status: 'PENDING',
      },
    });

    // Create payment via NOWPayments
    const payment = await createPayment(
      usdValue,
      token,
      purchase.id,
      `Buy ${dccAmount} DCC`,
    );

    // Update purchase with NOWPayments details
    await prisma.dccPurchase.update({
      where: { id: purchase.id },
      data: {
        amountPaid: payment.pay_amount,
        bridgeTransferId: payment.payment_id.toString(),
        depositAddress: payment.pay_address,
      },
    });

    await audit({
      actorType: 'user',
      actorId: ctx.dbUser.id,
      action: 'purchase_initiated',
      targetType: 'user',
      targetId: ctx.dbUser.id,
      metadata: {
        token: token.toUpperCase(),
        payAmount: payment.pay_amount,
        dccAmount,
        usdValue,
        purchaseId: purchase.id,
        paymentId: payment.payment_id,
        depositAddress: payment.pay_address,
      },
    });

    await clearSession(ctx.dbUser.id);

    const expiryNote = payment.expiration_estimate_date
      ? `\n⏰ Expires: *${new Date(payment.expiration_estimate_date).toUTCString()}*`
      : '';

    await editOrReply(ctx, `
✅ *Payment Created*

Send exactly *${payment.pay_amount} ${token.toUpperCase()}* to:

\`${payment.pay_address}\`

┌─────────────────────────
│ Pay: *${payment.pay_amount} ${token.toUpperCase()}*
│ You receive: *${dccAmount.toLocaleString()} DCC*
│ USD Value: *$${usdValue.toFixed(2)}*
└─────────────────────────
${expiryNote}
⏳ Status updates automatically once your payment is detected.
Use the button below to check your payment status.

⚠️ Send *only ${token.toUpperCase()}* to this address.
⚠️ Send the *exact amount* shown above.
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: new InlineKeyboard()
        .text('🔄 Check Status', `buy_status_${payment.payment_id}`).row()
        .text('📋 Purchase History', 'buy_history').row()
        .text('◀️ Main Menu', 'main_menu'),
    });
  } catch (err) {
    logger.error({ err, token, dccAmount }, 'Failed to create payment');
    await clearSession(ctx.dbUser.id);
    await editOrReply(ctx, `
⚠️ *Payment Creation Failed*

Could not create your payment.
Please try again in a moment.

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

// ── Check payment status ──────────────────

export async function handleBuyStatus(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const paymentId = data.replace('buy_status_', '');
  if (!paymentId) return;

  try {
    const payment = await getPaymentStatus(paymentId);

    // Look up our DB record for DCC amount
    const dbPurchase = await prisma.dccPurchase.findFirst({
      where: { bridgeTransferId: paymentId, userId: ctx.dbUser.id },
    });

    // Map NOWPayments status → our DB status
    const statusMap: Record<string, string> = {
      waiting: 'PENDING',
      confirming: 'DEPOSITED',
      confirmed: 'DEPOSITED',
      sending: 'DEPOSITED',
      partially_paid: 'PENDING',
      finished: 'COMPLETED',
      failed: 'FAILED',
      refunded: 'FAILED',
      expired: 'EXPIRED',
    };

    const ourStatus = statusMap[payment.payment_status] ?? 'PENDING';

    // Update DB if terminal status
    if (ourStatus === 'COMPLETED' || ourStatus === 'FAILED' || ourStatus === 'EXPIRED') {
      await prisma.dccPurchase.updateMany({
        where: { bridgeTransferId: paymentId, userId: ctx.dbUser.id },
        data: { status: ourStatus as any },
      });
      if (ourStatus === 'COMPLETED') {
        await audit({
          actorType: 'system',
          action: 'purchase_completed',
          targetType: 'user',
          targetId: ctx.dbUser.id,
          metadata: {
            paymentId,
            actuallyPaid: payment.actually_paid,
            payCurrency: payment.pay_currency,
          },
        });
      }
    }

    const statusEmoji: Record<string, string> = {
      waiting: '⏳',
      confirming: '🔄',
      confirmed: '✅',
      sending: '📤',
      partially_paid: '⚠️',
      finished: '✅',
      failed: '❌',
      refunded: '↩️',
      expired: '⌛',
    };

    const isComplete = payment.payment_status === 'finished';
    const isFinal = ['finished', 'failed', 'refunded', 'expired'].includes(payment.payment_status);
    const emoji = statusEmoji[payment.payment_status] ?? '❓';

    const completedNote = isComplete
      ? '\n\n💰 DCC has been added to your off-chain balance!\nUse /redeem to move it to your on-chain wallet.'
      : '';

    const paidNote = payment.actually_paid > 0
      ? `│ Paid: *${payment.actually_paid} ${payment.pay_currency.toUpperCase()}*\n`
      : '';

    const dccAmount = dbPurchase?.dccAmount ?? 0;

    await editOrReply(ctx, `
📋 *Payment Status*

┌─────────────────────────
│ Status: ${emoji} *${payment.payment_status.toUpperCase().replace(/_/g, ' ')}*
│ Expected: *${payment.pay_amount} ${payment.pay_currency.toUpperCase()}*
${paidNote}│ DCC: *${dccAmount.toLocaleString()} DCC*
│ USD: *$${payment.price_amount.toFixed(2)}*
└─────────────────────────
${completedNote}
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: isComplete
        ? afterBuyKeyboard()
        : isFinal
        ? backToMainKeyboard()
        : new InlineKeyboard()
            .text('🔄 Refresh Status', `buy_status_${paymentId}`).row()
            .text('◀️ Main Menu', 'main_menu'),
    });
  } catch (err) {
    logger.error({ err, paymentId }, 'Failed to check payment status');
    await editOrReply(ctx, '⚠️ Could not check payment status. Please try again.', {
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

  // Add status check buttons for pending purchases
  const pendingPurchases = purchases.filter(
    (p) => p.status === 'PENDING' || p.status === 'DEPOSITED',
  );

  const kb = new InlineKeyboard();
  for (const p of pendingPurchases.slice(0, 3)) {
    if (p.bridgeTransferId) {
      kb.text(`🔄 Check #${p.bridgeTransferId.slice(0, 8)}…`, `buy_status_${p.bridgeTransferId}`).row();
    }
  }
  kb.text('💳 Buy More', 'buy').row();
  kb.text('◀️ Main Menu', 'main_menu');

  await editOrReply(ctx, `
📋 *Purchase History*

${lines.join('\n')}
  `.trim(), {
    parse_mode: 'Markdown' as const,
    reply_markup: kb,
  });
}
