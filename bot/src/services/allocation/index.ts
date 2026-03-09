// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Allocation Service — Compute estimated airdrop
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { config } from '../../config';
import type { AllocationResult, AllocationMode, TrackerState, WalletBalances, TierStats } from '../../types';
import { computeActivityScore } from '../eligibility';

interface AllocationInput {
  eligible: boolean;
  tracker: TrackerState;
  balances: WalletBalances;
  verifiedReferralCount: number;
  eligibleReferralCount: number;
  /** Multi-tier stats — if provided, used instead of flat counts */
  tierStats?: TierStats[];
}

/**
 * Calculate estimated airdrop allocation.
 *
 * MODE A — FIXED:          All eligible users get the base amount.
 * MODE B — SCORE-BASED:    Allocation scaled by activity score.
 * MODE C — BASE + REFERRAL: Base amount + multi-tier referral bonus.
 */
export function calculateAllocation(input: AllocationInput): AllocationResult {
  const mode = config.ALLOCATION_MODE as AllocationMode;

  if (!input.eligible) {
    return {
      baseAmount: 0,
      referralBonusAmount: 0,
      totalEstimatedAmount: 0,
      score: null,
      multiplier: null,
      mode,
      explanation: ['Not currently eligible — complete all requirements to qualify.'],
      provisional: true,
    };
  }

  switch (mode) {
    case 'fixed':
      return fixedAllocation(input);
    case 'score_based':
      return scoreBasedAllocation(input);
    case 'base_plus_referral':
    default:
      return basePlusReferralAllocation(input);
  }
}

function fixedAllocation(input: AllocationInput): AllocationResult {
  const base = config.BASE_AIRDROP_AMOUNT;
  return {
    baseAmount: base,
    referralBonusAmount: 0,
    totalEstimatedAmount: base,
    score: null,
    multiplier: null,
    mode: 'fixed',
    explanation: ['Fixed allocation for all eligible participants.'],
    provisional: true,
  };
}

function scoreBasedAllocation(input: AllocationInput): AllocationResult {
  const score = computeActivityScore(input.tracker, input.balances);
  const multiplier = Math.max(1, Math.min(3, score / 500));
  const base = Math.round(config.BASE_AIRDROP_AMOUNT * multiplier);
  const refBonus = computeMultiTierBonus(input);

  return {
    baseAmount: base,
    referralBonusAmount: refBonus.total,
    totalEstimatedAmount: base + refBonus.total,
    score,
    multiplier: Math.round(multiplier * 100) / 100,
    mode: 'score_based',
    explanation: [
      `Activity score: ${score}`,
      `Multiplier: ${multiplier.toFixed(2)}x`,
      `Base allocation: ${base} DCC`,
      ...refBonus.lines,
    ],
    provisional: true,
  };
}

function basePlusReferralAllocation(input: AllocationInput): AllocationResult {
  const base = config.BASE_AIRDROP_AMOUNT;
  const refBonus = computeMultiTierBonus(input);

  return {
    baseAmount: base,
    referralBonusAmount: refBonus.total,
    totalEstimatedAmount: base + refBonus.total,
    score: null,
    multiplier: null,
    mode: 'base_plus_referral',
    explanation: [
      `Base allocation: ${base} DCC`,
      ...refBonus.lines,
    ],
    provisional: true,
  };
}

function tierBonusAmount(tier: number): number {
  switch (tier) {
    case 1: return config.REFERRAL_TIER1_BONUS;
    case 2: return config.REFERRAL_TIER2_BONUS;
    case 3: return config.REFERRAL_TIER3_BONUS;
    default: return 0;
  }
}

function computeMultiTierBonus(input: AllocationInput): { total: number; lines: string[] } {
  if (input.tierStats && input.tierStats.length > 0) {
    // Use actual credited reward amounts from tier stats
    let total = 0;
    const lines: string[] = [];
    for (const ts of input.tierStats) {
      if (ts.rewardAmount > 0) {
        total += ts.rewardAmount;
        lines.push(`Tier ${ts.tier}: +${ts.rewardAmount} DCC (${ts.eligible} eligible)`);
      }
    }
    if (total === 0) {
      lines.push('Invite friends to earn multi-tier referral bonuses!');
    }
    return { total, lines };
  }

  // Fallback: estimate from eligible referral count (tier-1 only)
  const bonus = Math.min(
    input.eligibleReferralCount * config.REFERRAL_TIER1_BONUS,
    config.MAX_REFERRAL_REWARDS_PER_TIER * config.REFERRAL_TIER1_BONUS,
  );
  const lines = bonus > 0
    ? [`Referral bonus: +${bonus} DCC (${input.eligibleReferralCount} eligible referrals)`]
    : ['Invite friends to earn multi-tier referral bonuses!'];

  return { total: bonus, lines };
}
