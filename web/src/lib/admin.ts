import { NextResponse } from 'next/server';
import { getSession } from './auth';
import { prisma } from './prisma';

/**
 * Verify the current session belongs to an admin user.
 * Returns the session payload on success, or a 401/403 Response.
 */
export async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  // Double-check admin flag from DB (session flag can be stale)
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(session.telegramId) },
    select: { id: true, isAdmin: true },
  });

  if (!user?.isAdmin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { session, userId: user.id };
}
