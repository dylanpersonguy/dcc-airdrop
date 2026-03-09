// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Purchase Service — Off-chain DCC purchase balance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import prisma from '../../db/prisma';
import { audit } from '../../utils/audit';
import { getFullBalance, invalidateBalanceCache } from '../balance';
import type { FullBalance } from '../balance';

/**
 * Get the purchase balance for a user:
 * total DCC from completed purchases, total redeemed, and available to redeem.
 */
export async function getPurchaseBalance(userId: string): Promise<{
  total: number;
  redeemed: number;
  available: number;
}> {
  const purchases = await prisma.dccPurchase.findMany({
    where: { userId, status: 'COMPLETED' },
  });
  const total = purchases.reduce((s, p) => s + p.dccAmount, 0);
  const redeemed = purchases.filter((p) => p.redeemed).reduce((s, p) => s + p.dccAmount, 0);
  return { total, redeemed, available: total - redeemed };
}

/**
 * Mark all unredeemed completed purchases as redeemed and return the DCC amount.
 * Returns 0 if nothing to redeem.
 */
export async function markPurchasesRedeemed(
  userId: string,
  txId: string,
): Promise<number> {
  const unredeemed = await prisma.dccPurchase.findMany({
    where: { userId, status: 'COMPLETED', redeemed: false },
  });
  if (unredeemed.length === 0) return 0;

  const amount = unredeemed.reduce((s, p) => s + p.dccAmount, 0);
  const now = new Date();

  await prisma.$transaction(
    unredeemed.map((p) =>
      prisma.dccPurchase.update({
        where: { id: p.id },
        data: { redeemed: true, redeemedAt: now, redeemTxId: txId },
      }),
    ),
  );

  await audit({
    actorType: 'user',
    actorId: userId,
    action: 'purchases_redeemed',
    targetType: 'user',
    targetId: userId,
    metadata: { amount, txId, count: unredeemed.length },
  });

  await invalidateBalanceCache(userId);
  return amount;
}

/**
 * Get total off-chain DCC balance for a user.
 * Delegates to the consolidated balance service with Redis caching.
 */
export async function getTotalOffChainBalance(userId: string): Promise<FullBalance> {
  return getFullBalance(userId);
}
