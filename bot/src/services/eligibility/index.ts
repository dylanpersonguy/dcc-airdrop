// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Eligibility Service — Converts raw on-chain data
// into a structured eligibility checklist.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { config } from '../../config';
import type { TrackerState, WalletBalances, EligibilityResult, EligibilityRequirement } from '../../types';

interface EligibilityInput {
  tracker: TrackerState;
  balances: WalletBalances;
  currentHeight: number;
}

/**
 * Evaluate all eligibility requirements against on-chain data.
 * This is the single source of truth for the requirement checklist.
 *
 * Rules (matching the EligibilityTracker / AirdropClaim design):
 *  1. walletAgeOk  — set by off-chain updater (wallet ≥ 21 days)
 *  2. txCountOk    — set by off-chain updater (≥ 5 txs)
 *  3. stDCC ≥ 100  — checked live from wallet balance
 *  4. poolCount ≥ 2
 *  5. hasCurrentLp  — currently providing LP
 *  6. LP age ≥ 7 days (MIN_LP_AGE_BLOCKS)
 *  7. swapCount ≥ 2
 *  8. dappCount ≥ 2
 *  9. sybilFlag == false
 * 10. claimed == false
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const { tracker: t, balances: b, currentHeight } = input;

  const lpAgeBlocks = t.firstLpHeight > 0 ? currentHeight - t.firstLpHeight : 0;
  const minBalance = BigInt(config.MIN_STDCC_BALANCE);
  const hasEnoughStDCC = b.stDCCBalance >= minBalance;
  const lpAgeOk = lpAgeBlocks >= config.MIN_LP_AGE_BLOCKS;

  const requirements: EligibilityRequirement[] = [
    {
      key: 'walletAge',
      label: 'Wallet age ≥ 21 days',
      completed: t.walletAgeOk,
      progress: t.walletAgeOk ? 'Confirmed' : 'Pending verification',
    },
    {
      key: 'txCount',
      label: '5+ successful transactions',
      completed: t.txCountOk,
      progress: t.txCountOk ? 'Confirmed' : 'Pending verification',
    },
    {
      key: 'stDCCBalance',
      label: '100+ stDCC held',
      completed: hasEnoughStDCC,
      progress: `${formatBalance(b.stDCCBalance)} stDCC`,
    },
    {
      key: 'poolCount',
      label: '2+ pools joined',
      completed: t.poolCount >= 2,
      progress: `${t.poolCount} / 2`,
    },
    {
      key: 'hasCurrentLp',
      label: 'Currently providing LP',
      completed: t.hasCurrentLp,
      progress: t.hasCurrentLp ? 'Active' : 'No active LP',
    },
    {
      key: 'lpAge',
      label: 'LP held 7+ days',
      completed: lpAgeOk,
      progress: t.firstLpHeight > 0
        ? `~${Math.floor(lpAgeBlocks / (60 * 24))}d (${lpAgeBlocks} blocks)`
        : 'No LP history',
    },
    {
      key: 'swapCount',
      label: '2+ swaps completed',
      completed: t.swapCount >= 2,
      progress: `${t.swapCount} / 2`,
    },
    {
      key: 'dappCount',
      label: '2+ dApps used',
      completed: t.dappCount >= 2,
      progress: `${t.dappCount} / 2`,
    },
    {
      key: 'sybilCheck',
      label: 'Not sybil-flagged',
      completed: !t.sybilFlag,
      progress: t.sybilFlag ? '⚠️ Flagged' : 'Clear',
    },
    {
      key: 'notClaimed',
      label: 'Not already claimed',
      completed: !t.claimed,
      progress: t.claimed ? 'Already claimed' : 'Available',
    },
  ];

  const completedRequirements = requirements.filter((r) => r.completed);
  const missingRequirements = requirements.filter((r) => !r.completed);
  const eligible = missingRequirements.length === 0;

  return {
    eligible,
    requirements,
    completedRequirements,
    missingRequirements,
    completedCount: completedRequirements.length,
    totalCount: requirements.length,
  };
}

/** Format a raw balance (8-decimal asset) for display */
function formatBalance(raw: bigint, decimals = 8): string {
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}

/**
 * Compute a numeric score based on on-chain activity.
 * Used in score_based allocation mode.
 */
export function computeActivityScore(tracker: TrackerState, balances: WalletBalances): number {
  let score = 0;
  score += Math.min(tracker.poolCount, 10) * 10;        // max 100
  score += Math.min(tracker.swapCount, 50) * 2;         // max 100
  score += Math.min(tracker.dappCount, 10) * 10;        // max 100
  score += tracker.everStaked ? 50 : 0;
  score += tracker.hasCurrentStake ? 50 : 0;
  score += tracker.hasCurrentLp ? 50 : 0;

  // stDCC bonus: 1 point per 100 stDCC held, capped at 200
  const stDCC = Number(balances.stDCCBalance / BigInt(10 ** 8));
  score += Math.min(Math.floor(stDCC / 100), 200);

  return score;
}
