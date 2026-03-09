import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth && auth.error) return auth.error;

  const url = req.nextUrl.searchParams;
  const page = Math.max(1, Number(url.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.get('limit')) || 50));
  const action = url.get('action') || '';
  const actorType = url.get('actorType') || '';

  const where: Record<string, unknown> = {};
  if (action) where.action = { contains: action, mode: 'insensitive' };
  if (actorType) where.actorType = actorType;

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        actor: { select: { username: true, firstName: true, telegramId: true } },
      },
    }),
  ]);

  const serialise = (obj: unknown): unknown =>
    JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));

  return NextResponse.json(
    serialise({
      logs: logs.map((l) => ({
        id: l.id,
        actorType: l.actorType,
        actorId: l.actorId,
        actorName: l.actor?.username || l.actor?.firstName || l.actorId,
        actorTelegramId: l.actor?.telegramId?.toString() || null,
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        metadata: l.metadataJson ? JSON.parse(l.metadataJson) : null,
        createdAt: l.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  );
}
