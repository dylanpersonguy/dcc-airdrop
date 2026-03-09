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
import { getSolBalance, getOrCreateSolanaWallet, signAndSendBridgeDeposit } from '../services/solana';
import { generateSolDeposit, registerTransfer } from '../services/bridge';
import { getUserWallet } from '../services/wallet';
import { audit } from '../utils/audit';

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

/**
 * Watch for SOL deposits on custodial Solana wallets and auto-sign
 * bridge transactions.  Runs every minute.
 *
 * For each PENDING purchase with a depositAddress:
 *  1. Check SOL balance on the custodial address.
 *  2. If balance >= expected amount, mark DEPOSITED.
 *  3. Call the bridge API with the real sender (custodial pubkey).
 *  4. Sign and submit the returned instruction.
 *  5. Register the transfer and update the purchase record.
 */
export function startDepositWatcherJob(): void {
  // Minimum SOL to keep for transaction fees
  const FEE_BUFFER_SOL = 0.005;

  cron.schedule('* * * * *', async () => {
    const redis = getRedis();
    const acquired = await redis.set('job:deposit_watcher', '1', 'EX', 55, 'NX');
    if (!acquired) return;

    try {
      const pending = await prisma.dccPurchase.findMany({
        where: { status: 'PENDING', depositAddress: { not: null } },
        include: { user: true },
        take: 20, // batch size
      });

      if (pending.length === 0) return;

      logger.info({ count: pending.length }, 'Deposit watcher checking pending purchases');

      for (const purchase of pending) {
        try {
          const depositAddr = purchase.depositAddress!;
          const balance = await getSolBalance(depositAddr);

          // Only process SOL purchases for now (SPL support can be added later)
          if (purchase.token !== 'SOL') continue;

          if (balance < purchase.amountPaid - FEE_BUFFER_SOL) {
            // Not enough deposited yet — skip
            continue;
          }

          logger.info(
            { purchaseId: purchase.id, balance, expected: purchase.amountPaid },
            'Deposit detected — processing bridge transaction',
          );

          // Mark as deposited
          await prisma.dccPurchase.update({
            where: { id: purchase.id },
            data: { status: 'DEPOSITED' },
          });

          // Get user's DCC wallet for recipient
          const dccWallet = await getUserWallet(purchase.userId);
          if (!dccWallet) {
            logger.error({ purchaseId: purchase.id }, 'No DCC wallet found for user');
            continue;
          }

          // Get Solana wallet
          const solWallet = await getOrCreateSolanaWallet(purchase.userId);

          // Generate bridge instruction with real sender
          const deposit = await generateSolDeposit(
            purchase.amountPaid,
            dccWallet.address,
            solWallet.publicKey,
          );

          // Sign and submit the transaction
          const txSig = await signAndSendBridgeDeposit(solWallet, deposit.instruction);

          // Register transfer with bridge
          const transfer = await registerTransfer({
            sender: solWallet.publicKey,
            recipient: dccWallet.address,
            amount: Math.round(purchase.amountPaid * 1e9), // lamports
            amountFormatted: `${purchase.amountPaid} ${purchase.token}`,
            direction: 'sol_to_dcc',
          });

          // Update purchase record
          await prisma.dccPurchase.update({
            where: { id: purchase.id },
            data: {
              solanaTxId: txSig,
              bridgeTransferId: transfer.transferId,
              status: 'COMPLETED',
            },
          });

          await audit({
            actorType: 'system',
            action: 'purchase_auto_completed',
            targetType: 'user',
            targetId: purchase.userId,
            metadata: {
              purchaseId: purchase.id,
              txSig,
              transferId: transfer.transferId,
              amount: purchase.amountPaid,
              dccAmount: purchase.dccAmount,
            },
          });

          logger.info(
            { purchaseId: purchase.id, txSig, transferId: transfer.transferId },
            'Bridge deposit auto-signed and submitted',
          );
        } catch (err) {
          logger.warn({ err, purchaseId: purchase.id }, 'Failed to process deposit for purchase');
          // Don't fail the whole batch — continue to next purchase
        }
      }
    } catch (err) {
      logger.error({ err }, 'Deposit watcher job failed');
    } finally {
      await redis.del('job:deposit_watcher');
    }
  });

  logger.info('Deposit watcher job scheduled (every 1 minute)');
}
