// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Inline Keyboard Layouts — Modern Grid Menu
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { InlineKeyboard } from 'grammy';

// ── Main menu — sectioned grid ────────────
export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('💰 My Wallet', 'my_wallet').row()
    .text('─── 📊 Account ───', 'noop').row()
    .text('✅ Eligibility', 'my_eligibility')
    .text('🎁 My Airdrop', 'my_airdrop').row()
    .text('👥 Referrals', 'referrals_menu')
    .text('📈 Rates & Info', 'help_lock').row()
    .text('─── 💎 Actions ───', 'noop').row()
    .text('💳 Buy DCC', 'buy')
    .text('📥 Deposit', 'deposit').row()
    .text('🔒 Lock & Earn', 'lock')
    .text('💸 Redeem', 'redeem').row()
    .text('─────────────────', 'noop').row()
    .text('📋 Claim Status', 'claim_status')
    .text('❓ Help & FAQ', 'help_menu');
}

// ── Wallet submenu ────────────────────────
export function walletMenuKeyboard(hasOnChain: boolean = false, hasOffChain: boolean = false): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (hasOnChain) {
    kb.text('📥 Deposit to Balance', 'deposit').row();
  }
  if (hasOffChain) {
    kb.text('🔒 Lock DCC', 'lock')
      .text('🎁 Redeem DCC', 'redeem').row();
  }
  kb.text('📋 Copy Address', 'wallet_address')
    .text('🔑 Export Seed', 'export_seed').row()
    .text('📜 Activity', 'history')
    .text('◀️ Main Menu', 'main_menu');
  return kb;
}

export function exportSeedConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('⚠️ Yes, show my seed', 'export_seed_confirm')
    .text('❌ Cancel', 'my_wallet');
}

// ── Referrals submenu — modern multi-level ─
export function referralsMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔗 My Referral Link', 'referral_link')
    .text('📊 Stats Overview', 'referral_stats').row()
    .text('🌳 My Network', 'referral_tree')
    .text('🏆 Leaderboard', 'referral_leaderboard').row()
    .text('💎 Tier Rewards', 'referral_rewards')
    .text('📖 Program Rules', 'referral_rules').row()
    .text('◀️ Main Menu', 'main_menu');
}

// ── Help submenu ──────────────────────────
export function helpMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📘 How It Works', 'help_how')
    .text('📋 Eligibility Rules', 'help_eligibility').row()
    .text('🔐 Verification', 'help_verification')
    .text('💰 Claim FAQ', 'help_claim').row()
    .text('👥 Referral Guide', 'help_referral')
    .text('� Lock & Earn', 'help_lock').row()
    .text('�📞 Support', 'help_support').row()
    .text('◀️ Main Menu', 'main_menu');
}

// ── Deposit submenu ───────────────────────
export function depositMenuKeyboard(canDeposit: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (canDeposit) {
    kb.text('📥 Deposit Now', 'deposit_confirm').row();
  }
  kb.text('📜 Deposit History', 'deposit_history');
  kb.text('◀️ Main Menu', 'main_menu');
  return kb;
}

// ── Navigation utilities ──────────────────
export function backToMainKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('◀️ Main Menu', 'main_menu');
}

export function backToReferralsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('◀️ Referrals', 'referrals_menu')
    .text('🏠 Menu', 'main_menu');
}

export function backToHelpKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('◀️ Help', 'help_menu')
    .text('🏠 Menu', 'main_menu');
}

// ── Confirm/Cancel pattern ────────────────
export function confirmCancelKeyboard(confirmCb: string, cancelCb: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm', confirmCb)
    .text('❌ Cancel', cancelCb);
}

// ── Pagination helper ─────────────────────
export function paginationKeyboard(
  prefix: string,
  page: number,
  hasMore: boolean,
  backCb: string,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (page > 1) kb.text('◀️ Prev', `${prefix}_page_${page - 1}`);
  if (hasMore) kb.text('Next ▶️', `${prefix}_page_${page + 1}`);
  kb.row().text('◀️ Back', backCb);
  return kb;
}

// ── Buy DCC keyboards ────────────────────

export function buyTokenKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔶 SOL', 'buy_token_SOL')
    .text('🔵 USDC', 'buy_token_USDC')
    .text('🟢 USDT', 'buy_token_USDT').row()
    .text('📋 Purchase History', 'buy_history').row()
    .text('◀️ Main Menu', 'main_menu');
}

export function buyConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm Purchase', 'buy_confirm')
    .text('❌ Cancel', 'buy_cancel');
}

export function buyCheckStatusKeyboard(transferId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 Check Status', `buy_status_${transferId}`).row()
    .text('◀️ Main Menu', 'main_menu');
}

// ── Lock DCC keyboards ───────────────────

export function lockMenuKeyboard(canLock: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (canLock) {
    kb.text('🔒 New Lock', 'lock_new');
  } else {
    kb.text('📥 Deposit DCC', 'deposit');
    kb.text('💳 Buy DCC', 'buy').row();
  }
  kb.text('📋 Active Locks', 'lock_list').row();
  kb.text('📊 Rates & Info', 'lock_info').row();
  kb.text('◀️ Main Menu', 'main_menu');
  return kb;
}

export function lockConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm Lock', 'lock_confirm')
    .text('❌ Cancel', 'lock_cancel');
}

export function lockAmountPickerKeyboard(unlocked: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  const presets = [100, 250, 500, 1000, 2500, 5000];
  const available = presets.filter((a) => a <= unlocked && a <= 15000);
  for (let i = 0; i < available.length; i++) {
    kb.text(`${available[i]} DCC`, `lock_amount_${available[i]}`);
    if (i % 3 === 2) kb.row();
  }
  if (available.length % 3 !== 0) kb.row();
  kb.text('🔒 Max', 'lock_amount_max').row();
  kb.text('◀️ Lock Menu', 'lock').text('🏠 Menu', 'main_menu');
  return kb;
}

export function backToLockKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('◀️ Lock Menu', 'lock')
    .text('🏠 Menu', 'main_menu');
}

// ── Contextual next-step keyboards ───────

export function afterBuyKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔒 Lock & Earn', 'lock')
    .text('💸 Redeem', 'redeem').row()
    .text('💳 Buy More', 'buy')
    .text('🏠 Menu', 'main_menu');
}

export function afterDepositKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔒 Lock & Earn', 'lock')
    .text('💸 Redeem', 'redeem').row()
    .text('🏠 Menu', 'main_menu');
}

export function afterLockKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔒 Lock More', 'lock_new')
    .text('📋 Active Locks', 'lock_list').row()
    .text('👥 Referrals', 'referrals_menu')
    .text('🏠 Menu', 'main_menu');
}

export function afterRedeemKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('💰 My Wallet', 'my_wallet')
    .text('💳 Buy More', 'buy').row()
    .text('🏠 Menu', 'main_menu');
}
