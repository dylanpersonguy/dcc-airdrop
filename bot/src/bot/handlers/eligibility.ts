// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Eligibility & Airdrop Handlers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import { eligibilityMessage, allocationMessage } from '../messages';
import { backToMainKeyboard } from '../keyboards';
import { editOrReply } from '../utils';
import { getUserWallet } from '../../services/users';
import { getCachedTrackerState, getCachedBalances, getCurrentHeight } from '../../services/blockchain';
import { evaluateEligibility } from '../../services/eligibility';
import { calculateAllocation } from '../../services/allocation';
import { getReferralStats, advanceReferralStatus } from '../../services/referrals';
import { getTotalDccBought } from '../../services/purchases';
import { getLockedAmount } from '../../services/locks';
import { logger } from '../../utils/logger';

const MD = { parse_mode: 'Markdown' as const };

/**
 * Show eligibility checklist.
 */
export async function handleMyEligibility(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;

  const wallet = await getUserWallet(ctx.dbUser.id);
  if (!wallet) {
    await editOrReply(ctx, '❌ Wallet not found. Send /start to set up.', { ...MD, reply_markup: backToMainKeyboard() });
    return;
  }

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: 'Loading eligibility...' }).catch(() => {});
  }

  // Show loading indicator immediately
  await editOrReply(ctx, '⏳ Loading eligibility data...', { ...MD, reply_markup: backToMainKeyboard() });

  try {
    const [tracker, balances, currentHeight, totalDccBought, totalDccLocked, refStats] = await Promise.all([
      getCachedTrackerState(wallet.address),
      getCachedBalances(wallet.address),
      getCurrentHeight(),
      getTotalDccBought(ctx.dbUser.id),
      getLockedAmount(ctx.dbUser.id),
      getReferralStats(ctx.dbUser.id),
    ]);

    const directReferralCount = refStats.tiers.find((t) => t.tier === 1)?.referred ?? 0;
    const result = evaluateEligibility({ tracker, balances, currentHeight, totalDccBought, totalDccLocked, directReferralCount });

    if (result.eligible) {
      await advanceReferralStatus(ctx.dbUser.id, 'ELIGIBLE');
    }

    const msg = eligibilityMessage(wallet.address, result);
    await editOrReply(ctx, msg, { ...MD, reply_markup: backToMainKeyboard() });
  } catch (err) {
    logger.error({ err, wallet: wallet.address }, 'Failed to fetch eligibility data');
    await editOrReply(
      ctx,
      '⚠️ *Blockchain Unavailable*\n\nCould not reach the DecentralChain node to check eligibility. Please try again later.',
      { ...MD, reply_markup: backToMainKeyboard() },
    );
  }
}

/**
 * Show estimated airdrop allocation.
 */
export async function handleMyAirdrop(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;

  const wallet = await getUserWallet(ctx.dbUser.id);
  if (!wallet) {
    await editOrReply(ctx, '❌ Wallet not found. Send /start to set up.', { ...MD, reply_markup: backToMainKeyboard() });
    return;
  }

  await ctx.answerCallbackQuery?.({ text: 'Calculating allocation...' }).catch(() => {});

  // Show loading indicator immediately
  await editOrReply(ctx, '⏳ Calculating your airdrop allocation...', { ...MD, reply_markup: backToMainKeyboard() });

  try {
    const [tracker, balances, currentHeight, refStats, totalDccBought, totalDccLocked] = await Promise.all([
      getCachedTrackerState(wallet.address),
      getCachedBalances(wallet.address),
      getCurrentHeight(),
      getReferralStats(ctx.dbUser.id),
      getTotalDccBought(ctx.dbUser.id),
      getLockedAmount(ctx.dbUser.id),
    ]);

    const directReferralCount = refStats.tiers.find((t) => t.tier === 1)?.referred ?? 0;
    const eligibility = evaluateEligibility({ tracker, balances, currentHeight, totalDccBought, totalDccLocked, directReferralCount });

    const allocation = calculateAllocation({
      eligible: eligibility.eligible,
      tracker,
      balances,
      verifiedReferralCount: refStats.verifiedReferred,
      eligibleReferralCount: refStats.eligibleReferred,
    });

    const msg = allocationMessage(allocation);
    await editOrReply(ctx, msg, { ...MD, reply_markup: backToMainKeyboard() });
  } catch (err) {
    logger.error({ err, wallet: wallet.address }, 'Failed to fetch allocation data');
    await editOrReply(
      ctx,
      '⚠️ *Blockchain Unavailable*\n\nCould not reach the DecentralChain node to calculate your allocation. Please try again later.',
      { ...MD, reply_markup: backToMainKeyboard() },
    );
  }
}
