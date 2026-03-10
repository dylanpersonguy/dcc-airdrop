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
  getPoolStats,
  getOnChainPoolAPY,
  quoteAddLiquidity,
  buildAddLiquidityTx,
  quoteRemoveLiquidity,
  buildRemoveLiquidityTx,
  type PoolSnapshot,
  type TokenInfo,
  type PoolStats,
} from '../../services/amm';
import { generateWalletForUser, decryptWalletSeed } from '../../services/wallet';
import { getCachedBalances, invalidateCache, notifyTrackerLpAdd, notifyTrackerLpRemove } from '../../services/blockchain';
import { invokeScript, broadcast } from '@waves/waves-transactions';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { audit } from '../../utils/audit';
import { WAVELETS_PER_DCC, DCC_CHAIN_ID } from '../../config/constants';

// ── Featured pool ─────────────────────────
const FEATURED_POOL_KEY = 'p:DCC:8MFwa1h8Y6SBc6B3BJwYfC4Fe13EFx5ifkAziXAZRVvc:35';

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

function liquidityMenuKeyboard(
  pools: PoolSnapshot[],
  labels: string[],
  hasDCC: boolean,
  hasStDCC: boolean,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let i = 0; i < Math.min(pools.length, 8); i++) {
    if (hasDCC && hasStDCC) {
      kb.text(`⚡ Quick Add LP — ${labels[i]}`, `lp_quick_${i}`).row();
    }
    kb.text(`🔍 ${labels[i]} Details`, `lpp_${i}`).row();
  }

  if (!hasDCC) {
    kb.text('💳 Buy DCC First', 'buy').row();
  }
  if (!hasStDCC) {
    kb.text('🥩 Stake DCC → stDCC', 'stake').row();
  }

  kb.text('📊 My Positions', 'lp_positions').row();
  kb.text('◀️ Main Menu', 'main_menu');
  return kb;
}

function poolActionKeyboard(poolIdx: number, hasPosition: boolean, hasDCC: boolean, hasStDCC: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (hasDCC && hasStDCC) {
    kb.text('⚡ Quick Add LP', `lp_quick_${poolIdx}`).row();
  }
  kb.text('📥 Add Liquidity (Custom)', `lpa_${poolIdx}`).row();
  if (hasPosition) {
    kb.text('📤 Remove Liquidity', `lpr_${poolIdx}`).row();
  }
  if (!hasDCC) {
    kb.text('💳 Buy DCC', 'buy').row();
  }
  if (!hasStDCC) {
    kb.text('🥩 Stake DCC → stDCC', 'stake').row();
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
    const wallet = await generateWalletForUser(ctx.dbUser.id);
    const allPools = await listPools();
    const pools = allPools.filter((p) => p.poolKey === FEATURED_POOL_KEY);
    poolsCache = pools;

    if (pools.length === 0) {
      await editOrReply(ctx, '🌊 *Liquidity Pools*\n\nNo active pools found.', {
        parse_mode: 'Markdown' as const,
        reply_markup: backToMainKeyboard(),
      });
      return;
    }

    // Fetch balances + stats in parallel
    const balances = await getCachedBalances(wallet.address);
    const stats = await Promise.all(
      pools.map((p) => getPoolStats(p.poolKey).catch(() => null))
    );

    const dccBal = Number(balances.dccBalance) / WAVELETS_PER_DCC;
    const stDCCBal = Number(balances.stDCCBalance) / WAVELETS_PER_DCC;
    const hasDCC = dccBal > 0.01;
    const hasStDCC = stDCCBal > 0.01;

    // Build pool lines with APY
    const lines: string[] = [];
    const labels: string[] = [];
    for (let i = 0; i < pools.length; i++) {
      const p = pools[i];
      const [tA, tB] = await Promise.all([resolveToken(p.assetA), resolveToken(p.assetB)]);
      const rA = fmtAmt(p.reserveA, tA.decimals);
      const rB = fmtAmt(p.reserveB, tB.decimals);
      const stat = stats[i];
      // Try indexer APY first, fall back to on-chain computation
      let poolApy = stat?.apy ?? 0;
      let feeInfo = '';
      if (poolApy <= 0) {
        const onChain = await getOnChainPoolAPY(p.poolKey);
        poolApy = onChain.apy;
        if (onChain.totalFeeDcc > 0) {
          feeInfo = `\n│ 💰 Fees earned: ${onChain.totalFeeDcc.toFixed(2)} DCC`;
        }
      }
      const apyStr = poolApy > 0 ? `🔥 *${poolApy.toFixed(1)}% APY*` : '📊 *0.0% APY*';

      const tvlDcc = (Number(p.reserveA) + Number(p.reserveB)) / 1e8;
      lines.push(
        `┌ *${tA.name}/${tB.name}* — ${p.feeBps / 100}% fee\n` +
        `│ 💧 ${rA} ${tA.name} / ${rB} ${tB.name}\n` +
        `│ ${apyStr}${feeInfo}\n` +
        `│ 🏦 TVL: ${tvlDcc.toFixed(2)} DCC\n` +
        `└ 📊 Price: 1 ${tA.name} = ${p.priceAtoB.toFixed(4)} ${tB.name}`
      );
      labels.push(`${tA.name}/${tB.name}`);
    }

    // Wallet status lines
    let walletStatus = '';
    if (!hasDCC && !hasStDCC) {
      walletStatus = '\n⚠️ _You need both DCC and stDCC to provide liquidity._\n👉 Use /buy to get DCC, then /stake to get stDCC.';
    } else if (!hasDCC) {
      walletStatus = '\n⚠️ _You need DCC to provide liquidity._\n👉 Use /buy to purchase DCC.';
    } else if (!hasStDCC) {
      walletStatus = '\n⚠️ _You need stDCC to provide liquidity._\n👉 Use /stake to convert DCC → stDCC.';
    } else {
      walletStatus = `\n✅ *Your balance:* ${dccBal.toFixed(2)} DCC + ${stDCCBal.toFixed(2)} stDCC`;
    }

    await editOrReply(ctx, `
🌊 *Liquidity Pools*

Provide liquidity to earn trading fees from every swap. Deposit equal value of both tokens and receive LP tokens representing your share of the pool.

*How it works:*
1️⃣ You deposit DCC + stDCC into the pool
2️⃣ Traders swap between them, paying fees
3️⃣ Fees accumulate in the pool, growing your share
4️⃣ Withdraw anytime to receive your tokens + earned fees

━━━━━━━━━━━━━━━━━━━━

${lines.join('\n\n')}

━━━━━━━━━━━━━━━━━━━━
${walletStatus}
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: liquidityMenuKeyboard(pools, labels, hasDCC, hasStDCC),
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
    const [allPools, positions, balances] = await Promise.all([
      listPools(),
      getUserPositions(wallet.address),
      getCachedBalances(wallet.address),
    ]);
    const pools = allPools.filter((p) => p.poolKey === FEATURED_POOL_KEY);
    poolsCache = pools;

    const pool = pools[idx];
    if (!pool) {
      await editOrReply(ctx, '⚠️ Pool not found.', {
        parse_mode: 'Markdown' as const,
        reply_markup: backToLiquidityKeyboard(),
      });
      return;
    }

    const [tA, tB, stat, onChainApy] = await Promise.all([
      resolveToken(pool.assetA),
      resolveToken(pool.assetB),
      getPoolStats(pool.poolKey).catch(() => null),
      getOnChainPoolAPY(pool.poolKey),
    ]);
    const rA = fmtAmt(pool.reserveA, tA.decimals);
    const rB = fmtAmt(pool.reserveB, tB.decimals);
    const poolApy = (stat && stat.apy > 0) ? stat.apy : onChainApy.apy;
    const apyStr = poolApy > 0 ? `${poolApy.toFixed(1)}%` : '0.0%';
    const feesLine = onChainApy.totalFeeDcc > 0 ? `\n│ 💰 Fees earned: *${onChainApy.totalFeeDcc.toFixed(2)} DCC*` : '';

    const position = positions.find((p) => p.token0 === pool.assetA && p.token1 === pool.assetB);
    let positionLine = '_You have no position in this pool._';
    if (position && Number(position.lpBalance) > 0) {
      const uA = fmtAmt(position.userReserve0, tA.decimals);
      const uB = fmtAmt(position.userReserve1, tB.decimals);
      positionLine = `Your share: *${position.poolSharePct.toFixed(2)}%* (${uA} ${tA.name} + ${uB} ${tB.name})`;
    }

    const dccBal = Number(balances.dccBalance) / WAVELETS_PER_DCC;
    const stDCCBal = Number(balances.stDCCBalance) / WAVELETS_PER_DCC;
    const hasDCC = dccBal > 0.01;
    const hasStDCC = stDCCBal > 0.01;

    const balanceLine = hasDCC && hasStDCC
      ? `💰 Your balance: *${dccBal.toFixed(2)} DCC* + *${stDCCBal.toFixed(2)} stDCC*`
      : !hasDCC && !hasStDCC
        ? '⚠️ You need DCC (/buy) and stDCC (/stake) to add liquidity'
        : !hasDCC
          ? '⚠️ You need DCC — use /buy to purchase'
          : '⚠️ You need stDCC — use /stake to convert DCC → stDCC';

    const tvlDcc = (Number(pool.reserveA) + Number(pool.reserveB)) / 1e8;

    await editOrReply(ctx, `
🌊 *${tA.name} / ${tB.name}* Pool

┌─────────────────────────
│ 💧 Reserves: *${rA} ${tA.name}* / *${rB} ${tB.name}*
│ 📊 Price: *1 ${tA.name} = ${pool.priceAtoB.toFixed(6)} ${tB.name}*
│ 💰 Fee: *${pool.feeBps / 100}%*
│ 🔥 APY: *${apyStr}*${feesLine}
│ 🏦 TVL: *${tvlDcc.toFixed(2)} DCC*
│ ──────────────────
│ ${positionLine}
│ ${balanceLine}
└─────────────────────────

${hasDCC && hasStDCC ? '_⚡ Quick Add LP uses your full balance (proportional to pool ratio)._' : ''}
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: poolActionKeyboard(idx, !!(position && Number(position.lpBalance) > 0), hasDCC, hasStDCC),
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

// ── Quick Add LP — one-tap full-balance ───

export async function handleLpQuickAdd(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const idx = parseInt(data.replace('lp_quick_', ''), 10);

  try {
    const wallet = await generateWalletForUser(ctx.dbUser.id);
    const [allPools, balances] = await Promise.all([
      listPools(),
      getCachedBalances(wallet.address),
    ]);
    const pools = allPools.filter((p) => p.poolKey === FEATURED_POOL_KEY);
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

    // Calculate max proportional deposit based on both balances
    const dccRaw = Number(balances.dccBalance);
    const stDCCRaw = Number(balances.stDCCBalance);

    // Reserve DCC for transaction fees (1.005 DCC = 100_500_000 wavelets for invokeScript)
    const feeReserve = 101_000_000;
    const availDCC = Math.max(0, dccRaw - feeReserve);
    const availStDCC = stDCCRaw;

    if (availDCC <= 0 || availStDCC <= 0) {
      const missing = availDCC <= 0 ? 'DCC' : 'stDCC';
      const action = missing === 'DCC' ? '/buy' : '/stake';
      await editOrReply(ctx, `⚠️ Not enough ${missing} to add liquidity.\n\n👉 Use ${action} to get ${missing} first.`, {
        parse_mode: 'Markdown' as const,
        reply_markup: backToLiquidityKeyboard(),
      });
      return;
    }

    // Calculate proportional amounts based on pool ratio
    const r0 = Number(pool.reserveA);
    const r1 = Number(pool.reserveB);
    const ratio = r0 > 0 ? r1 / r0 : 1;

    // Determine max we can deposit (limited by whichever runs out first)
    let rawA: number, rawB: number;
    const neededB = Math.round(availDCC * ratio);
    if (neededB <= availStDCC) {
      rawA = availDCC;
      rawB = neededB;
    } else {
      rawB = availStDCC;
      rawA = Math.round(availStDCC / ratio);
    }

    if (rawA <= 0 || rawB <= 0) {
      await editOrReply(ctx, '⚠️ Balance too low to add meaningful liquidity.', {
        parse_mode: 'Markdown' as const,
        reply_markup: backToLiquidityKeyboard(),
      });
      return;
    }

    const seed = await decryptWalletSeed(ctx.dbUser.id);
    if (!seed) throw new Error('Could not decrypt wallet seed');

    await editOrReply(ctx, `⏳ *Adding liquidity...*\n\nDepositing *${fmtAmt(String(rawA), tA.decimals)} ${tA.name}* + *${fmtAmt(String(rawB), tB.decimals)} ${tB.name}*`, {
      parse_mode: 'Markdown' as const,
    });

    const built = await buildAddLiquidityTx(
      pool.assetA,
      pool.assetB,
      String(rawA),
      String(rawB),
      pool.feeBps,
    );

    const signedTx = invokeScript({
      dApp: built.tx.dApp,
      call: built.tx.call as any,
      payment: built.tx.payment,
      fee: built.tx.fee,
      chainId: DCC_CHAIN_ID,
    }, seed);

    const result = await broadcast(signedTx, config.DCC_NODE_URL);

    await invalidateCache(wallet.address);

    // Record LP activity on the eligibility tracker (fire-and-forget)
    notifyTrackerLpAdd(wallet.address, pool.poolKey, built.tx.dApp).catch(() => {});

    await audit({
      actorType: 'user',
      actorId: ctx.dbUser.id,
      action: 'add_liquidity',
      targetType: 'user',
      targetId: ctx.dbUser.id,
      metadata: { poolKey: pool.poolKey, amountA: String(rawA), amountB: String(rawB), txId: result.id, quick: true },
    });

    await editOrReply(ctx, `
✅ *Liquidity Added!*

Deposited *${fmtAmt(String(rawA), tA.decimals)} ${tA.name}* + *${fmtAmt(String(rawB), tB.decimals)} ${tB.name}*

You're now earning fees from every ${tA.name}/${tB.name} swap! 🎉

🔗 TX: \`${result.id}\`
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: backToLiquidityKeyboard(),
    });
  } catch (err) {
    logger.error({ err }, 'Quick add liquidity failed');
    await editOrReply(ctx, '⚠️ Quick add liquidity failed. Please try again or use custom amounts.', {
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
    const wallet = await generateWalletForUser(ctx.dbUser.id);
    const [pools, balances] = await Promise.all([
      listPools(),
      getCachedBalances(wallet.address),
    ]);
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

    // Validate user has enough of both tokens
    const dccBal = Number(balances.dccBalance);
    const stDCCBal = Number(balances.stDCCBalance);
    const feeReserve = 1_00500000; // 1.005 DCC for tx fees

    if (dccBal < rawA + feeReserve) {
      await clearSession(ctx.dbUser.id);
      const have = (dccBal / WAVELETS_PER_DCC).toFixed(2);
      const need = (rawA / WAVELETS_PER_DCC).toFixed(2);
      await ctx.reply(`⚠️ *Insufficient DCC*\n\nYou have *${have} DCC* but need *${need} DCC* (+ fees).\n\nUse /buy to get more DCC.`, {
        parse_mode: 'Markdown',
        reply_markup: backToLiquidityKeyboard(),
      });
      return;
    }

    if (stDCCBal < rawB) {
      await clearSession(ctx.dbUser.id);
      const have = (stDCCBal / WAVELETS_PER_DCC).toFixed(4);
      const need = (rawB / WAVELETS_PER_DCC).toFixed(4);
      await ctx.reply(`⚠️ *Insufficient stDCC*\n\nYou have *${have} stDCC* but need *${need} stDCC*.\n\nUse /stake to convert DCC → stDCC first.`, {
        parse_mode: 'Markdown',
        reply_markup: backToLiquidityKeyboard(),
      });
      return;
    }

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
    await invalidateCache(wallet.address);

    // Record LP activity on the eligibility tracker (fire-and-forget)
    notifyTrackerLpAdd(wallet.address, session.lpPoolKey!, built.tx.dApp).catch(() => {});

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
    await invalidateCache(wallet.address);

    // Check if user still has LP after removal, then record on tracker
    const positionsAfter = await getUserPositions(wallet.address).catch(() => []);
    const stillInThisPool = positionsAfter.some((p) => p.poolId === session.lpPoolKey && Number(p.lpBalance) > 0);
    const stillHasAnyLp = positionsAfter.some((p) => Number(p.lpBalance) > 0);
    notifyTrackerLpRemove(wallet.address, session.lpPoolKey!, built.tx.dApp, stillHasAnyLp, stillInThisPool).catch(() => {});

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
