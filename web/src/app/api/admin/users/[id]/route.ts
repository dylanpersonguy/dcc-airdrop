import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth && auth.error) return auth.error;

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      wallets: true,
      eligibilitySnapshots: { orderBy: { createdAt: 'desc' }, take: 5 },
      referralsMade: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          referredUser: { select: { username: true, firstName: true, telegramId: true } },
        },
      },
      dccPurchases: { orderBy: { createdAt: 'desc' }, take: 20 },
      dccLocks: { orderBy: { createdAt: 'desc' }, take: 20 },
      dccDeposits: { orderBy: { createdAt: 'desc' }, take: 20 },
      inviteRewards: { orderBy: { createdAt: 'desc' }, take: 20 },
      lockReferralRewards: { orderBy: { createdAt: 'desc' }, take: 20 },
      referralRewards: { orderBy: { createdAt: 'desc' }, take: 20 },
      claimRecords: { orderBy: { createdAt: 'desc' }, take: 10 },
      auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const serialise = (obj: unknown): unknown =>
    JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));

  return NextResponse.json(serialise(user));
}
