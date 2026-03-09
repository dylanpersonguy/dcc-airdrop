import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth && auth.error) return auth.error;

  const now = new Date();
  const day1Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // ── Core counts ──
  const [
    totalUsers,
    newUsersToday,
    newUsersWeek,
    newUsersMonth,
    totalWallets,
    verifiedWallets,
    eligibleCount,
    claimedCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: day1Ago } } }),
    prisma.user.count({ where: { createdAt: { gte: day7Ago } } }),
    prisma.user.count({ where: { createdAt: { gte: day30Ago } } }),
    prisma.wallet.count(),
    prisma.wallet.count({ where: { isVerified: true } }),
    prisma.eligibilitySnapshot.count({ where: { eligible: true } }),
    prisma.eligibilitySnapshot.count({ where: { claimed: true } }),
  ]);

  // ── Financial aggregates ──
  const [
    lockAggs,
    activeLockCount,
    completedLockCount,
    purchaseAggs,
    completedPurchaseCount,
    depositAggs,
    inviteRewardAggs,
    lockRewardAggs,
    referralRewardAggs,
  ] = await Promise.all([
    prisma.dccLock.aggregate({ _sum: { amount: true, earnedDcc: true }, _count: true }),
    prisma.dccLock.count({ where: { status: 'ACTIVE' } }),
    prisma.dccLock.count({ where: { status: 'COMPLETED' } }),
    prisma.dccPurchase.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { dccAmount: true, amountPaid: true },
      _count: true,
    }),
    prisma.dccPurchase.count({ where: { status: 'COMPLETED' } }),
    prisma.dccDeposit.aggregate({ _sum: { amount: true }, _count: true }),
    prisma.inviteReward.aggregate({ _sum: { amount: true }, _count: true }),
    prisma.lockReferralReward.aggregate({ _sum: { amount: true }, _count: true }),
    prisma.referralReward.aggregate({ _sum: { amount: true }, _count: true }),
  ]);

  // ── Referral stats ──
  const [totalReferrals, tier1Refs, tier2Refs, tier3Refs] = await Promise.all([
    prisma.referralEvent.count(),
    prisma.referralEvent.count({ where: { tier: 1 } }),
    prisma.referralEvent.count({ where: { tier: 2 } }),
    prisma.referralEvent.count({ where: { tier: 3 } }),
  ]);

  // ── Growth: daily sign-ups for last 30 days ──
  const dailySignups = await prisma.$queryRaw<
    Array<{ date: string; count: bigint }>
  >`
    SELECT DATE("createdAt") as date, COUNT(*)::bigint as count
    FROM "User"
    WHERE "createdAt" >= ${day30Ago}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `;

  // ── Purchase volume by day (last 30 days) ──
  const dailyPurchases = await prisma.$queryRaw<
    Array<{ date: string; total_dcc: number; count: bigint }>
  >`
    SELECT DATE("createdAt") as date,
           COALESCE(SUM("dccAmount"), 0) as total_dcc,
           COUNT(*)::bigint as count
    FROM "DccPurchase"
    WHERE status = 'COMPLETED' AND "createdAt" >= ${day30Ago}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `;

  // ── Lock volume by day (last 30 days) ──
  const dailyLocks = await prisma.$queryRaw<
    Array<{ date: string; total_amount: number; count: bigint }>
  >`
    SELECT DATE("createdAt") as date,
           COALESCE(SUM(amount), 0) as total_amount,
           COUNT(*)::bigint as count
    FROM "DccLock"
    WHERE "createdAt" >= ${day30Ago}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `;

  // ── Top referrers ──
  const topReferrers = await prisma.$queryRaw<
    Array<{ userId: string; username: string | null; firstName: string | null; count: bigint }>
  >`
    SELECT re."referrerUserId" as "userId",
           u.username,
           u."firstName",
           COUNT(*)::bigint as count
    FROM "ReferralEvent" re
    JOIN "User" u ON u.id = re."referrerUserId"
    WHERE re.tier = 1
    GROUP BY re."referrerUserId", u.username, u."firstName"
    ORDER BY count DESC
    LIMIT 10
  `;

  // ── Top lockers ──
  const topLockers = await prisma.$queryRaw<
    Array<{ userId: string; username: string | null; firstName: string | null; total_locked: number }>
  >`
    SELECT dl."userId",
           u.username,
           u."firstName",
           COALESCE(SUM(dl.amount), 0) as total_locked
    FROM "DccLock" dl
    JOIN "User" u ON u.id = dl."userId"
    GROUP BY dl."userId", u.username, u."firstName"
    ORDER BY total_locked DESC
    LIMIT 10
  `;

  // ── Recent audit logs ──
  const recentAuditLogs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { actor: { select: { username: true, firstName: true } } },
  });

  // ── Purchase status breakdown ──
  const purchasesByStatus = await prisma.$queryRaw<
    Array<{ status: string; count: bigint }>
  >`
    SELECT status, COUNT(*)::bigint as count
    FROM "DccPurchase"
    GROUP BY status
  `;

  // ── Lock status breakdown ──
  const locksByStatus = await prisma.$queryRaw<
    Array<{ status: string; count: bigint }>
  >`
    SELECT status, COUNT(*)::bigint as count
    FROM "DccLock"
    GROUP BY status
  `;

  // Serialise BigInt values
  const serialise = (obj: unknown): unknown =>
    JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));

  return NextResponse.json(
    serialise({
      overview: {
        totalUsers,
        newUsersToday,
        newUsersWeek,
        newUsersMonth,
        totalWallets,
        verifiedWallets,
        eligibleCount,
        claimedCount,
      },
      finance: {
        totalLockedDcc: lockAggs._sum.amount ?? 0,
        totalLockEarnings: lockAggs._sum.earnedDcc ?? 0,
        totalLocks: lockAggs._count,
        activeLockCount,
        completedLockCount,
        totalPurchaseDcc: purchaseAggs._sum.dccAmount ?? 0,
        totalPurchaseCount: completedPurchaseCount,
        totalDepositDcc: depositAggs._sum.amount ?? 0,
        totalDepositCount: depositAggs._count,
        totalInviteRewards: inviteRewardAggs._sum.amount ?? 0,
        totalInviteRewardCount: inviteRewardAggs._count,
        totalLockCommissions: lockRewardAggs._sum.amount ?? 0,
        totalLockCommissionCount: lockRewardAggs._count,
        totalReferralRewards: referralRewardAggs._sum.amount ?? 0,
        totalReferralRewardCount: referralRewardAggs._count,
      },
      referrals: {
        total: totalReferrals,
        tier1: tier1Refs,
        tier2: tier2Refs,
        tier3: tier3Refs,
      },
      charts: {
        dailySignups: dailySignups.map((r) => ({
          date: String(r.date).slice(0, 10),
          count: Number(r.count),
        })),
        dailyPurchases: dailyPurchases.map((r) => ({
          date: String(r.date).slice(0, 10),
          totalDcc: Number(r.total_dcc),
          count: Number(r.count),
        })),
        dailyLocks: dailyLocks.map((r) => ({
          date: String(r.date).slice(0, 10),
          totalAmount: Number(r.total_amount),
          count: Number(r.count),
        })),
        purchasesByStatus: purchasesByStatus.map((r) => ({
          status: r.status,
          count: Number(r.count),
        })),
        locksByStatus: locksByStatus.map((r) => ({
          status: r.status,
          count: Number(r.count),
        })),
      },
      leaderboards: {
        topReferrers: topReferrers.map((r) => ({
          userId: r.userId,
          username: r.username,
          firstName: r.firstName,
          count: Number(r.count),
        })),
        topLockers: topLockers.map((r) => ({
          userId: r.userId,
          username: r.username,
          firstName: r.firstName,
          totalLocked: Number(r.total_locked),
        })),
      },
      recentAuditLogs: recentAuditLogs.map((l) => ({
        id: l.id,
        actorType: l.actorType,
        actorName: l.actor?.username || l.actor?.firstName || l.actorId,
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        createdAt: l.createdAt,
      })),
    })
  );
}
