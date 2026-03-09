import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';
import { createHmac } from 'crypto';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.TELEGRAM_BOT_TOKEN || 'dev-secret-change-me'
);

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface SessionPayload extends JWTPayload {
  telegramId: number;
  firstName: string;
  username?: string;
  photoUrl?: string;
  isAdmin?: boolean;
}

/** Validate the Telegram Login Widget data using HMAC-SHA-256 */
export function validateTelegramAuth(data: TelegramUser): boolean {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;

  const { hash, ...rest } = data;
  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k as keyof typeof rest]}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hmac = createHmac('sha256', secretKey).update(checkString).digest('hex');

  if (hmac !== hash) return false;

  // Reject auth data older than 1 day
  const now = Math.floor(Date.now() / 1000);
  if (now - data.auth_date > 86400) return false;

  return true;
}

export async function createSession(user: TelegramUser, isAdmin = false): Promise<string> {
  const token = await new SignJWT({
    telegramId: user.id,
    firstName: user.first_name,
    username: user.username,
    photoUrl: user.photo_url,
    isAdmin,
  } satisfies SessionPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);

  return token;
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
