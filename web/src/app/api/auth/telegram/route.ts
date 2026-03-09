import { NextRequest, NextResponse } from 'next/server';
import { validateTelegramAuth, createSession, type TelegramUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const body = await req.json() as TelegramUser;

  if (!validateTelegramAuth(body)) {
    return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 });
  }

  // Ensure user exists in DB
  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(body.id) },
    update: {
      username: body.username || undefined,
      firstName: body.first_name || undefined,
      lastName: body.last_name || undefined,
    },
    create: {
      telegramId: BigInt(body.id),
      username: body.username || null,
      firstName: body.first_name || null,
      lastName: body.last_name || null,
      referralCode: crypto.randomUUID().slice(0, 8),
    },
  });

  const token = await createSession(body, user.isAdmin);

  const response = NextResponse.json({ ok: true });
  response.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });

  return response;
}
