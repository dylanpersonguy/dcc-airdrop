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
  totalDccBought?: number;
  totalDccLocked?: number;
  directReferralCount?: number;
}

/**
 * Evaluate all eligibility requirements against on-chain data.
 * This is the single source of truth for the requirement checklist.
 *
 * Rules (matching the EligibilityTracker / AirdropClaim design):
 *  1. walletAgeOk  — set by off-chain updater (wallet ≥ 7 days)
 *  2. buyOk        — bought at least 100 DCC (off-chain DB)
 *  3. lockOk       — locked at least 100 DCC (off-chain DB)
 *  4. stDCC ≥ 100  — checked live from wallet balance
 *  5. poolCount ≥ 2
 *  6. hasCurrentLp  — currently providing LP
 *  7. LP age ≥ 7 days (MIN_LP_AGE_BLOCKS)
 *  8. txCountOk    — set by off-chain updater (≥ 5 txs)
 *  9. inviteOk     — invited at least 1 user (off-chain DB)
 * 10. swapCount ≥ 2
 * 11. dappCount ≥ 2
 * 12. sybilFlag == false
 * 13. claimed == false
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const { tracker: t, balances: b, currentHeight, totalDccBought = 0, totalDccLocked = 0, directReferralCount = 0 } = input;

  const lpAgeBlocks = t.firstLpHeight > 0 ? currentHeight - t.firstLpHeight : 0;
  const minBalance = BigInt(config.MIN_STDCC_BALANCE);
  const hasEnoughStDCC = b.stDCCBalance >= minBalance;
  const lpAgeOk = lpAgeBlocks >= config.MIN_LP_AGE_BLOCKS;
  const buyOk = totalDccBought >= 100;
  const lockOk = totalDccLocked >= 100;
  const inviteOk = directReferralCount >= 1;

  const requirements: EligibilityRequirement[] = [
    {
      key: 'walletAge',
      label: 'Wallet age ≥ 7 days',
      completed: t.walletAgeOk,
      progress: t.walletAgeOk ? 'Confirmed' : 'Pending verification',
    },
    {
      key: 'buyDcc',
      label: 'Buy at least 100 DCC',
      completed: buyOk,
      progress: buyOk ? `${totalDccBought.toFixed(0)} DCC bought` : `${totalDccBought.toFixed(0)} / 100 DCC`,
    },
    {
      key: 'lockDcc',
      label: 'Lock at least 100 DCC',
      completed: lockOk,
      progress: lockOk ? `${totalDccLocked.toFixed(0)} DCC locked` : `${totalDccLocked.toFixed(0)} / 100 DCC`,
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
      key: 'txCount',
      label: '5+ successful transactions',
      completed: t.txCountOk,
      progress: t.txCountOk ? 'Confirmed' : 'Pending verification',
    },
    {
      key: 'inviteUser',
      label: 'Invite 1 user to join using your referral link',
      completed: inviteOk,
      progress: inviteOk ? `${directReferralCount} invited` : `${directReferralCount} / 1`,
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
