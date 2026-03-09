import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSession, type TelegramUser } from '@/lib/auth';

/**
 * Dev-only endpoint: list users for quick login on localhost.
 * Returns 404 in production to prevent abuse.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const users = await prisma.user.findMany({
    take: 20,
    orderBy: { createdAt: 'desc' },
    select: {
      telegramId: true,
      username: true,
      firstName: true,
      lastName: true,
      isAdmin: true,
    },
  });

  return NextResponse.json(
    users.map((u) => ({
      telegramId: u.telegramId.toString(),
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      isAdmin: u.isAdmin,
    }))
  );
}

/**
 * Dev-only endpoint: create a session for a user by telegramId.
 * Returns 404 in production.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { telegramId } = await req.json();
  if (!telegramId) {
    return NextResponse.json({ error: 'telegramId required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const fakeAuthData: TelegramUser = {
    id: Number(user.telegramId),
    first_name: user.firstName || 'Dev',
    last_name: user.lastName || undefined,
    username: user.username || undefined,
    auth_date: Math.floor(Date.now() / 1000),
    hash: 'dev-bypass',
  };

  const token = await createSession(fakeAuthData, user.isAdmin);

  const response = NextResponse.json({ ok: true });
  response.cookies.set('session', token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  return response;
}
