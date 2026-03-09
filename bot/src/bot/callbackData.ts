// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Callback Data Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const CB = {
  MAIN_MENU: 'main_menu',
  NOOP: 'noop',

  // Wallet
  MY_WALLET: 'my_wallet',
  WALLET_ADDRESS: 'wallet_address',
  EXPORT_SEED: 'export_seed',
  EXPORT_SEED_CONFIRM: 'export_seed_confirm',

  // Eligibility
  MY_ELIGIBILITY: 'my_eligibility',
  MY_AIRDROP: 'my_airdrop',

  // Referrals
  REFERRALS_MENU: 'referrals_menu',
  REFERRAL_LINK: 'referral_link',
  REFERRAL_STATS: 'referral_stats',
  REFERRAL_REWARDS: 'referral_rewards',
  REFERRAL_RULES: 'referral_rules',
  REFERRAL_TREE: 'referral_tree',
  REFERRAL_LEADERBOARD: 'referral_leaderboard',

  // Claim
  CLAIM_STATUS: 'claim_status',

  // Buy
  BUY: 'buy',
  BUY_CONFIRM: 'buy_confirm',
  BUY_CANCEL: 'buy_cancel',
  BUY_HISTORY: 'buy_history',

  // Lock
  LOCK: 'lock',
  LOCK_NEW: 'lock_new',
  LOCK_LIST: 'lock_list',
  LOCK_CONFIRM: 'lock_confirm',
  LOCK_CANCEL: 'lock_cancel',
  LOCK_INFO: 'lock_info',

  // Deposit
  DEPOSIT: 'deposit',
  DEPOSIT_CONFIRM: 'deposit_confirm',
  DEPOSIT_HISTORY: 'deposit_history',

  // Redeem
  REDEEM: 'redeem',

  // History
  HISTORY: 'history',

  // Help
  HELP_MENU: 'help_menu',
  HELP_HOW: 'help_how',
  HELP_ELIGIBILITY: 'help_eligibility',
  HELP_VERIFICATION: 'help_verification',
  HELP_CLAIM: 'help_claim',
  HELP_SUPPORT: 'help_support',
  HELP_REFERRAL: 'help_referral',
  HELP_LOCK: 'help_lock',
} as const;

// Dynamic callback data helpers
export const buyTokenCb = (token: string) => `buy_token_${token}`;
export const buyStatusCb = (transferId: string) => `buy_status_${transferId}`;
export const lockAmountCb = (amount: string | number) => `lock_amount_${amount}`;
export const historyPageCb = (page: number) => `history_page_${page}`;
