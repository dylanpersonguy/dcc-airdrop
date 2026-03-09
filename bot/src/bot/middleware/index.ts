// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bot Middleware — Rate limiting, auth, logging
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Context, NextFunction } from 'grammy';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { getRedis } from '../../utils/redis';
import { findOrCreateUser } from '../../services/users';

// ── Session / user hydration ──────────────
// Attaches db user to context and ensures user record exists.

export interface BotContext extends Context {
  dbUser?: Awaited<ReturnType<typeof findOrCreateUser>>;
  isAdmin?: boolean;
  sessionStep?: string; // "awaiting_wallet" etc., stored in Redis
}

export async function hydrateUser(ctx: BotContext, next: NextFunction): Promise<void> {
  if (!ctx.from) {
    await next();
    return;
  }

  const telegramId = BigInt(ctx.from.id);
  const user = await findOrCreateUser(
    telegramId,
    ctx.from.username,
    ctx.from.first_name,
    ctx.from.last_name,
  );

  ctx.dbUser = user;
  ctx.isAdmin = config.ADMIN_TELEGRAM_IDS.includes(telegramId);

  // Load session step from Redis
  const session = await getSession(user.id);
  ctx.sessionStep = session.step;

  await next();
}

// ── Rate limiting ─────────────────────────
// Fixed-window rate limiter backed by Redis.

export async function rateLimiter(ctx: BotContext, next: NextFunction): Promise<void> {
  if (!ctx.from) {
    await next();
    return;
  }

  const redis = getRedis();
  const key = `ratelimit:${ctx.from.id}`;
  const current = await redis.incr(key);

  if (current === 1) {
    await redis.pexpire(key, config.RATE_LIMIT_WINDOW_MS);
  }

  if (current > config.RATE_LIMIT_MAX_REQUESTS) {
    logger.warn({ telegramId: ctx.from.id }, 'Rate limit exceeded');
    await ctx.reply('⚠️ Too many requests. Please slow down and try again in a minute.');
    return;
  }

  await next();
}

/**
 * Per-action rate limiter. Returns `true` if the action is rate-limited.
 * Allows `max` invocations per `windowSec` seconds for the given action and user.
 */
export async function isActionLimited(
  userId: string,
  action: string,
  max: number = 3,
  windowSec: number = 60,
): Promise<boolean> {
  const redis = getRedis();
  const key = `rl:${action}:${userId}`;
  const current = await redis.incr(key);
  if (current === 1) await redis.expire(key, windowSec);
  return current > max;
}

// ── Admin guard ───────────────────────────
// Used in admin command registrations.

export async function requireAdmin(ctx: BotContext, next: NextFunction): Promise<void> {
  if (!ctx.isAdmin) {
    await ctx.reply('⛔ Unauthorized.');
    return;
  }
  await next();
}

// ── Request logging ───────────────────────

export async function requestLogger(ctx: BotContext, next: NextFunction): Promise<void> {
  const start = Date.now();
  const updateType = (ctx as any).updateType as string | undefined;
  const from = ctx.from?.id;

  await next();

  const ms = Date.now() - start;
  logger.debug({ updateType, from, ms }, 'Request handled');
}

// ── Error handler ─────────────────────────

function userFriendlyMessage(err: Error): string {
  const msg = err.message ?? '';
  if (msg.includes('timeout') || msg.includes('ETIMEDOUT'))
    return '⏱ The request timed out. Please try again.';
  if (msg.includes('rate') || msg.includes('429'))
    return '⚡ Too many requests. Please wait a moment.';
  if (msg.includes('insufficient') || msg.includes('balance'))
    return '💰 Insufficient balance for this operation.';
  return '❌ An unexpected error occurred. Please try again later.';
}

export function errorHandler(err: Error, ctx: BotContext): void {
  logger.error({ err, from: ctx.from?.id, update: (ctx as any).updateType }, 'Unhandled bot error');
  ctx.reply(userFriendlyMessage(err)).catch(() => {});
}

// ── Session step helpers (Redis-backed) ───

export interface SessionData {
  step?: string;
  buyToken?: string;
  buyAmount?: string;
  buyDccAmount?: string;
  buyUsdValue?: string;
  lockAmount?: string;
  stakeAmount?: string;
  stakeShares?: string;
  lpPoolKey?: string;
  lpAmountA?: string;
  lpAmountB?: string;
  lpFeeBps?: string;
  lpRemoveAmount?: string;
}

const SESSION_TTL = 3600; // 1 hour

export async function getSession(userId: string): Promise<SessionData> {
  const redis = getRedis();
  const raw = await redis.get(`session:${userId}`);
  return raw ? JSON.parse(raw) : {};
}

export async function setSession(userId: string, data: Partial<SessionData>): Promise<void> {
  const redis = getRedis();
  const key = `session:${userId}`;
  const current = await getSession(userId);
  const merged = { ...current, ...data };
  await redis.set(key, JSON.stringify(merged), 'EX', SESSION_TTL);
}

export async function clearSession(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`session:${userId}`);
}

export async function setSessionStep(userId: string, step: string | null): Promise<void> {
  if (step) {
    await setSession(userId, { step });
  } else {
    await clearSession(userId);
  }
}
