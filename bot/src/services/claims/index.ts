// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Claims Service — Claim status and lifecycle
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// This service abstracts claim state. When the AirdropClaim contract goes
// live, the actual claim invocation will be initiated by the user signing
// a transaction from their wallet (outside the bot). The bot's role is to:
//   - Show whether claiming is live
//   - Show whether the user is eligible to claim
//   - Display claim instructions
//   - Record claim txs once confirmed
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import prisma from '../../db/prisma';
import { config } from '../../config';
import { getClaimStatus as getOnChainClaimStatus } from '../blockchain';
import { audit } from '../../utils/audit';
import type { OnChainClaimState } from '../../types';

export interface ClaimStatusResult {
  claimLive: boolean;
  eligible: boolean;
  alreadyClaimed: boolean;
  claimTxId: string | null;
  message: string;
}

/**
 * Get combined claim status from on-chain + off-chain sources.
 */
export async function getClaimStatusForUser(
  userId: string,
  walletAddress: string,
  isEligible: boolean,
): Promise<ClaimStatusResult> {
  // Check on-chain claim state
  let onChain: OnChainClaimState;
  try {
    onChain = await getOnChainClaimStatus(walletAddress);
  } catch {
    // Fallback to config-based claim-live flag and DB records
    onChain = {
      claimLive: config.CLAIM_LIVE,
      userClaimed: false,
      claimTxId: null,
    };
  }

  // Also check local ClaimRecord for any recorded claims
  const localClaim = await prisma.claimRecord.findFirst({
    where: { userId, status: { in: ['CONFIRMED', 'SUBMITTED'] } },
    orderBy: { createdAt: 'desc' },
  });

  const alreadyClaimed = onChain.userClaimed || localClaim?.status === 'CONFIRMED';
  const claimTxId = onChain.claimTxId ?? localClaim?.txId ?? null;

  let message: string;
  if (alreadyClaimed) {
    message = `✅ You have already claimed your airdrop.${claimTxId ? `\nTx: ${claimTxId}` : ''}`;
  } else if (!onChain.claimLive) {
    message = '⏳ Claiming is not live yet. We will announce when it opens!';
  } else if (!isEligible) {
    message = '❌ You are not currently eligible to claim. Check your eligibility status for details.';
  } else {
    message = '🟢 Claiming is LIVE! You are eligible to claim your airdrop.\n\n'
      + 'To claim, invoke the AirdropClaim contract from your verified wallet.\n'
      + 'Instructions will be provided in our official channels.';
  }

  return {
    claimLive: onChain.claimLive,
    eligible: isEligible,
    alreadyClaimed,
    claimTxId,
    message,
  };
}

/**
 * Record a successful claim (called after on-chain confirmation).
 */
export async function recordClaim(
  userId: string,
  walletId: string,
  txId: string,
  amount: number,
  campaignId?: string,
): Promise<void> {
  await prisma.claimRecord.create({
    data: {
      userId,
      walletId,
      campaignId: campaignId ?? null,
      status: 'CONFIRMED',
      txId,
      amount,
    },
  });

  await audit({
    actorType: 'system',
    action: 'claim_recorded',
    targetType: 'user',
    targetId: userId,
    metadata: { txId, amount, walletId },
  });
}

/**
 * Check if claim is live (quick check for display purposes).
 */
export async function isClaimLive(): Promise<boolean> {
  // Check DB config override first, then env default
  const dbConfig = await prisma.campaignConfig.findUnique({
    where: { key: 'claimLive' },
  });
  if (dbConfig) {
    return JSON.parse(dbConfig.valueJson) === true;
  }
  return config.CLAIM_LIVE;
}

/**
 * Admin: toggle claim live status.
 */
export async function setClaimLive(live: boolean, adminUserId: string): Promise<void> {
  await prisma.campaignConfig.upsert({
    where: { key: 'claimLive' },
    update: { valueJson: JSON.stringify(live) },
    create: { key: 'claimLive', valueJson: JSON.stringify(live) },
  });

  await audit({
    actorType: 'admin',
    actorId: adminUserId,
    action: live ? 'claim_enabled' : 'claim_disabled',
  });
}
