// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stake Handler — Liquid staking via stDCC protocol
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import { InlineKeyboard } from 'grammy';
import { setSession, getSession, clearSession } from '../middleware';
import { backToMainKeyboard } from '../keyboards';
import { editOrReply } from '../utils';
import {
  getExchangeRate,
  getProtocolSnapshot,
  getUserStakingState,
  estimateDeposit,
  estimateWithdraw,
  buildDepositTx,
  buildRequestWithdrawTx,
  broadcastTx,
} from '../../services/staking';
import { generateWalletForUser, decryptWalletSeed } from '../../services/wallet';
import { getCachedBalances, invalidateCache, notifyTrackerStake, notifyTrackerUnstake } from '../../services/blockchain';
import { invokeScript, broadcast } from '@waves/waves-transactions';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { audit } from '../../utils/audit';
import { WAVELETS_PER_DCC, DCC_CHAIN_ID } from '../../config/constants';

// ── Keyboards ─────────────────────────────

function stakeMenuKeyboard(hasBalance: boolean, hasStaked: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (hasBalance) kb.text('📥 Stake DCC', 'stake_deposit').row();
  if (hasStaked) kb.text('📤 Unstake', 'stake_withdraw').row();
  kb.text('🔄 Refresh', 'stake').row();
  kb.text('◀️ Main Menu', 'main_menu');
  return kb;
}

function stakeConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm Stake', 'stake_confirm')
    .text('❌ Cancel', 'stake');
}

function unstakeConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm Unstake', 'unstake_confirm')
    .text('❌ Cancel', 'stake');
}

function backToStakeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('◀️ Staking', 'stake')
    .text('🏠 Menu', 'main_menu');
}

// ── Step 1: Show staking dashboard ────────

export async function handleStake(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const wallet = await generateWalletForUser(ctx.dbUser.id);

  try {
    const [rate, snapshot, onChain] = await Promise.all([
      getExchangeRate(),
      getProtocolSnapshot(),
      getCachedBalances(wallet.address),
    ]);

    // Try to get user staking state; may fail if user has never staked
    let userState: { stDccBalance: string; estimatedDccValue: string } | null = null;
    try {
      userState = await getUserStakingState(wallet.address);
    } catch {
      // User has no staking position — that's fine
    }

    const dccBalance = Number(onChain.dccBalance) / WAVELETS_PER_DCC;
    const stDccBalance = userState ? Number(userState.stDccBalance) / WAVELETS_PER_DCC : 0;
    const estimatedValue = userState ? Number(userState.estimatedDccValue) / WAVELETS_PER_DCC : 0;
    const totalPooled = Number(snapshot.total_pooled_dcc) / WAVELETS_PER_DCC;
    const dccPerStDcc = rate.dccPerStDcc;

    await editOrReply(ctx, `
🥩 *Liquid Staking — stDCC*

┌─────────────────────────
│ 💰 Your DCC: *${dccBalance.toFixed(2)} DCC*
│ 🪙 Your stDCC: *${stDccBalance.toFixed(2)} stDCC*
│ 📊 Est. Value: *${estimatedValue.toFixed(2)} DCC*
│ ──────────────────
│ 📈 Rate: *1 stDCC = ${dccPerStDcc.toFixed(4)} DCC*
│ 🏦 Total Pooled: *${totalPooled.toFixed(2)} DCC*
│ ✅ Validators: *${snapshot.validator_count}*
└─────────────────────────

Stake DCC to earn staking rewards. Your stDCC increases in value over time as rewards are distributed.
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: stakeMenuKeyboard(dccBalance > 1, stDccBalance > 0),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to load staking dashboard');
    await editOrReply(ctx, '⚠️ Could not load staking data. Please try again.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToMainKeyboard(),
    });
  }
}

// ── Step 2a: Stake — ask amount ───────────

export async function handleStakeDeposit(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  await setSession(ctx.dbUser.id, { step: 'stake:enter_amount' });

  const wallet = await generateWalletForUser(ctx.dbUser.id);
  const onChain = await getCachedBalances(wallet.address);
  const dccBalance = Number(onChain.dccBalance) / WAVELETS_PER_DCC;

  await editOrReply(ctx, `
📥 *Stake DCC*

Available: *${dccBalance.toFixed(2)} DCC*

Enter the amount of DCC to stake:
_Type a number (e.g. 10, 50, 100) or "max":_
  `.trim(), {
    parse_mode: 'Markdown' as const,
    reply_markup: backToStakeKeyboard(),
  });
}

// ── Step 2b: Unstake — ask amount ─────────

export async function handleStakeWithdraw(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  await setSession(ctx.dbUser.id, { step: 'stake:enter_unstake_amount' });

  const wallet = await generateWalletForUser(ctx.dbUser.id);
  let stDccBalance = 0;
  try {
    const userState = await getUserStakingState(wallet.address);
    stDccBalance = Number(userState.stDccBalance) / WAVELETS_PER_DCC;
  } catch {
    // no position
  }

  await editOrReply(ctx, `
📤 *Unstake stDCC*

Your stDCC: *${stDccBalance.toFixed(2)} stDCC*

Enter the amount of stDCC to unstake:
_Type a number or "max":_
  `.trim(), {
    parse_mode: 'Markdown' as const,
    reply_markup: backToStakeKeyboard(),
  });
}

// ── Step 3a: Stake amount entered → estimate ─

export async function handleStakeAmount(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.message?.text) return;

  const wallet = await generateWalletForUser(ctx.dbUser.id);
  const onChain = await getCachedBalances(wallet.address);
  const dccBalance = Number(onChain.dccBalance) / WAVELETS_PER_DCC;

  const text = ctx.message.text.trim().toLowerCase();
  const amount = text === 'max' ? Math.floor(dccBalance - 0.01) : parseFloat(text);

  if (isNaN(amount) || amount <= 0) {
    await clearSession(ctx.dbUser.id);
    await ctx.reply('⚠️ Please enter a valid positive number.', {
      reply_markup: backToStakeKeyboard(),
    });
    return;
  }

  if (amount > dccBalance) {
    await clearSession(ctx.dbUser.id);
    await ctx.reply(`⚠️ Insufficient balance. You have *${dccBalance.toFixed(2)} DCC*.`, {
      parse_mode: 'Markdown',
      reply_markup: backToStakeKeyboard(),
    });
    return;
  }

  try {
    const wavelets = Math.round(amount * WAVELETS_PER_DCC);
    const est = await estimateDeposit(wavelets);

    if (est.protocolPaused) {
      await clearSession(ctx.dbUser.id);
      await ctx.reply('⚠️ Staking protocol is currently paused. Try again later.', {
        reply_markup: backToStakeKeyboard(),
      });
      return;
    }

    const sharesToReceive = Number(est.sharesToReceive) / WAVELETS_PER_DCC;

    await setSession(ctx.dbUser.id, {
      step: 'stake:confirm',
      stakeAmount: amount.toString(),
      stakeShares: sharesToReceive.toString(),
    });

    await ctx.reply(`
📥 *Stake DCC — Confirm*

┌─────────────────────────
│ Stake: *${amount} DCC*
│ Receive: *~${sharesToReceive.toFixed(4)} stDCC*
│ Rate: *1 stDCC = ${est.dccPerStDcc.toFixed(4)} DCC*
└─────────────────────────

Confirm this stake?
    `.trim(), {
      parse_mode: 'Markdown',
      reply_markup: stakeConfirmKeyboard(),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to estimate stake');
    await clearSession(ctx.dbUser.id);
    await ctx.reply('⚠️ Could not estimate stake. Please try again.', {
      reply_markup: backToStakeKeyboard(),
    });
  }
}

// ── Step 3b: Unstake amount entered → estimate ─

export async function handleUnstakeAmount(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.message?.text) return;

  const wallet = await generateWalletForUser(ctx.dbUser.id);
  let stDccBalance = 0;
  try {
    const userState = await getUserStakingState(wallet.address);
    stDccBalance = Number(userState.stDccBalance) / WAVELETS_PER_DCC;
  } catch {
    // no position
  }

  const text = ctx.message.text.trim().toLowerCase();
  const shares = text === 'max' ? stDccBalance : parseFloat(text);

  if (isNaN(shares) || shares <= 0) {
    await clearSession(ctx.dbUser.id);
    await ctx.reply('⚠️ Please enter a valid positive number.', {
      reply_markup: backToStakeKeyboard(),
    });
    return;
  }

  if (shares > stDccBalance) {
    await clearSession(ctx.dbUser.id);
    await ctx.reply(`⚠️ Insufficient stDCC. You have *${stDccBalance.toFixed(2)} stDCC*.`, {
      parse_mode: 'Markdown',
      reply_markup: backToStakeKeyboard(),
    });
    return;
  }

  try {
    const sharesWavelets = Math.round(shares * WAVELETS_PER_DCC);
    const est = await estimateWithdraw(sharesWavelets);

    if (est.protocolPaused) {
      await clearSession(ctx.dbUser.id);
      await ctx.reply('⚠️ Staking protocol is currently paused. Try again later.', {
        reply_markup: backToStakeKeyboard(),
      });
      return;
    }

    const dccToReceive = Number(est.dccToReceive) / WAVELETS_PER_DCC;

    await setSession(ctx.dbUser.id, {
      step: 'stake:confirm_unstake',
      stakeAmount: shares.toString(),
      stakeShares: dccToReceive.toString(),
    });

    await ctx.reply(`
📤 *Unstake stDCC — Confirm*

┌─────────────────────────
│ Burn: *${shares} stDCC*
│ Receive: *~${dccToReceive.toFixed(4)} DCC*
│ Rate: *1 stDCC = ${est.dccPerStDcc.toFixed(4)} DCC*
└─────────────────────────

Confirm this unstake?
    `.trim(), {
      parse_mode: 'Markdown',
      reply_markup: unstakeConfirmKeyboard(),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to estimate unstake');
    await clearSession(ctx.dbUser.id);
    await ctx.reply('⚠️ Could not estimate unstake. Please try again.', {
      reply_markup: backToStakeKeyboard(),
    });
  }
}

// ── Step 4a: Confirm stake → sign & broadcast ─

export async function handleStakeConfirm(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const session = await getSession(ctx.dbUser.id);
  const amountStr = session.stakeAmount;

  if (!amountStr || session.step !== 'stake:confirm') {
    await clearSession(ctx.dbUser.id);
    await editOrReply(ctx, '⚠️ Session expired. Use /stake to start over.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToStakeKeyboard(),
    });
    return;
  }

  const amount = parseFloat(amountStr);
  const wavelets = Math.round(amount * WAVELETS_PER_DCC);

  try {
    const wallet = await generateWalletForUser(ctx.dbUser.id);
    const seed = await decryptWalletSeed(ctx.dbUser.id);
    if (!seed) throw new Error('Could not decrypt wallet seed');

    // Build the unsigned tx from the staking API
    const built = await buildDepositTx(wallet.address, wavelets);

    // Sign using @waves/waves-transactions invokeScript
    const signedTx = invokeScript({
      dApp: built.tx.dApp,
      call: built.tx.call as any,
      payment: built.tx.payment,
      fee: built.tx.fee,
      chainId: DCC_CHAIN_ID,
    }, seed);

    // Broadcast via the DCC node
    const result = await broadcast(signedTx, config.DCC_NODE_URL);

    await clearSession(ctx.dbUser.id);
    await invalidateCache(wallet.address);

    // Record stake activity on the eligibility tracker (fire-and-forget)
    notifyTrackerStake(wallet.address, built.tx.dApp).catch(() => {});

    await audit({
      actorType: 'user',
      actorId: ctx.dbUser.id,
      action: 'stake_deposit',
      targetType: 'user',
      targetId: ctx.dbUser.id,
      metadata: { amount, txId: result.id },
    });

    const stakeSuccessKb = new InlineKeyboard()
      .text('🌊 Add Liquidity', 'liquidity').row()
      .text('◀️ Staking', 'stake')
      .text('🏠 Menu', 'main_menu');

    await editOrReply(ctx, `
✅ *Stake Successful!*

Staked *${amount} DCC* → stDCC

🔗 TX: \`${result.id}\`

Your stDCC will increase in value as rewards accumulate.
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: stakeSuccessKb,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to execute stake');
    await clearSession(ctx.dbUser.id);
    await editOrReply(ctx, '⚠️ Stake transaction failed. Please try again.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToStakeKeyboard(),
    });
  }
}

// ── Step 4b: Confirm unstake → sign & broadcast ─

export async function handleUnstakeConfirm(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  await ctx.answerCallbackQuery();

  const session = await getSession(ctx.dbUser.id);
  const sharesStr = session.stakeAmount;

  if (!sharesStr || session.step !== 'stake:confirm_unstake') {
    await clearSession(ctx.dbUser.id);
    await editOrReply(ctx, '⚠️ Session expired. Use /stake to start over.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToStakeKeyboard(),
    });
    return;
  }

  const shares = parseFloat(sharesStr);
  const sharesWavelets = Math.round(shares * WAVELETS_PER_DCC);

  try {
    const wallet = await generateWalletForUser(ctx.dbUser.id);
    const seed = await decryptWalletSeed(ctx.dbUser.id);
    if (!seed) throw new Error('Could not decrypt wallet seed');

    const built = await buildRequestWithdrawTx(wallet.address, sharesWavelets);

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

    // Record unstake activity on the eligibility tracker (fire-and-forget)
    notifyTrackerUnstake(wallet.address, built.tx.dApp, false).catch(() => {});

    await audit({
      actorType: 'user',
      actorId: ctx.dbUser.id,
      action: 'stake_withdraw',
      targetType: 'user',
      targetId: ctx.dbUser.id,
      metadata: { shares, txId: result.id },
    });

    await editOrReply(ctx, `
✅ *Unstake Request Submitted!*

Requested withdrawal of *${shares} stDCC*

🔗 TX: \`${result.id}\`

Your DCC will be available once the withdrawal is finalized.
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: backToStakeKeyboard(),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to execute unstake');
    await clearSession(ctx.dbUser.id);
    await editOrReply(ctx, '⚠️ Unstake transaction failed. Please try again.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToStakeKeyboard(),
    });
  }
}
