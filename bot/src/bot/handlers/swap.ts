// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Swap Handler — Token swaps via DCC AMM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import { InlineKeyboard } from 'grammy';
import { setSession, getSession, clearSession } from '../middleware';
import { backToMainKeyboard } from '../keyboards';
import { editOrReply } from '../utils';
import {
  listPools,
  quoteSwap,
  buildSwapTx,
  getTokenInfo,
  type PoolSnapshot,
  type TokenInfo,
} from '../../services/amm';
import { generateWalletForUser, decryptWalletSeed } from '../../services/wallet';
import { getCachedBalances, invalidateCache, notifyTrackerSwap } from '../../services/blockchain';
import { invokeScript, broadcast } from '@waves/waves-transactions';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { audit } from '../../utils/audit';
import { WAVELETS_PER_DCC, DCC_CHAIN_ID } from '../../config/constants';

const MD = { parse_mode: 'Markdown' as const };

// ── Token cache ───────────────────────────

const tokenNameCache = new Map<string, { name: string; decimals: number }>();

async function resolveToken(assetId: string): Promise<{ name: string; decimals: number }> {
  if (assetId === 'DCC') return { name: 'DCC', decimals: 8 };
  const cached = tokenNameCache.get(assetId);
  if (cached) return cached;
  try {
    const info = await getTokenInfo(assetId);
    const entry = { name: info.name, decimals: info.decimals };
    tokenNameCache.set(assetId, entry);
    return entry;
  } catch {
    return { name: assetId.slice(0, 8) + '…', decimals: 8 };
  }
}

function fmtAmt(raw: string | number, decimals: number): string {
  const n = Number(raw) / Math.pow(10, decimals);
  return n.toLocaleString('en-US', { maximumFractionDigits: Math.min(decimals, 4) });
}

// ── Keyboards ─────────────────────────────

function swapDirectionKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 DCC → stDCC', 'swap_dcc_to_stdcc').row()
    .text('🔄 stDCC → DCC', 'swap_stdcc_to_dcc').row()
    .text('◀️ Main Menu', 'main_menu');
}

function swapConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm Swap', 'swap_confirm')
    .text('❌ Cancel', 'swap');
}

function backToSwapKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 Swap Again', 'swap')
    .text('◀️ Main Menu', 'main_menu');
}

// ── Step 1: Show swap menu ────────────────

export async function handleSwap(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  try {
    const wallet = await generateWalletForUser(ctx.dbUser.id);
    const balances = await getCachedBalances(wallet.address);

    const dccBalance = Number(balances.dccBalance) / WAVELETS_PER_DCC;
    const stDCCBalance = Number(balances.stDCCBalance) / WAVELETS_PER_DCC;

    await editOrReply(ctx, `
🔄 *Token Swap*

┌─────────────────────────
│ 💰 DCC: *${dccBalance.toFixed(2)}*
│ 🪙 stDCC: *${stDCCBalance.toFixed(2)}*
└─────────────────────────

Swap between DCC and stDCC instantly via the AMM pool.

Choose a swap direction:
    `.trim(), { ...MD, reply_markup: swapDirectionKeyboard() });
  } catch (err) {
    logger.error({ err }, 'Failed to load swap menu');
    await editOrReply(ctx, '⚠️ Could not load swap menu. Please try again.', { ...MD, reply_markup: backToMainKeyboard() });
  }
}

// ── Step 2: User picks direction → enter amount ─

export async function handleSwapDirection(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const isDccToStdcc = data === 'swap_dcc_to_stdcc';
  const assetIn = isDccToStdcc ? 'DCC' : config.STDCC_ASSET_ID;
  const assetOut = isDccToStdcc ? config.STDCC_ASSET_ID : 'DCC';
  const tokenIn = isDccToStdcc ? 'DCC' : 'stDCC';

  try {
    const wallet = await generateWalletForUser(ctx.dbUser.id);
    const balances = await getCachedBalances(wallet.address);

    const rawBalance = isDccToStdcc ? Number(balances.dccBalance) : Number(balances.stDCCBalance);
    const feeReserve = isDccToStdcc ? 101_000_000 : 0; // reserve DCC for tx fees
    const available = Math.max(0, rawBalance - feeReserve) / WAVELETS_PER_DCC;

    if (available <= 0) {
      const action = isDccToStdcc ? '/buy or /deposit' : '/stake';
      await editOrReply(ctx, `⚠️ You don't have enough ${tokenIn}.\n\n👉 Use ${action} to get ${tokenIn} first.`, {
        ...MD,
        reply_markup: backToSwapKeyboard(),
      });
      return;
    }

    await setSession(ctx.dbUser.id, {
      step: 'swap:enter_amount',
      swapAssetIn: assetIn,
      swapAssetOut: assetOut,
    });

    const kb = new InlineKeyboard()
      .text('25%', `swap_pct_25`).text('50%', `swap_pct_50`)
      .text('75%', `swap_pct_75`).text('MAX', `swap_pct_100`).row()
      .text('❌ Cancel', 'swap');

    await editOrReply(ctx, `
🔄 *Swap ${tokenIn}*

Available: *${available.toFixed(4)} ${tokenIn}*

Enter the amount of *${tokenIn}* to swap, or pick a preset:
    `.trim(), { ...MD, reply_markup: kb });
  } catch (err) {
    logger.error({ err }, 'Swap direction failed');
    await editOrReply(ctx, '⚠️ Failed to load swap. Please try again.', { ...MD, reply_markup: backToSwapKeyboard() });
  }
}

// ── Step 2b: Preset percentage buttons ────

export async function handleSwapPercent(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const pct = parseInt(data.replace('swap_pct_', ''), 10);

  const session = await getSession(ctx.dbUser.id);
  if (session.step !== 'swap:enter_amount' || !session.swapAssetIn) {
    await editOrReply(ctx, '⚠️ Session expired. Please restart.', { ...MD, reply_markup: backToSwapKeyboard() });
    return;
  }

  try {
    const wallet = await generateWalletForUser(ctx.dbUser.id);
    const balances = await getCachedBalances(wallet.address);
    const isDccIn = session.swapAssetIn === 'DCC';
    const rawBalance = isDccIn ? Number(balances.dccBalance) : Number(balances.stDCCBalance);
    const feeReserve = isDccIn ? 101_000_000 : 0;
    const available = Math.max(0, rawBalance - feeReserve);
    const rawAmount = Math.floor(available * pct / 100);

    if (rawAmount <= 0) {
      await editOrReply(ctx, '⚠️ Amount too small.', { ...MD, reply_markup: backToSwapKeyboard() });
      return;
    }

    // Proceed directly to quote + confirm
    await showSwapConfirmation(ctx, session.swapAssetIn!, session.swapAssetOut!, String(rawAmount));
  } catch (err) {
    logger.error({ err }, 'Swap percent failed');
    await editOrReply(ctx, '⚠️ Failed. Please try again.', { ...MD, reply_markup: backToSwapKeyboard() });
  }
}

// ── Step 3: Text amount input ─────────────

export async function handleSwapAmount(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;

  const text = ctx.message?.text?.trim();
  if (!text) return;

  const session = await getSession(ctx.dbUser.id);
  if (!session.swapAssetIn || !session.swapAssetOut) {
    await ctx.reply('⚠️ Session expired. Use /swap to start again.', { ...MD, reply_markup: backToSwapKeyboard() });
    return;
  }

  const isDccIn = session.swapAssetIn === 'DCC';
  const tokenIn = isDccIn ? 'DCC' : 'stDCC';
  const decimals = 8;

  // Parse amount
  let rawAmount: number;
  if (text.toLowerCase() === 'max') {
    const wallet = await generateWalletForUser(ctx.dbUser.id);
    const balances = await getCachedBalances(wallet.address);
    const rawBalance = isDccIn ? Number(balances.dccBalance) : Number(balances.stDCCBalance);
    const feeReserve = isDccIn ? 101_000_000 : 0;
    rawAmount = Math.max(0, rawBalance - feeReserve);
  } else {
    const parsed = parseFloat(text);
    if (isNaN(parsed) || parsed <= 0) {
      await ctx.reply(`⚠️ Please enter a valid ${tokenIn} amount (e.g. \`5.5\`) or \`max\`.`, MD);
      return;
    }
    rawAmount = Math.floor(parsed * Math.pow(10, decimals));
  }

  if (rawAmount <= 0) {
    await ctx.reply(`⚠️ Amount too small. Enter a larger ${tokenIn} amount.`, MD);
    return;
  }

  // Check balance
  const wallet = await generateWalletForUser(ctx.dbUser.id);
  const balances = await getCachedBalances(wallet.address);
  const rawBalance = isDccIn ? Number(balances.dccBalance) : Number(balances.stDCCBalance);
  const feeReserve = isDccIn ? 101_000_000 : 0;
  if (rawAmount > rawBalance - feeReserve) {
    const avail = Math.max(0, rawBalance - feeReserve) / Math.pow(10, decimals);
    await ctx.reply(`⚠️ Insufficient balance. Available: *${avail.toFixed(4)} ${tokenIn}*`, MD);
    return;
  }

  try {
    await showSwapConfirmation(ctx, session.swapAssetIn!, session.swapAssetOut!, String(rawAmount));
  } catch (err) {
    logger.error({ err }, 'Swap amount confirmation failed');
    await ctx.reply('⚠️ Could not get a swap quote. Please try again.', { ...MD, reply_markup: backToSwapKeyboard() });
  }
}

// ── Show confirmation with quote ──────────

async function showSwapConfirmation(
  ctx: BotContext,
  assetIn: string,
  assetOut: string,
  rawAmountIn: string,
): Promise<void> {
  const tIn = await resolveToken(assetIn);
  const tOut = await resolveToken(assetOut);

  const quote = await quoteSwap(assetIn, assetOut, rawAmountIn);

  const amtIn = fmtAmt(rawAmountIn, tIn.decimals);
  const amtOut = fmtAmt(quote.amountOut, tOut.decimals);
  const minOut = fmtAmt(quote.minAmountOut, tOut.decimals);
  const impact = (Number(quote.priceImpactBps) / 100).toFixed(2);
  const fee = fmtAmt(quote.feeAmount, tIn.decimals);

  await setSession(ctx.dbUser!.id, {
    step: 'swap:confirm',
    swapAssetIn: assetIn,
    swapAssetOut: assetOut,
    swapAmountIn: rawAmountIn,
    swapAmountOut: quote.amountOut,
    swapMinOut: quote.minAmountOut,
    swapFeeBps: String(quote.feeBps),
  });

  await editOrReply(ctx, `
🔄 *Swap Confirmation*

┌─────────────────────────
│ 📤 Sell: *${amtIn} ${tIn.name}*
│ 📥 Receive: *~${amtOut} ${tOut.name}*
│ 📉 Min received: *${minOut} ${tOut.name}*
│ ──────────────────
│ 💎 Price impact: *${impact}%*
│ 💰 Fee: *${fee} ${tIn.name}*
└─────────────────────────

Confirm this swap?
  `.trim(), { ...MD, reply_markup: swapConfirmKeyboard() });
}

// ── Step 4: Execute swap ──────────────────

export async function handleSwapConfirm(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const session = await getSession(ctx.dbUser.id);
  if (session.step !== 'swap:confirm' || !session.swapAssetIn || !session.swapAmountIn) {
    await editOrReply(ctx, '⚠️ Session expired. Use /swap to start again.', { ...MD, reply_markup: backToSwapKeyboard() });
    return;
  }

  try {
    const wallet = await generateWalletForUser(ctx.dbUser.id);
    const seed = await decryptWalletSeed(ctx.dbUser.id);
    if (!seed) throw new Error('Could not decrypt wallet seed');

    const tIn = await resolveToken(session.swapAssetIn);
    const tOut = await resolveToken(session.swapAssetOut!);

    await editOrReply(ctx, `⏳ *Executing swap...*\n\nSwapping *${fmtAmt(session.swapAmountIn, tIn.decimals)} ${tIn.name}* → *${tOut.name}*`, MD);

    const built = await buildSwapTx(
      session.swapAssetIn,
      session.swapAssetOut!,
      session.swapAmountIn,
      parseInt(session.swapFeeBps || '35'),
    );

    const signedTx = invokeScript({
      dApp: built.tx.dApp,
      call: built.tx.call as any,
      payment: built.tx.payment,
      fee: built.tx.fee,
      chainId: DCC_CHAIN_ID,
    }, seed);

    const result = await broadcast(signedTx, config.DCC_NODE_URL);

    await clearSession(ctx.dbUser.id);
    await invalidateCache(wallet.address);

    // Record swap on eligibility tracker (fire-and-forget)
    notifyTrackerSwap(wallet.address, built.tx.dApp).catch(() => {});

    await audit({
      actorType: 'user',
      actorId: ctx.dbUser.id,
      action: 'swap',
      targetType: 'user',
      targetId: ctx.dbUser.id,
      metadata: {
        assetIn: session.swapAssetIn,
        assetOut: session.swapAssetOut,
        amountIn: session.swapAmountIn,
        amountOut: session.swapAmountOut,
        txId: result.id,
      },
    });

    await editOrReply(ctx, `
✅ *Swap Complete!*

Swapped *${fmtAmt(session.swapAmountIn, tIn.decimals)} ${tIn.name}* → *~${fmtAmt(session.swapAmountOut || '0', tOut.decimals)} ${tOut.name}*

🔗 TX: \`${result.id}\`
    `.trim(), { ...MD, reply_markup: backToSwapKeyboard() });
  } catch (err) {
    logger.error({ err }, 'Swap execution failed');
    await clearSession(ctx.dbUser.id);
    await editOrReply(ctx, '⚠️ Swap failed. Please try again.', { ...MD, reply_markup: backToSwapKeyboard() });
  }
}
