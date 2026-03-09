// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scheduled Jobs — Periodic background tasks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import cron from 'node-cron';
import prisma from '../db/prisma';
import { logger } from '../utils/logger';
import { getUserTrackerState, getWalletBalances, getCurrentHeight } from '../services/blockchain';
import { evaluateEligibility, computeActivityScore } from '../services/eligibility';
import { calculateAllocation } from '../services/allocation';
import { getReferralStats, advanceReferralStatus } from '../services/referrals';
import { finalizeExpiredLocks } from '../services/locks';
import { getRedis } from '../utils/redis';

/**
 * Periodically refresh eligibility snapshots for all verified wallets.
 * This keeps the cache warm and drives referral status advancement.
 *
 * Runs every 30 minutes by default.
 */
export function startEligibilityRefreshJob(): void {
  cron.schedule('*/30 * * * *', async () => {
    const redis = getRedis();
    const acquired = await redis.set('job:eligibility_refresh', '1', 'EX', 1500, 'NX');
    if (!acquired) return;

    logger.info('Starting eligibility refresh job');
    try {
      const verifiedWallets = await prisma.wallet.findMany({
        where: { isVerified: true },
        include: { user: true },
      });

      const currentHeight = await getCurrentHeight();
      const BATCH_SIZE = 10;

      for (let i = 0; i < verifiedWallets.length; i += BATCH_SIZE) {
        const batch = verifiedWallets.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (wallet) => {
          try {
            const [tracker, balances] = await Promise.all([
              getUserTrackerState(wallet.address),
              getWalletBalances(wallet.address),
            ]);

            const elig = evaluateEligibility({ tracker, balances, currentHeight });
            const score = computeActivityScore(tracker, balances);

            const refStats = await getReferralStats(wallet.userId);
            const allocation = calculateAllocation({
              eligible: elig.eligible,
              tracker,
              balances,
              verifiedReferralCount: refStats.verifiedReferred,
              eligibleReferralCount: refStats.eligibleReferred,
            });

            await prisma.eligibilitySnapshot.upsert({
              where: { id: `snapshot-${wallet.userId}` },
              update: {
                eligible: elig.eligible,
                stDCCBalance: balances.stDCCBalance,
                poolCount: tracker.poolCount,
                swapCount: tracker.swapCount,
                dappCount: tracker.dappCount,
                hasCurrentLp: tracker.hasCurrentLp,
                lpAgeBlocks: tracker.firstLpHeight > 0 ? currentHeight - tracker.firstLpHeight : 0,
                walletAgeOk: tracker.walletAgeOk,
                txCountOk: tracker.txCountOk,
                sybilFlag: tracker.sybilFlag,
                claimed: tracker.claimed,
                rawScore: score,
                estimatedAllocation: allocation.totalEstimatedAmount,
                snapshotJson: JSON.stringify({ tracker, elig, allocation }),
              },
              create: {
                id: `snapshot-${wallet.userId}`,
                userId: wallet.userId,
                walletId: wallet.id,
                eligible: elig.eligible,
                stDCCBalance: balances.stDCCBalance,
                poolCount: tracker.poolCount,
                swapCount: tracker.swapCount,
                dappCount: tracker.dappCount,
                hasCurrentLp: tracker.hasCurrentLp,
                lpAgeBlocks: tracker.firstLpHeight > 0 ? currentHeight - tracker.firstLpHeight : 0,
                walletAgeOk: tracker.walletAgeOk,
                txCountOk: tracker.txCountOk,
                sybilFlag: tracker.sybilFlag,
                claimed: tracker.claimed,
                rawScore: score,
                estimatedAllocation: allocation.totalEstimatedAmount,
                snapshotJson: JSON.stringify({ tracker, elig, allocation }),
              },
            });

            if (elig.eligible) {
              await advanceReferralStatus(wallet.userId, 'ELIGIBLE');
            }
          } catch (err) {
            logger.warn({ err, wallet: wallet.address }, 'Failed to refresh eligibility for wallet');
          }
        }));
      }

      logger.info({ count: verifiedWallets.length }, 'Eligibility refresh job complete');
    } catch (err) {
      logger.error({ err }, 'Eligibility refresh job failed');
    } finally {
      await redis.del('job:eligibility_refresh');
    }
  });

  logger.info('Eligibility refresh job scheduled (every 30 minutes)');
}

/**
 * Periodically finalize expired locks for all users.
 * Runs every 5 minutes. Uses a Redis lock to prevent overlapping runs.
 */
export function startLockFinalizationJob(): void {
  cron.schedule('*/5 * * * *', async () => {
    const redis = getRedis();
    const acquired = await redis.set('job:finalize_locks', '1', 'EX', 240, 'NX');
    if (!acquired) return; // another instance is running

    try {
      const now = new Date();
      const usersWithExpired = await prisma.dccLock.findMany({
        where: { status: 'ACTIVE', expiresAt: { lte: now } },
        select: { userId: true },
        distinct: ['userId'],
      });

      if (usersWithExpired.length === 0) return;

      logger.info({ count: usersWithExpired.length }, 'Starting lock finalization job');

      for (const { userId } of usersWithExpired) {
        try {
          await finalizeExpiredLocks(userId);
        } catch (err) {
          logger.warn({ err, userId }, 'Failed to finalize locks for user');
        }
      }

      logger.info({ count: usersWithExpired.length }, 'Lock finalization job complete');
    } catch (err) {
      logger.error({ err }, 'Lock finalization job failed');
    } finally {
      await redis.del('job:finalize_locks');
    }
  });

  logger.info('Lock finalization job scheduled (every 5 minutes)');
}
