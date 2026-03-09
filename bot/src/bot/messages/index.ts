// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Message Templates — Modern Multi-Level
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { EligibilityResult, AllocationResult, ReferralStats, ReferralTreeNode } from '../../types';
import { escapeMarkdown } from '../../utils/validation';
import { DCC_PRICE_USD } from '../../config/constants';

export const WELCOME_MESSAGE = `
🚀 *DecentralChain Airdrop Bot*

Your all-in-one hub for earning, growing, and managing DCC.

━━ *What You Can Do* ━━━━━━━

💳 *Buy DCC* — $0.15/DCC with SOL, USDC, or USDT
🔒 *Lock & Earn* — Lock DCC for 30 days, earn 3–5% daily
👥 *Refer & Boost* — Invite friends to unlock higher rates
💰 *Earn Commissions* — 10%/5%/2% of your referrals' lock earnings
🎁 *Redeem* — Withdraw to your on-chain wallet anytime

━━ *How It Works* ━━━━━━━━━
1️⃣ Your wallet is auto-generated on signup
2️⃣ Buy or earn DCC to build your balance
3️⃣ Lock DCC to earn daily rewards (earnings go straight to your balance)
4️⃣ Invite friends — more referrals = higher lock rates
5️⃣ Redeem to move DCC to your wallet on-chain

━━ *Quick Stats* ━━━━━━━━━━
📏 Lock: 100–15,000 DCC per lock
📈 Base Rate: 3% daily (up to 5% with referrals)
🔢 Up to 15 active locks
👥 3-tier referral commissions

Tap a button below to get started 👇
`.trim();

export function welcomeMessageWithBalance(offChainDCC: number, lockedDCC?: number, onChainDCC?: number, referralCount?: number, lockRate?: number, walletAddress?: string): string {
  const usd = (n: number) => `$${(n * DCC_PRICE_USD).toFixed(2)}`;
  const walletLine = walletAddress
    ? `\n│ 🏦 Wallet: \`${walletAddress}\`` : '';
  const onChainLine = onChainDCC !== undefined && onChainDCC > 0
    ? `\n│ 🔗 On-Chain: *${onChainDCC.toFixed(2)} DCC* (${usd(onChainDCC)})` : '';
  const lockedLine = lockedDCC !== undefined && lockedDCC > 0
    ? `\n│ 🔒 Locked: *${lockedDCC.toFixed(2)} DCC* (${usd(lockedDCC)})` : '';
  const ratePct = lockRate ? (lockRate * 100).toFixed(1) : '3.0';
  const refLine = referralCount !== undefined
    ? `\n│ 👥 Referrals: *${referralCount}* · Lock Rate: *${ratePct}%/day*` : '';

  return `
🚀 *DecentralChain Airdrop Bot*

┌─────────────────────────${walletLine}
│ 🔓 Unlocked: *${offChainDCC.toFixed(2)} DCC* (${usd(offChainDCC)})${lockedLine}${onChainLine}${refLine}
└─────────────────────────

━━ *Quick Actions* ━━━━━━━━
💳 /buy — Purchase DCC ($0.15/DCC)
🔒 /lock — Lock & earn ${ratePct}% daily
📥 /deposit — Deposit on-chain DCC to your balance
🎁 /redeem — Withdraw to your wallet
👥 /referrals — Grow your network

━━ *Earning Overview* ━━━━━
📈 Lock DCC for 30 days → earn daily rewards
💰 Earnings go straight to your balance
🔄 Re-lock earnings to compound your gains
👥 Invite friends → earn 10%/5%/2% of their lock earnings
🏆 More referrals = higher lock rates (up to 5%/day)

Tap a button below 👇
`.trim();
}

export interface WalletDisplayData {
  address: string;
  onChainDCC: number;
  offChainUnlocked: number;
  locked: number;
  lockEarnings: number;
  commissionEarnings: number;
  depositBalance: number;
  referralCount: number;
  lockRate: number;
}

export function walletInfoMessage(data: WalletDisplayData): string {
  const totalOffChain = data.offChainUnlocked + data.locked;
  const totalAll = data.onChainDCC + totalOffChain;
  const usd = (n: number) => `$${(n * DCC_PRICE_USD).toFixed(2)}`;

  const earningsLine = (data.lockEarnings > 0 || data.commissionEarnings > 0)
    ? `\n│ 📈 Lock Earnings: *${data.lockEarnings.toFixed(2)} DCC*\n│ 💎 Commissions: *${data.commissionEarnings.toFixed(2)} DCC*`
    : '';
  const depositLine = data.depositBalance > 0
    ? `\n│ 📥 Deposited: *${data.depositBalance.toFixed(2)} DCC*`
    : '';

  return `
💰 *My Wallet*

┌─────────────────────────
│ 🏦 Address:
│ \`${data.address}\`
│ ──────────────────
│ 🔗 On-Chain: *${data.onChainDCC.toFixed(2)} DCC* (${usd(data.onChainDCC)})
│ 🔓 Off-Chain: *${data.offChainUnlocked.toFixed(2)} DCC* (${usd(data.offChainUnlocked)})
│ 🔒 Locked: *${data.locked.toFixed(2)} DCC* (${usd(data.locked)})${earningsLine}${depositLine}
│ ──────────────────
│ 💰 Total: *${totalAll.toFixed(2)} DCC* (${usd(totalAll)})
└─────────────────────────

👥 Referrals: *${data.referralCount}* · Lock Rate: *${(data.lockRate * 100).toFixed(1)}%/day*

🔑 Tap *Export Seed* to back up your seed phrase.
⚠️ Keep your seed phrase safe — anyone with it can access your funds.
`.trim();
}

export const EXPORT_SEED_WARNING = `
⚠️ *Export Seed Phrase*

Your seed phrase gives *full access* to your wallet.

• Never share it with anyone
• Store it offline in a safe place
• The bot will show it once — save it immediately

Are you sure you want to reveal your seed phrase?
`.trim();

export function seedExportMessage(seed: string): string {
  return `
🔑 *Your Seed Phrase*

\`${seed}\`

⚠️ *SAVE THIS NOW* — it will not be shown again.
• Write it down on paper
• Store it in a secure location
• Never share it with anyone

_This message will be auto-deleted for security._
`.trim();
}

export function eligibilityMessage(wallet: string, result: EligibilityResult): string {
  const status = result.eligible ? '✅ *ELIGIBLE*' : '⏳ *NOT YET ELIGIBLE*';
  const bar = progressBar(result.completedCount, result.totalCount);

  const checklist = result.requirements
    .map((r) => {
      const icon = r.completed ? '✅' : '⬜';
      return `${icon} ${r.label}${r.progress ? ` — _${r.progress}_` : ''}`;
    })
    .join('\n');

  return `
📋 *Eligibility Status*

Wallet: \`${wallet}\`
Status: ${status}

${bar}  ${result.completedCount}/${result.totalCount}

${checklist}
${
  result.missingRequirements.length > 0
    ? `\n💡 _Complete ${result.missingRequirements.length} more to qualify!_`
    : '\n🎉 _All requirements met — you\'re eligible!_'
}
`.trim();
}

function progressBar(done: number, total: number): string {
  const width = 10;
  const filled = Math.round((done / total) * width);
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
}

export function allocationMessage(result: AllocationResult): string {
  const lines = [
    '💰 *My Airdrop Allocation*',
    '',
    `Mode: _${formatMode(result.mode)}_`,
  ];

  if (result.totalEstimatedAmount === 0) {
    lines.push('', '❌ Not eligible yet. Complete all requirements first.');
  } else {
    lines.push('');
    lines.push(`┌───────────────────────`);
    lines.push(`│ Base:     ${result.baseAmount} DCC`);
    if (result.referralBonusAmount > 0) {
      lines.push(`│ Referral: +${result.referralBonusAmount} DCC`);
    }
    lines.push(`│ ──────────────────`);
    lines.push(`│ *Total:   ${result.totalEstimatedAmount} DCC*`);
    lines.push(`└───────────────────────`);

    if (result.score !== null) lines.push(`\n📈 Activity Score: ${result.score}`);
    if (result.multiplier !== null) lines.push(`⚡ Multiplier: ${result.multiplier}x`);
  }

  lines.push('');
  for (const exp of result.explanation) {
    lines.push(`ℹ️ ${exp}`);
  }

  if (result.provisional) {
    lines.push('', '⚠️ _Provisional estimate — final at claim time._');
  }

  return lines.join('\n');
}

// ── Referral messages (multi-level) ───────

export function referralStatsMessage(stats: ReferralStats): string {
  const tierLines = stats.tiers
    .filter((t) => t.referred > 0 || t.rewardAmount > 0)
    .map((t) => {
      const emoji = t.tier === 1 ? '🥇' : t.tier === 2 ? '🥈' : '🥉';
      return `${emoji} *Tier ${t.tier}:*  ${t.referred} referred · ${t.verified} verified · ${t.eligible} eligible · ${t.rewardAmount} DCC`;
    });

  return `
👥 *Referral Dashboard*

🔗 Code: \`${stats.referralCode}\`

━━━━━ Overview ━━━━━
📊 Total Referred: *${stats.totalReferred}*
✅ Verified: *${stats.verifiedReferred}*
🏆 Eligible: *${stats.eligibleReferred}*
💎 Total Earned: *${stats.totalRewardAmount} DCC*

━━━ Network Stats ━━━
🌐 Network Size: *${stats.networkSize}*
🟢 Active Network: *${stats.activeNetworkSize}*
📐 Max Depth: ${stats.maxDepth} tiers

${tierLines.length > 0 ? '━━━ Tier Breakdown ━━━\n' + tierLines.join('\n') : ''}
`.trim();
}

export function referralLinkMessage(stats: ReferralStats): string {
  const tierInfo = stats.tiers.map((t) => {
    const emoji = t.tier === 1 ? '🥇' : t.tier === 2 ? '🥈' : '🥉';
    return `${emoji} Tier ${t.tier}`;
  }).join(' · ');

  return `
🔗 *Your Referral Link*

Share this link to grow your network:

\`${stats.referralLink}\`

Code: \`${stats.referralCode}\`

*Earn multi-tier rewards:*
🥇 Tier 1 — Direct invites
🥈 Tier 2 — Friends of friends
🥉 Tier 3 — Third level

The deeper your network, the more you earn! 🚀
`.trim();
}

export function referralTreeMessage(tree: ReferralTreeNode[]): string {
  if (tree.length === 0) {
    return `
🌳 *My Referral Network*

Your network is empty. Share your referral link to start building!
`.trim();
  }

  const lines = ['🌳 *My Referral Network*', ''];

  function renderNode(node: ReferralTreeNode, prefix: string, isLast: boolean): void {
    const connector = isLast ? '└── ' : '├── ';
    const statusIcon = node.status === 'ELIGIBLE' || node.status === 'REWARDED'
      ? '🟢' : node.status === 'WALLET_VERIFIED' ? '🔵' : '⚪';
    const name = node.username ? `@${escapeMarkdown(node.username)}` : `User`;
    lines.push(`${prefix}${connector}${statusIcon} ${name}`);
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    node.children.forEach((child, idx) => {
      renderNode(child, childPrefix, idx === node.children.length - 1);
    });
  }

  tree.forEach((node, idx) => {
    renderNode(node, '', idx === tree.length - 1);
  });

  lines.push('', '🟢 Eligible  🔵 Verified  ⚪ Pending');

  return lines.join('\n');
}

export function referralLeaderboardMessage(
  entries: Array<{ rank: number; username: string | null; count: number; earned: number }>,
): string {
  if (entries.length === 0) {
    return '🏆 *Referral Leaderboard*\n\nNo data yet.';
  }
  const lines = ['🏆 *Referral Leaderboard*', '', '━━━━━━━━━━━━━━━━━━━━━'];

  for (const e of entries) {
    const medal = e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : `#${e.rank}`;
    const name = e.username ? `@${escapeMarkdown(e.username)}` : 'Anonymous';
    lines.push(`${medal} ${name} — ${e.count} refs · ${e.earned} DCC`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

export function claimStatusMessage(result: { message: string }): string {
  return `📋 *Claim Status*\n\n${result.message}`;
}

function formatMode(mode: string): string {
  switch (mode) {
    case 'fixed': return 'Fixed Allocation';
    case 'score_based': return 'Score-Based';
    case 'base_plus_referral': return 'Base + Referral';
    default: return mode;
  }
}

// ── Help content ──────────────────────────

export const HELP_HOW = `
📘 *How It Works*

━━━━━━━━━━━━━━━━━━━
1️⃣ Your wallet is *auto-created* on /start
2️⃣ *Check* eligibility (10 on-chain criteria)
3️⃣ *Invite* friends — earn through 3 tiers
4️⃣ *Claim* tokens when claiming goes live
━━━━━━━━━━━━━━━━━━━

Tracked by the EligibilityTracker smart contract on-chain.
`.trim();

export const HELP_ELIGIBILITY = `
📋 *Eligibility Rules*

All 10 criteria must be met:

✅ Wallet age ≥ 21 days
✅ 5+ on-chain transactions
✅ Hold 100+ stDCC
✅ 2+ liquidity pools joined
✅ Currently providing LP
✅ LP held for 7+ days
✅ 2+ swaps completed
✅ 2+ dApp interactions
✅ Not flagged as sybil
✅ Not already claimed

_Updated periodically by our indexer._
`.trim();

export const HELP_VERIFICATION = `
🔐 *Wallet Security*

Your wallet is auto-generated and ready to use.

• Tap 💰 *My Wallet* to view your address
• Tap 🔑 *Export Seed* to back up your seed phrase
• Store your seed phrase safely — it's the only way to recover your wallet

⚠️ *We will NEVER ask for your seed phrase.*
`.trim();

export const HELP_CLAIM = `
💰 *Claim FAQ*

*When does claiming open?*
Date TBA — check Claim Status for updates.

*How do I claim?*
Invoke the AirdropClaim contract from your verified wallet.

*Can my allocation change?*
Yes, until claim opens. More activity & referrals = bigger allocation.

*Flagged as sybil?*
Contact support for review.
`.trim();

export const HELP_SUPPORT = `
📞 *Support*

• Official Telegram group
• @dcc\\_support (example)
• Check announcements

⚠️ *We will NEVER DM you first or ask for your seed phrase.*
`.trim();

export const HELP_REFERRAL = `
👥 *Multi-Level Referral Guide*

Our referral program rewards you across *3 tiers*:

🥇 *Tier 1* — Direct invites → Full bonus
🥈 *Tier 2* — Their invites → Reduced bonus
🥉 *Tier 3* — Third level → Smaller bonus

*How it works:*
1. Share your unique referral link
2. Friends join, verify & become eligible
3. You earn rewards for their progress
4. When _they_ invite people, you earn Tier 2!

*Tips:*
• Focus on inviting active DCC users
• Your network grows exponentially
• Track progress in the Referrals menu
`.trim();

export function HELP_LOCK(opts: {
  minLock: number;
  maxLock: number;
  maxActive: number;
  durationDays: number;
  baseDailyRate: number;
  tiers: { minRefs: number; rate: number }[];
}): string {
  const { minLock, maxLock, maxActive, durationDays, baseDailyRate, tiers } = opts;

  const tierLines = tiers
    .filter((t) => t.minRefs > 0)
    .map((t) => `• ${t.minRefs.toLocaleString()}+ referrals: ${(t.rate * 100).toFixed(1)}%`)
    .join('\n');

  return `
🔒 *Lock & Earn Guide*

Lock your DCC for *${durationDays} days* and earn *daily rewards*.

━━ *How It Works* ━━━━━━━━━
1. Use /lock to open the Lock dashboard
2. Create a lock (${minLock.toLocaleString()}–${maxLock.toLocaleString()} DCC per lock)
3. Earn daily rewards at your boosted rate
4. After ${durationDays} days, principal returns and earnings are added to your balance

━━ *Referral Boosts* ━━━━━━━
Your daily rate increases with more referrals:
• Base: ${(baseDailyRate * 100).toFixed(1)}% daily
${tierLines}

━━ *Referral Commission* ━━━
When your referrals' locks complete:
🥇 Direct referral: earn *10%* of their earnings
🥈 2nd level: earn *5%*
🥉 3rd level: earn *2%*

━━ *Limits* ━━━━━━━━━━━━━━━
📏 ${minLock.toLocaleString()}–${maxLock.toLocaleString()} DCC per lock
🔢 Up to ${maxActive} active locks at once

💡 _The more you invite, the more you earn!_
`.trim();
}

export const REFERRAL_RULES = `
📖 *Referral Program Rules*

━━━━━━━━━━━━━━━━━━━

🏗️ *Multi-Level Structure:*
🥇 Tier 1 — Direct referrals (full bonus)
🥈 Tier 2 — 2nd-level referrals (reduced)
🥉 Tier 3 — 3rd-level referrals (smaller)

📏 *Rules:*
• Share your unique link to invite
• Earn when referrals verify & become eligible
• Each person can only be referred once
• Self-referrals are blocked
• Rewards capped per tier per user
• Suspicious patterns may be flagged

💡 _Genuine invites = more rewards!_
`.trim();
