import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth && auth.error) return auth.error;

  const url = req.nextUrl.searchParams;
  const page = Math.max(1, Number(url.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.get('limit')) || 25));
  const search = url.get('search')?.trim() || '';
  const sort = url.get('sort') || 'createdAt';
  const order: Prisma.SortOrder = url.get('order') === 'asc' ? 'asc' : 'desc';
  const filter = url.get('filter') || 'all';

  const where: Prisma.UserWhereInput = {};

  if (search) {
    const searchBigInt = /^\d+$/.test(search) ? BigInt(search) : null;
    where.OR = [
      { username: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { referralCode: { contains: search, mode: 'insensitive' } },
      ...(searchBigInt ? [{ telegramId: searchBigInt }] : []),
    ];
  }

  if (filter === 'admin') where.isAdmin = true;
  if (filter === 'hasWallet') where.wallets = { some: { isVerified: true } };
  if (filter === 'hasLocks') where.dccLocks = { some: { status: 'ACTIVE' } };
  if (filter === 'eligible') {
    where.eligibilitySnapshots = { some: { eligible: true } };
  }

  const allowedSorts: Record<string, Prisma.UserOrderByWithRelationInput> = {
    createdAt: { createdAt: order },
    username: { username: order },
    firstName: { firstName: order },
  };
  const orderBy = allowedSorts[sort] ?? allowedSorts.createdAt;

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        wallets: { where: { isVerified: true }, take: 1, select: { address: true } },
        _count: {
          select: {
            referralsMade: true,
            dccLocks: true,
            dccPurchases: true,
            inviteRewards: true,
          },
        },
      },
    }),
  ]);

  const serialise = (obj: unknown): unknown =>
    JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));

  return NextResponse.json(
    serialise({
      users: users.map((u) => ({
        id: u.id,
        telegramId: u.telegramId.toString(),
        username: u.username,
        firstName: u.firstName,
        isAdmin: u.isAdmin,
        referralCode: u.referralCode,
        walletAddress: u.wallets[0]?.address || null,
        referralCount: u._count.referralsMade,
        lockCount: u._count.dccLocks,
        purchaseCount: u._count.dccPurchases,
        inviteCount: u._count.inviteRewards,
        createdAt: u.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  );
}
