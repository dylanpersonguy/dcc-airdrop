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
  const tab = url.get('tab') || 'locks'; // locks | purchases | deposits

  const serialise = (obj: unknown): unknown =>
    JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));

  if (tab === 'purchases') {
    const status = url.get('status') || '';
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const [total, purchases] = await Promise.all([
      prisma.dccPurchase.count({ where }),
      prisma.dccPurchase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { username: true, firstName: true, telegramId: true } } },
      }),
    ]);

    return NextResponse.json(serialise({
      items: purchases.map((p) => ({
        id: p.id,
        userId: p.userId,
        username: p.user.username,
        firstName: p.user.firstName,
        telegramId: p.user.telegramId.toString(),
        token: p.token,
        amountPaid: p.amountPaid,
        dccAmount: p.dccAmount,
        status: p.status,
        redeemed: p.redeemed,
        createdAt: p.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }));
  }

  if (tab === 'deposits') {
    const [total, deposits] = await Promise.all([
      prisma.dccDeposit.count(),
      prisma.dccDeposit.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { username: true, firstName: true, telegramId: true } } },
      }),
    ]);

    return NextResponse.json(serialise({
      items: deposits.map((d) => ({
        id: d.id,
        userId: d.userId,
        username: d.user.username,
        firstName: d.user.firstName,
        telegramId: d.user.telegramId.toString(),
        txId: d.txId,
        amount: d.amount,
        senderAddress: d.senderAddress,
        status: d.status,
        createdAt: d.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }));
  }

  // Default: locks
  const status = url.get('status') || '';
  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const [total, locks] = await Promise.all([
    prisma.dccLock.count({ where }),
    prisma.dccLock.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { username: true, firstName: true, telegramId: true } } },
    }),
  ]);

  return NextResponse.json(serialise({
    items: locks.map((l) => ({
      id: l.id,
      userId: l.userId,
      username: l.user.username,
      firstName: l.user.firstName,
      telegramId: l.user.telegramId.toString(),
      amount: l.amount,
      dailyRate: l.dailyRate,
      earnedDcc: l.earnedDcc,
      status: l.status,
      startedAt: l.startedAt,
      expiresAt: l.expiresAt,
      earningsRedeemed: l.earningsRedeemed,
      createdAt: l.createdAt,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }));
}
