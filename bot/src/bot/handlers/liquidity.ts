// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Liquidity Handler — Add/remove LP via DCC AMM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import { InlineKeyboard } from 'grammy';
import { setSession, getSession, clearSession } from '../middleware';
import { backToMainKeyboard } from '../keyboards';
import { editOrReply } from '../utils';
import {
  listPools,
  getUserPositions,
  getTokenInfo,
  quoteAddLiquidity,
  buildAddLiquidityTx,
  quoteRemoveLiquidity,
  buildRemoveLiquidityTx,
  type PoolSnapshot,
  type TokenInfo,
} from '../../services/amm';
import { generateWalletForUser, decryptWalletSeed } from '../../services/wallet';
import { getCachedBalances } from '../../services/blockchain';
import { invokeScript, broadcast } from '@waves/waves-transactions';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { audit } from '../../utils/audit';
import { WAVELETS_PER_DCC, DCC_CHAIN_ID } from '../../config/constants';

// ── Pool cache for short callback IDs ─────

let poolsCache: PoolSnapshot[] = [];

// ── Token name cache ──────────────────────

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

function fmtAmt(raw: string, decimals: number): string {
  const n = Number(raw) / Math.pow(10, decimals);
  return n.toLocaleString('en-US', { maximumFractionDigits: Math.min(decimals, 4) });
}

// ── Keyboards ─────────────────────────────

function liquidityMenuKeyboard(pools: PoolSnapshot[], labels: string[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let i = 0; i < Math.min(pools.length, 8); i++) {
    kb.text(labels[i], `lpp_${i}`).row();
  }
  kb.text('📊 My Positions', 'lp_positions').row();
  kb.text('◀️ Main Menu', 'main_menu');
  return kb;
}

function poolActionKeyboard(poolIdx: number, hasPosition: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text('📥 Add Liquidity', `lpa_${poolIdx}`).row();
  if (hasPosition) {
    kb.text('📤 Remove Liquidity', `lpr_${poolIdx}`).row();
  }
  kb.text('◀️ Pools', 'liquidity')
    .text('🏠 Menu', 'main_menu');
  return kb;
}

function lpConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm', 'lp_confirm')
    .text('❌ Cancel', 'liquidity');
}

function lpRemoveConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm Remove', 'lp_remove_confirm')
    .text('❌ Cancel', 'liquidity');
}

function backToLiquidityKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('◀️ Pools', 'liquidity')
    .text('🏠 Menu', 'main_menu');
}

// ── Step 1: Show pool list ────────────────

export async function handleLiquidity(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  try {
    const pools = await listPools();
    poolsCache = pools;

    if (pools.length === 0) {
      await editOrReply(ctx, '🌊 *Liquidity Pools*\n\nNo active pools found.', {
        parse_mode: 'Markdown' as const,
        reply_markup: backToMainKeyboard(),
      });
      return;
    }

    // Resolve token names for display
    const lines: string[] = [];
    const labels: string[] = [];
    for (const p of pools.slice(0, 8)) {
      const [tA, tB] = await Promise.all([resolveToken(p.assetA), resolveToken(p.assetB)]);
      const rA = fmtAmt(p.reserveA, tA.decimals);
      const rB = fmtAmt(p.reserveB, tB.decimals);
      lines.push(`• *${tA.name}/${tB.name}* — ${rA} / ${rB} (${p.feeBps / 100}% fee)`);
      labels.push(`${tA.name}/${tB.name} (${p.feeBps / 100}%)`);
    }

    await editOrReply(ctx, `
🌊 *Liquidity Pools*

${lines.join('\n')}

Select a pool to add or remove liquidity:
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: liquidityMenuKeyboard(pools, labels),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to load pools');
    await editOrReply(ctx, '⚠️ Could not load liquidity pools. Please try again.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToMainKeyboard(),
    });
  }
}

// ── Step 2: Show pool detail ──────────────

export async function handlePoolDetail(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const idx = parseInt(data.replace('lpp_', ''), 10);

  try {
    const wallet = await generateWalletForUser(ctx.dbUser.id);
    const [pools, positions] = await Promise.all([
      listPools(),
      getUserPositions(wallet.address),
    ]);
    poolsCache = pools;

    const pool = pools[idx];
    if (!pool) {
      await editOrReply(ctx, '⚠️ Pool not found.', {
        parse_mode: 'Markdown' as const,
        reply_markup: backToLiquidityKeyboard(),
      });
      return;
    }

    const [tA, tB] = await Promise.all([resolveToken(pool.assetA), resolveToken(pool.assetB)]);
    const rA = fmtAmt(pool.reserveA, tA.decimals);
    const rB = fmtAmt(pool.reserveB, tB.decimals);

    const position = positions.find((p) => p.token0 === pool.assetA && p.token1 === pool.assetB);
    let positionLine = '_You have no position in this pool._';
    if (position && Number(position.lpBalance) > 0) {
      const uA = fmtAmt(position.userReserve0, tA.decimals);
      const uB = fmtAmt(position.userReserve1, tB.decimals);
      positionLine = `Your share: *${position.poolSharePct.toFixed(2)}%* (${uA} ${tA.name} + ${uB} ${tB.name})`;
    }

    await editOrReply(ctx, `
🌊 *${tA.name} / ${tB.name}* Pool

┌─────────────────────────
│ 💧 Reserves: *${rA} ${tA.name}* / *${rB} ${tB.name}*
│ 📊 Price: *1 ${tA.name} = ${pool.priceAtoB.toFixed(6)} ${tB.name}*
│ 💰 Fee: *${pool.feeBps / 100}%*
│ ──────────────────
│ ${positionLine}
└─────────────────────────
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: poolActionKeyboard(idx, !!(position && Number(position.lpBalance) > 0)),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to load pool detail');
    await editOrReply(ctx, '⚠️ Could not load pool details.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLiquidityKeyboard(),
    });
  }
}

// ── My Positions ──────────────────────────

export async function handleLpPositions(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  try {
    const wallet = await generateWalletForUser(ctx.dbUser.id);
    const positions = await getUserPositions(wallet.address);
    const active = positions.filter((p) => Number(p.lpBalance) > 0);

    if (active.length === 0) {
      await editOrReply(ctx, '📊 *My LP Positions*\n\n_You have no active liquidity positions._', {
        parse_mode: 'Markdown' as const,
        reply_markup: backToLiquidityKeyboard(),
      });
      return;
    }

    const lines: string[] = [];
    for (const pos of active) {
      const [t0, t1] = await Promise.all([resolveToken(pos.token0), resolveToken(pos.token1)]);
      const u0 = fmtAmt(pos.userReserve0, t0.decimals);
      const u1 = fmtAmt(pos.userReserve1, t1.decimals);
      lines.push(`• *${t0.name}/${t1.name}* — ${pos.poolSharePct.toFixed(2)}% share\n  ${u0} ${t0.name} + ${u1} ${t1.name}`);
    }

    await editOrReply(ctx, `
📊 *My LP Positions*

${lines.join('\n\n')}
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLiquidityKeyboard(),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to load positions');
    await editOrReply(ctx, '⚠️ Could not load your positions.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLiquidityKeyboard(),
    });
  }
}

// ── Step 3a: Add liquidity — ask amount ───

export async function handleLpAdd(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const idx = parseInt(data.replace('lpa_', ''), 10);

  try {
    const pools = await listPools();
    poolsCache = pools;
    const pool = pools[idx];
    if (!pool) {
      await clearSession(ctx.dbUser.id);
      await editOrReply(ctx, '⚠️ Pool not found.', {
        parse_mode: 'Markdown' as const,
        reply_markup: backToLiquidityKeyboard(),
      });
      return;
    }

    await setSession(ctx.dbUser.id, { step: 'lp:enter_amount', lpPoolKey: pool.poolKey });

    const [tA, tB] = await Promise.all([resolveToken(pool.assetA), resolveToken(pool.assetB)]);

    await editOrReply(ctx, `
📥 *Add Liquidity — ${tA.name}/${tB.name}*

Enter the DCC amount you want to deposit:
_The matching ${tB.name} amount will be calculated automatically to maintain the pool ratio._

_Type a number (e.g. 10, 50, 100):_
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLiquidityKeyboard(),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start add-liquidity');
    await clearSession(ctx.dbUser.id);
    await editOrReply(ctx, '⚠️ Could not load pool data.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLiquidityKeyboard(),
    });
  }
}

// ── Step 3b: Amount entered → estimate ────

export async function handleLpAmount(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.message?.text) return;

  const session = await getSession(ctx.dbUser.id);
  const poolKey = session.lpPoolKey;
  if (!poolKey) {
    await clearSession(ctx.dbUser.id);
    await ctx.reply('⚠️ Session expired. Use /liquidity to start over.', {
      reply_markup: backToLiquidityKeyboard(),
    });
    return;
  }

  const text = ctx.message.text.trim();
  const amount = parseFloat(text);

  if (isNaN(amount) || amount <= 0) {
    await clearSession(ctx.dbUser.id);
    await ctx.reply('⚠️ Please enter a valid positive number.', {
      reply_markup: backToLiquidityKeyboard(),
    });
    return;
  }

  try {
    const pools = await listPools();
    const pool = pools.find((p) => p.poolKey === poolKey);
    if (!pool) {
      await clearSession(ctx.dbUser.id);
      await ctx.reply('⚠️ Pool not found.', { reply_markup: backToLiquidityKeyboard() });
      return;
    }

    const [tA, tB] = await Promise.all([resolveToken(pool.assetA), resolveToken(pool.assetB)]);
    const rawA = Math.round(amount * Math.pow(10, tA.decimals));

    // Calculate proportional amountB from pool ratio
    const ratio = Number(pool.reserveB) / Number(pool.reserveA);
    const rawB = Math.round(rawA * ratio);

    const est = await quoteAddLiquidity(
      pool.assetA,
      pool.assetB,
      String(rawA),
      String(rawB),
      pool.feeBps,
    );

    const actualA = fmtAmt(est.estimate.actualAmountA, tA.decimals);
    const actualB = fmtAmt(est.estimate.actualAmountB, tB.decimals);
    const lpMinted = fmtAmt(est.estimate.lpMinted, 8);

    await setSession(ctx.dbUser.id, {
      step: 'lp:confirm',
      lpPoolKey: poolKey,
      lpAmountA: String(rawA),
      lpAmountB: String(rawB),
      lpFeeBps: String(pool.feeBps),
    });

    await ctx.reply(`
📥 *Add Liquidity — Confirm*

┌─────────────────────────
│ Deposit: *${actualA} ${tA.name}* + *${actualB} ${tB.name}*
│ LP Tokens: *~${lpMinted}*
│ Pool: *${tA.name}/${tB.name}* (${pool.feeBps / 100}%)
└─────────────────────────

Confirm adding liquidity?
    `.trim(), {
      parse_mode: 'Markdown',
      reply_markup: lpConfirmKeyboard(),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to estimate add-liquidity');
    await clearSession(ctx.dbUser.id);
    await ctx.reply('⚠️ Could not estimate liquidity. Please try again.', {
      reply_markup: backToLiquidityKeyboard(),
    });
  }
}

// ── Step 4a: Confirm add liquidity ────────

export async function handleLpConfirm(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const session = await getSession(ctx.dbUser.id);
  if (session.step !== 'lp:confirm' || !session.lpPoolKey || !session.lpAmountA || !session.lpAmountB) {
    await clearSession(ctx.dbUser.id);
    await editOrReply(ctx, '⚠️ Session expired. Use /liquidity to start over.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLiquidityKeyboard(),
    });
    return;
  }

  try {
    const pools = await listPools();
    const pool = pools.find((p) => p.poolKey === session.lpPoolKey);
    if (!pool) throw new Error('Pool not found');

    const wallet = await generateWalletForUser(ctx.dbUser.id);
    const seed = await decryptWalletSeed(ctx.dbUser.id);
    if (!seed) throw new Error('Could not decrypt wallet seed');

    const built = await buildAddLiquidityTx(
      pool.assetA,
      pool.assetB,
      session.lpAmountA,
      session.lpAmountB,
      Number(session.lpFeeBps) || 30,
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

    const [tA, tB] = await Promise.all([resolveToken(pool.assetA), resolveToken(pool.assetB)]);
    const aA = fmtAmt(session.lpAmountA, tA.decimals);
    const aB = fmtAmt(session.lpAmountB, tB.decimals);

    await audit({
      actorType: 'user',
      actorId: ctx.dbUser.id,
      action: 'add_liquidity',
      targetType: 'user',
      targetId: ctx.dbUser.id,
      metadata: { poolKey: session.lpPoolKey, amountA: session.lpAmountA, amountB: session.lpAmountB, txId: result.id },
    });

    await editOrReply(ctx, `
✅ *Liquidity Added!*

Deposited *${aA} ${tA.name}* + *${aB} ${tB.name}*

🔗 TX: \`${result.id}\`
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLiquidityKeyboard(),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to add liquidity');
    await clearSession(ctx.dbUser.id);
    await editOrReply(ctx, '⚠️ Add-liquidity transaction failed. Please try again.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLiquidityKeyboard(),
    });
  }
}

// ── Remove liquidity — ask LP amount ──────

export async function handleLpRemove(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const idx = parseInt(data.replace('lpr_', ''), 10);

  try {
    const wallet = await generateWalletForUser(ctx.dbUser.id);
    const [pools, positions] = await Promise.all([
      listPools(),
      getUserPositions(wallet.address),
    ]);
    poolsCache = pools;

    const pool = pools[idx];
    if (!pool) {
      await editOrReply(ctx, '⚠️ Pool not found.', {
        parse_mode: 'Markdown' as const,
        reply_markup: backToLiquidityKeyboard(),
      });
      return;
    }

    const position = positions.find((p) => p.token0 === pool.assetA && p.token1 === pool.assetB);
    if (!position || Number(position.lpBalance) === 0) {
      await editOrReply(ctx, '⚠️ You have no LP tokens in this pool.', {
        parse_mode: 'Markdown' as const,
        reply_markup: backToLiquidityKeyboard(),
      });
      return;
    }

    const [tA, tB] = await Promise.all([resolveToken(pool.assetA), resolveToken(pool.assetB)]);
    const lpBal = fmtAmt(position.lpBalance, 8);

    await setSession(ctx.dbUser.id, {
      step: 'lp:enter_remove_amount',
      lpPoolKey: pool.poolKey,
      lpFeeBps: String(pool.feeBps),
    });

    await editOrReply(ctx, `
📤 *Remove Liquidity — ${tA.name}/${tB.name}*

Your LP tokens: *${lpBal}*
Share: *${position.poolSharePct.toFixed(2)}%*

Enter percentage to remove (1-100) or "max":
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLiquidityKeyboard(),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start remove-liquidity');
    await editOrReply(ctx, '⚠️ Could not load position data.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLiquidityKeyboard(),
    });
  }
}

// ── Remove amount entered → estimate ──────

export async function handleLpRemoveAmount(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.message?.text) return;

  const session = await getSession(ctx.dbUser.id);
  const poolKey = session.lpPoolKey;
  if (!poolKey) {
    await clearSession(ctx.dbUser.id);
    await ctx.reply('⚠️ Session expired. Use /liquidity to start over.', {
      reply_markup: backToLiquidityKeyboard(),
    });
    return;
  }

  const text = ctx.message.text.trim().toLowerCase();
  const pct = text === 'max' ? 100 : parseFloat(text);

  if (isNaN(pct) || pct <= 0 || pct > 100) {
    await clearSession(ctx.dbUser.id);
    await ctx.reply('⚠️ Enter a percentage between 1 and 100.', {
      reply_markup: backToLiquidityKeyboard(),
    });
    return;
  }

  try {
    const wallet = await generateWalletForUser(ctx.dbUser.id);
    const [pools, positions] = await Promise.all([
      listPools(),
      getUserPositions(wallet.address),
    ]);

    const pool = pools.find((p) => p.poolKey === poolKey);
    if (!pool) throw new Error('Pool not found');

    const position = positions.find((p) => p.token0 === pool.assetA && p.token1 === pool.assetB);
    if (!position || Number(position.lpBalance) === 0) throw new Error('No position');

    const lpToRemove = Math.floor(Number(position.lpBalance) * (pct / 100));
    const [tA, tB] = await Promise.all([resolveToken(pool.assetA), resolveToken(pool.assetB)]);

    const est = await quoteRemoveLiquidity(
      pool.assetA,
      pool.assetB,
      String(lpToRemove),
      pool.feeBps,
    );

    const estA = fmtAmt(est.estimate.amountA, tA.decimals);
    const estB = fmtAmt(est.estimate.amountB, tB.decimals);

    await setSession(ctx.dbUser.id, {
      step: 'lp:confirm_remove',
      lpPoolKey: poolKey,
      lpRemoveAmount: String(lpToRemove),
      lpFeeBps: String(pool.feeBps),
    });

    await ctx.reply(`
📤 *Remove Liquidity — Confirm*

┌─────────────────────────
│ Removing: *${pct}%* of position
│ Receive: *~${estA} ${tA.name}* + *~${estB} ${tB.name}*
│ Pool: *${tA.name}/${tB.name}*
└─────────────────────────

Confirm removing liquidity?
    `.trim(), {
      parse_mode: 'Markdown',
      reply_markup: lpRemoveConfirmKeyboard(),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to estimate remove-liquidity');
    await clearSession(ctx.dbUser.id);
    await ctx.reply('⚠️ Could not estimate removal. Please try again.', {
      reply_markup: backToLiquidityKeyboard(),
    });
  }
}

// ── Confirm remove liquidity ──────────────

export async function handleLpRemoveConfirm(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const session = await getSession(ctx.dbUser.id);
  if (session.step !== 'lp:confirm_remove' || !session.lpPoolKey || !session.lpRemoveAmount) {
    await clearSession(ctx.dbUser.id);
    await editOrReply(ctx, '⚠️ Session expired. Use /liquidity to start over.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLiquidityKeyboard(),
    });
    return;
  }

  try {
    const pools = await listPools();
    const pool = pools.find((p) => p.poolKey === session.lpPoolKey);
    if (!pool) throw new Error('Pool not found');

    const wallet = await generateWalletForUser(ctx.dbUser.id);
    const seed = await decryptWalletSeed(ctx.dbUser.id);
    if (!seed) throw new Error('Could not decrypt wallet seed');

    const built = await buildRemoveLiquidityTx(
      pool.assetA,
      pool.assetB,
      session.lpRemoveAmount,
      Number(session.lpFeeBps) || 30,
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

    const [tA, tB] = await Promise.all([resolveToken(pool.assetA), resolveToken(pool.assetB)]);

    await audit({
      actorType: 'user',
      actorId: ctx.dbUser.id,
      action: 'remove_liquidity',
      targetType: 'user',
      targetId: ctx.dbUser.id,
      metadata: { poolKey: session.lpPoolKey, lpAmount: session.lpRemoveAmount, txId: result.id },
    });

    await editOrReply(ctx, `
✅ *Liquidity Removed!*

Withdrew from *${tA.name}/${tB.name}* pool.

🔗 TX: \`${result.id}\`
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLiquidityKeyboard(),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to remove liquidity');
    await clearSession(ctx.dbUser.id);
    await editOrReply(ctx, '⚠️ Remove-liquidity transaction failed. Please try again.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLiquidityKeyboard(),
    });
  }
}
