// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Explainer Handler — Step-by-step eligibility guide
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import { InlineKeyboard } from 'grammy';
import { editOrReply } from '../utils';

const MD = { parse_mode: 'Markdown' as const };

const explainerKeyboard = new InlineKeyboard()
  .text('📋 Check Eligibility', 'my_eligibility').row()
  .text('◀️ Main Menu', 'main_menu');

export async function handleExplainer(ctx: BotContext): Promise<void> {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const msg = `
📖 *Airdrop Eligibility Guide*

Complete *all 13 steps* to earn *3,500 DCC* in the airdrop. Each step has a quick action command you can use right here in the bot.

━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ *Wallet age ≥ 7 days*
Your wallet must be at least 7 days old. This is verified automatically — just wait after signing up.

2️⃣ *Buy at least 100 DCC* → /buy
Purchase 100+ DCC total. Multiple purchases count toward the total.

3️⃣ *Lock at least 100 DCC* → /lock
Lock 100+ DCC in a lock contract. Multiple locks count toward the total.

4️⃣ *100+ stDCC held* → /stake
Stake DCC to receive stDCC. You need to hold at least 100 stDCC in your wallet.

5️⃣ *2+ pools joined* → /liquidity
Add liquidity to at least 2 different LP pools on the AMM.

6️⃣ *Currently providing LP* → /liquidity
You must have an active LP position at the time of the airdrop — don't remove it!

7️⃣ *LP held 7+ days*
Keep your LP position for at least 7 days (~10,080 blocks). The timer starts when you first add LP.

8️⃣ *5+ successful transactions*
Make at least 5 on-chain transactions (swaps, stakes, LP, etc.). This is verified automatically from chain data.

9️⃣ *Invite 1 user to join* → /referrals
Invite at least 1 person using your referral link. They need to join the bot through your link.

🔟 *2+ swaps completed* → /swap
Perform at least 2 token swaps on the AMM (e.g. DCC ↔ stDCC).

1️⃣1️⃣ *2+ dApps used*
Interact with at least 2 different dApps (e.g. the AMM pool + the staking contract). Swaps, stakes, and LP actions each count.

1️⃣2️⃣ *Not sybil-flagged*
Don't operate multiple accounts or use bots. Sybil detection is automatic.

1️⃣3️⃣ *Not already claimed*
You can only claim the airdrop once per wallet.

━━━━━━━━━━━━━━━━━━━━━━━

⚠️ *Important Warning*
If you remove or unlock *any* LP before the airdrop is finished, you will *not* be eligible. Keep your positions active!

💡 *Quick Actions Summary*
• /buy — Purchase DCC
• /lock — Lock DCC
• /stake — Stake DCC for stDCC
• /liquidity — Add LP to pools
• /swap — Swap tokens on the AMM
• /referrals — Invite friends
• /eligibility — Check your progress
`.trim();

  await editOrReply(ctx, msg, { ...MD, reply_markup: explainerKeyboard });
}
