// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /start Command Handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import { WELCOME_MESSAGE, welcomeMessageWithBalance } from '../messages';
import { mainMenuKeyboard } from '../keyboards';
import { isValidReferralCode } from '../../utils/validation';
import { recordReferralAttempt, advanceReferralStatus, creditInviteReward } from '../../services/referrals';
import { getTotalOffChainBalance } from '../../services/purchases';
import { generateWalletForUser } from '../../services/wallet';
import { getBoostedRate } from '../../services/locks';
import { getCachedBalances } from '../../services/blockchain';
import { logger } from '../../utils/logger';
import { WAVELETS_PER_DCC } from '../../config/constants';

export async function handleStart(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;

  // Check for referral code in deep link payload: /start <referralCode>
  const payload = ctx.match as string | undefined;
  if (payload && isValidReferralCode(payload)) {
    const result = await recordReferralAttempt(payload, ctx.dbUser.id);
    if (result.success && result.referrerUserId) {
      logger.info(
        { referredUserId: ctx.dbUser.id, referrerCode: payload },
        'Referral recorded from /start deep link',
      );
      // Credit instant 1 DCC invite reward to the direct referrer
      await creditInviteReward(result.referrerUserId, ctx.dbUser.id);
    }
  }

  // Auto-generate wallet on first start
  const generated = await generateWalletForUser(ctx.dbUser.id);
  logger.info({ userId: ctx.dbUser.id, address: generated.address }, 'Wallet ready');

  // Auto-advance referral status since wallet is instantly verified
  await advanceReferralStatus(ctx.dbUser.id, 'WALLET_CONNECTED');
  await advanceReferralStatus(ctx.dbUser.id, 'WALLET_VERIFIED');

  // Show off-chain balance if user has any
  const [balance, boost, onChain] = await Promise.all([
    getTotalOffChainBalance(ctx.dbUser.id),
    getBoostedRate(ctx.dbUser.id),
    getCachedBalances(generated.address),
  ]);
  const onChainDCC = Number(onChain.dccBalance) / WAVELETS_PER_DCC;

  // Show full onboarding only on first start (user created within last 10s)
  const isNewUser = Date.now() - ctx.dbUser.createdAt.getTime() < 10_000;
  const hasBalance = balance.totalAvailable > 0 || balance.locked > 0 || onChainDCC > 0;

  let message: string;
  if (isNewUser && !hasBalance) {
    message = WELCOME_MESSAGE;
  } else {
    message = welcomeMessageWithBalance(balance.totalAvailable, balance.locked, onChainDCC, boost.referralCount, boost.rate, generated.address);
  }

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: mainMenuKeyboard(),
  });
}
