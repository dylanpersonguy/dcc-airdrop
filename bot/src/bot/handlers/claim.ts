// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Claim Status Handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import { claimStatusMessage } from '../messages';
import { backToMainKeyboard } from '../keyboards';
import { editOrReply } from '../utils';
import { getVerifiedWallet } from '../../services/users';
import { getCachedTrackerState, getCachedBalances, getCurrentHeight } from '../../services/blockchain';
import { evaluateEligibility } from '../../services/eligibility';
import { getClaimStatusForUser } from '../../services/claims';

const MD = { parse_mode: 'Markdown' as const };

export async function handleClaimStatus(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;

  const wallet = await getVerifiedWallet(ctx.dbUser.id);
  if (!wallet) {
    const msg = '❌ No verified wallet.\n\nConnect and verify your wallet to check claim status.';
    await editOrReply(ctx, msg, { ...MD, reply_markup: backToMainKeyboard() });
    return;
  }

  await ctx.answerCallbackQuery?.({ text: 'Checking claim status...' }).catch(() => {});

  // Show loading indicator immediately
  await editOrReply(ctx, '⏳ Checking claim status...', { ...MD, reply_markup: backToMainKeyboard() });

  const [tracker, balances, currentHeight] = await Promise.all([
    getCachedTrackerState(wallet.address),
    getCachedBalances(wallet.address),
    getCurrentHeight(),
  ]);

  const eligibility = evaluateEligibility({ tracker, balances, currentHeight });
  const claimStatus = await getClaimStatusForUser(ctx.dbUser.id, wallet.address, eligibility.eligible);

  await editOrReply(ctx, claimStatusMessage(claimStatus), { ...MD, reply_markup: backToMainKeyboard() });
}
