// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Help Handlers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import {
  HELP_HOW,
  HELP_ELIGIBILITY,
  HELP_VERIFICATION,
  HELP_CLAIM,
  HELP_SUPPORT,
  HELP_REFERRAL,
  HELP_LOCK,
} from '../messages';
import {
  MIN_LOCK_AMOUNT,
  MAX_LOCK_AMOUNT,
  MAX_ACTIVE_LOCKS,
  LOCK_DURATION_DAYS,
  DAILY_RATE,
  BOOST_TIERS,
} from '../../services/locks';
import { helpMenuKeyboard, backToHelpKeyboard } from '../keyboards';
import { editOrReply } from '../utils';

const MD = { parse_mode: 'Markdown' as const };

export async function handleHelpMenu(ctx: BotContext): Promise<void> {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
  await editOrReply(ctx, '❓ *Help & FAQ*\n\nSelect a topic below:', { ...MD, reply_markup: helpMenuKeyboard() });
}

export async function handleHelpAbout(ctx: BotContext): Promise<void> {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
  await editOrReply(ctx, `
🔗 *What is DecentralChain?*

DecentralChain is a *new Layer 1 blockchain* built for speed, scalability, and true decentralization.

🌐 *Our Mission*
We're building an entire ecosystem from the ground up — with DeFi, staking, an AMM, NFTs, and developer tools all native to the chain.

💰 *The DCC Airdrop*
This bot is distributing approximately *3% or more of the total DCC supply* to early supporters and community members. By participating, you're getting in on the ground floor of a brand-new blockchain ecosystem.

🪙 *DCC — The Native Coin*
DCC powers the entire DecentralChain network: transaction fees, staking rewards, governance votes, and liquidity incentives all run on DCC.

🚀 *What You Can Do*
• /buy — Purchase DCC
• /stake — Stake DCC to earn stDCC rewards
• /liquidity — Provide LP and earn trading fees
• /lock — Lock DCC to boost your airdrop allocation
• /referrals — Invite friends for bonus rewards

🌍 Visit [DecentralChain.io](https://decentralchain.io) for more info.
  `.trim(), { ...MD, reply_markup: backToHelpKeyboard() });
}

export async function handleHelpHow(ctx: BotContext): Promise<void> {
  await editOrReply(ctx, HELP_HOW, { ...MD, reply_markup: backToHelpKeyboard() });
}

export async function handleHelpEligibility(ctx: BotContext): Promise<void> {
  await editOrReply(ctx, HELP_ELIGIBILITY, { ...MD, reply_markup: backToHelpKeyboard() });
}

export async function handleHelpVerification(ctx: BotContext): Promise<void> {
  await editOrReply(ctx, HELP_VERIFICATION, { ...MD, reply_markup: backToHelpKeyboard() });
}

export async function handleHelpClaim(ctx: BotContext): Promise<void> {
  await editOrReply(ctx, HELP_CLAIM, { ...MD, reply_markup: backToHelpKeyboard() });
}

export async function handleHelpSupport(ctx: BotContext): Promise<void> {
  await editOrReply(ctx, HELP_SUPPORT, { ...MD, reply_markup: backToHelpKeyboard() });
}

export async function handleHelpReferral(ctx: BotContext): Promise<void> {
  await editOrReply(ctx, HELP_REFERRAL, { ...MD, reply_markup: backToHelpKeyboard() });
}

export async function handleHelpLock(ctx: BotContext): Promise<void> {
  await editOrReply(ctx, HELP_LOCK({
    minLock: MIN_LOCK_AMOUNT,
    maxLock: MAX_LOCK_AMOUNT,
    maxActive: MAX_ACTIVE_LOCKS,
    durationDays: LOCK_DURATION_DAYS,
    baseDailyRate: DAILY_RATE,
    tiers: BOOST_TIERS,
  }), { ...MD, reply_markup: backToHelpKeyboard() });
}
