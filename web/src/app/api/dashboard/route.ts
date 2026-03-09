import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(session.telegramId) },
    include: {
      wallets: { where: { isVerified: true }, take: 1 },
      eligibilitySnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
      dccLocks: { where: { status: 'ACTIVE' } },
      referralsMade: true,
      dccPurchases: true,
      dccDeposits: true,
      inviteRewards: true,
      lockReferralRewards: true,
    },
  });

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Compute off-chain balance
  const purchaseBalance = user.dccPurchases
    .filter((p: { status: string; redeemed: boolean }) => p.status === 'COMPLETED' && !p.redeemed)
    .reduce((sum: number, p: { dccAmount: number }) => sum + p.dccAmount, 0);

  const inviteBalance = user.inviteRewards
    .filter((r: { redeemed: boolean }) => !r.redeemed)
    .reduce((sum: number, r: { amount: number }) => sum + r.amount, 0);

  const lockEarnings = user.dccLocks.reduce((sum: number, l: { earnedDcc: number }) => sum + l.earnedDcc, 0);
  const lockEarningsUnredeemed = user.dccLocks
    .filter((l: { earningsRedeemed: boolean }) => !l.earningsRedeemed)
    .reduce((sum: number, l: { earnedDcc: number }) => sum + l.earnedDcc, 0);

  const depositBalance = user.dccDeposits.reduce((sum: number, d: { amount: number }) => sum + d.amount, 0);

  const commissions = user.lockReferralRewards
    .filter((r: { redeemed: boolean }) => !r.redeemed)
    .reduce((sum: number, r: { amount: number }) => sum + r.amount, 0);

  const totalLocked = user.dccLocks.reduce((sum: number, l: { amount: number }) => sum + l.amount, 0);
  const offChainAvailable = purchaseBalance + inviteBalance + lockEarningsUnredeemed + depositBalance + commissions;

  const eligibility = user.eligibilitySnapshots[0] || null;
  const wallet = user.wallets[0] || null;

  const referralCount = user.referralsMade.length;
  const referralsByTier = [
    user.referralsMade.filter((r: { tier: number }) => r.tier === 1).length,
    user.referralsMade.filter((r: { tier: number }) => r.tier === 2).length,
    user.referralsMade.filter((r: { tier: number }) => r.tier === 3).length,
  ];

  // Lock rate based on referral count
  let lockRate = 3.0;
  if (referralCount >= 5000) lockRate = 5.0;
  else if (referralCount >= 1000) lockRate = 4.5;
  else if (referralCount >= 500) lockRate = 4.0;
  else if (referralCount >= 100) lockRate = 3.5;

  return NextResponse.json({
    user: {
      id: user.id,
      telegramId: user.telegramId.toString(),
      username: user.username,
      firstName: user.firstName,
      isAdmin: user.isAdmin,
      referralCode: user.referralCode,
      createdAt: user.createdAt,
    },
    wallet: wallet
      ? {
          address: wallet.address,
          isVerified: wallet.isVerified,
        }
      : null,
    balance: {
      offChainAvailable,
      totalLocked,
      lockEarnings,
      lockEarningsUnredeemed,
      purchaseBalance,
      inviteBalance,
      depositBalance,
      commissions,
    },
    eligibility: eligibility
      ? {
          eligible: eligibility.eligible,
          stDCCBalance: eligibility.stDCCBalance.toString(),
          poolCount: eligibility.poolCount,
          swapCount: eligibility.swapCount,
          dappCount: eligibility.dappCount,
          hasCurrentLp: eligibility.hasCurrentLp,
          lpAgeBlocks: eligibility.lpAgeBlocks,
          walletAgeOk: eligibility.walletAgeOk,
          txCountOk: eligibility.txCountOk,
          sybilFlag: eligibility.sybilFlag,
          claimed: eligibility.claimed,
          rawScore: eligibility.rawScore,
          estimatedAllocation: eligibility.estimatedAllocation,
        }
      : null,
    locks: user.dccLocks.map((l: { id: string; amount: number; dailyRate: number; startedAt: Date; expiresAt: Date; status: string; earnedDcc: number }) => ({
      id: l.id,
      amount: l.amount,
      dailyRate: l.dailyRate,
      startedAt: l.startedAt,
      expiresAt: l.expiresAt,
      status: l.status,
      earnedDcc: l.earnedDcc,
    })),
    referrals: {
      total: referralCount,
      byTier: referralsByTier,
      lockRate,
    },
  });
}
