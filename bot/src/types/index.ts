// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core Types — DecentralChain Airdrop Bot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── On-chain tracker state ────────────────
export interface TrackerState {
  poolCount: number;
  swapCount: number;
  dappCount: number;
  everStaked: boolean;
  hasCurrentStake: boolean;
  firstStakeHeight: number;
  firstLpHeight: number;
  hasCurrentLp: boolean;
  walletAgeOk: boolean;
  txCountOk: boolean;
  sybilFlag: boolean;
  claimed: boolean;
  lastSwapHeight: number;
  lastLpHeight: number;
  lastActivityHeight: number;
}

// ── Wallet balances ───────────────────────
export interface WalletBalances {
  dccBalance: bigint;
  stDCCBalance: bigint;
}

// ── Claim on-chain state ──────────────────
export interface OnChainClaimState {
  claimLive: boolean;
  userClaimed: boolean;
  claimTxId: string | null;
}

// ── Eligibility requirement ───────────────
export interface EligibilityRequirement {
  key: string;
  label: string;
  completed: boolean;
  progress?: string;
}

// ── Eligibility result ────────────────────
export interface EligibilityResult {
  eligible: boolean;
  requirements: EligibilityRequirement[];
  completedRequirements: EligibilityRequirement[];
  missingRequirements: EligibilityRequirement[];
  completedCount: number;
  totalCount: number;
}

// ── Allocation result ─────────────────────
export interface AllocationResult {
  baseAmount: number;
  referralBonusAmount: number;
  totalEstimatedAmount: number;
  score: number | null;
  multiplier: number | null;
  mode: AllocationMode;
  explanation: string[];
  provisional: boolean;
}

export type AllocationMode = 'fixed' | 'score_based' | 'base_plus_referral';

// ── Referral stats ────────────────────────

export interface TierStats {
  tier: number;
  referred: number;
  verified: number;
  eligible: number;
  rewardAmount: number;
}

export interface ReferralTreeNode {
  telegramId: string;
  username: string | null;
  tier: number;
  status: string;
  joinedAt: Date;
  children: ReferralTreeNode[];
}

export interface ReferralStats {
  referralCode: string;
  referralLink: string;
  // Aggregates across all tiers
  totalReferred: number;
  verifiedReferred: number;
  eligibleReferred: number;
  totalRewardAmount: number;
  // Per-tier breakdown
  tiers: TierStats[];
  // Multi-level info
  maxDepth: number;
  networkSize: number;        // total nodes in the downline tree
  activeNetworkSize: number;  // verified or eligible nodes
}

// ── grammY context extensions ─────────────
export interface SessionData {
  step?: string;
  pendingWallet?: string;
}
