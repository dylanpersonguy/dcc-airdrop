import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth && auth.error) return auth.error;

  const url = req.nextUrl.searchParams;
  const page = Math.max(1, Number(url.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.get('limit')) || 25));
  const tier = url.get('tier') || '';
  const status = url.get('status') || '';

  const where: Record<string, unknown> = {};
  if (tier) where.tier = Number(tier);
  if (status) where.status = status;

  const [total, events] = await Promise.all([
    prisma.referralEvent.count({ where }),
    prisma.referralEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        referrerUser: { select: { username: true, firstName: true, telegramId: true } },
        referredUser: { select: { username: true, firstName: true, telegramId: true } },
      },
    }),
  ]);

  // Aggregate stats
  const [tierCounts, statusCounts] = await Promise.all([
    prisma.$queryRaw<Array<{ tier: number; count: bigint }>>`
      SELECT tier, COUNT(*)::bigint as count FROM "ReferralEvent" GROUP BY tier ORDER BY tier
    `,
    prisma.$queryRaw<Array<{ status: string; count: bigint }>>`
      SELECT status, COUNT(*)::bigint as count FROM "ReferralEvent" GROUP BY status
    `,
  ]);

  const serialise = (obj: unknown): unknown =>
    JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));

  return NextResponse.json(serialise({
    events: events.map((e) => ({
      id: e.id,
      referrer: {
        userId: e.referrerUserId,
        username: e.referrerUser.username,
        firstName: e.referrerUser.firstName,
        telegramId: e.referrerUser.telegramId.toString(),
      },
      referred: {
        userId: e.referredUserId,
        username: e.referredUser.username,
        firstName: e.referredUser.firstName,
        telegramId: e.referredUser.telegramId.toString(),
      },
      tier: e.tier,
      status: e.status,
      code: e.code,
      createdAt: e.createdAt,
    })),
    stats: {
      tierCounts: tierCounts.map((t) => ({ tier: t.tier, count: Number(t.count) })),
      statusCounts: statusCounts.map((s) => ({ status: s.status, count: Number(s.count) })),
    },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }));
}
