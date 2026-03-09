// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// User Service — Account management and lookups
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { nanoid } from 'nanoid';
import prisma from '../../db/prisma';
import type { User, Wallet } from '@prisma/client';

/**
 * Find or create a user from Telegram context.
 * Generates a unique referral code on first creation.
 */
export async function findOrCreateUser(
  telegramId: bigint,
  username?: string,
  firstName?: string,
  lastName?: string,
): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { telegramId } });
  if (existing) {
    // Update profile fields if they changed
    if (
      existing.username !== (username ?? null) ||
      existing.firstName !== (firstName ?? null) ||
      existing.lastName !== (lastName ?? null)
    ) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { username, firstName, lastName },
      });
    }
    return existing;
  }

  return prisma.user.create({
    data: {
      telegramId,
      username,
      firstName,
      lastName,
      referralCode: nanoid(10),
    },
  });
}

export async function getUserByTelegramId(telegramId: bigint): Promise<User | null> {
  return prisma.user.findUnique({ where: { telegramId } });
}

export async function getUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export async function getUserByReferralCode(code: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { referralCode: code } });
}

export async function getUserWallet(userId: string): Promise<Wallet | null> {
  return prisma.wallet.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

/** @deprecated Use getUserWallet — wallets are now auto-generated and always verified */
export const getVerifiedWallet = getUserWallet;
export const getActiveWallet = getUserWallet;

export async function getUserStats(): Promise<{
  totalUsers: number;
  verifiedUsers: number;
  usersWithReferrals: number;
}> {
  const [totalUsers, verifiedWallets, usersWithReferrals] = await Promise.all([
    prisma.user.count(),
    prisma.wallet.findMany({ where: { isVerified: true }, select: { userId: true }, distinct: ['userId'] }),
    prisma.referralEvent.groupBy({ by: ['referrerUserId'], _count: true }),
  ]);

  return {
    totalUsers,
    verifiedUsers: verifiedWallets.length,
    usersWithReferrals: usersWithReferrals.length,
  };
}
