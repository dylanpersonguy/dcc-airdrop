// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Redeem Handler — Move off-chain DCC to on-chain wallet
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import { isActionLimited } from '../middleware';
import { backToMainKeyboard, afterRedeemKeyboard } from '../keyboards';
import { editOrReply } from '../utils';
import { markInviteRewardsRedeemed } from '../../services/referrals';
import { getTotalOffChainBalance, markPurchasesRedeemed } from '../../services/purchases';
import { markLockCommissionsRedeemed, markLockEarningsRedeemed } from '../../services/locks';
import { getUserWallet } from '../../services/wallet';
import { sendDCC } from '../../services/transfer';
import { getRewardsWalletBalance } from '../../services/transfer';
import { logger } from '../../utils/logger';
import { audit } from '../../utils/audit';
import prisma from '../../db/prisma';
import { getRedis } from '../../utils/redis';
import { randomBytes } from 'crypto';

/** Batch update all redeemable models matching a txId. */
async function batchRedeemUpdate(
  userId: string,
  txId: string,
  data: Record<string, unknown>,
  earningsData?: Record<string, unknown>,
): Promise<void> {
  await Promise.all([
    prisma.inviteReward.updateMany({
      where: { userId, redeemTxId: txId },
      data,
    }),
    prisma.dccPurchase.updateMany({
      where: { userId, redeemTxId: txId },
      data,
    }),
    prisma.lockReferralReward.updateMany({
      where: { userId, redeemTxId: txId },
      data,
    }),
    prisma.dccLock.updateMany({
      where: { userId, earningsRedeemTxId: txId },
      data: earningsData ?? data,
    }),
  ]);
}

/**
 * Revert redeemed marks if sendDCC fails.
 */
async function unmarkRedeemed(userId: string, txId: string): Promise<void> {
  await batchRedeemUpdate(userId, txId,
    { redeemed: false, redeemedAt: null, redeemTxId: null },
    { earningsRedeemed: false, earningsRedeemedAt: null, earningsRedeemTxId: null },
  );
}

/**
 * Replace placeholder txId with the real one after sendDCC succeeds.
 */
async function updateRedeemTxId(userId: string, oldTxId: string, newTxId: string): Promise<void> {
  await batchRedeemUpdate(userId, oldTxId,
    { redeemTxId: newTxId },
    { earningsRedeemTxId: newTxId },
  );
}

export async function handleRedeem(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  if (await isActionLimited(ctx.dbUser.id, 'redeem', 3, 300)) {
    await editOrReply(ctx, '⚠️ Too many redemption attempts. Please try again in a few minutes.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToMainKeyboard(),
    });
    return;
  }

  const balance = await getTotalOffChainBalance(ctx.dbUser.id);

  if (balance.totalAvailable <= 0) {
    await editOrReply(ctx, `
🎁 *Redeem DCC*

You have no off-chain DCC to redeem right now.

💳 Use /buy to purchase DCC with SOL/USDC/USDT
👥 Invite friends to earn *1 DCC* per invite!
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: backToMainKeyboard(),
    });
    return;
  }

  const wallet = await getUserWallet(ctx.dbUser.id);
  if (!wallet) {
    await editOrReply(ctx, '⚠️ No wallet found. Use /start to create one.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToMainKeyboard(),
    });
    return;
  }

  // Acquire a per-user redeem lock to prevent concurrent redemptions
  const redis = getRedis();
  const lockKey = `redeem_lock:${ctx.dbUser.id}`;
  const acquired = await redis.set(lockKey, '1', 'EX', 60, 'NX');
  if (!acquired) {
    await editOrReply(ctx, '⚠️ A redemption is already in progress. Please wait a moment and try again.', {
      parse_mode: 'Markdown' as const,
      reply_markup: backToMainKeyboard(),
    });
    return;
  }

  // Check rewards wallet has enough DCC to fulfill this redemption
  try {
    const rewardsBalance = await getRewardsWalletBalance();
    if (rewardsBalance < balance.totalAvailable + 0.001) {
      logger.warn(
        { userId: ctx.dbUser.id, requested: balance.totalAvailable, rewardsBalance },
        'Rewards wallet insufficient for redemption',
      );
      await editOrReply(ctx, `
⚠️ *Redemption Temporarily Unavailable*

The rewards pool is being replenished. Please try again later.
Your *${balance.totalAvailable.toFixed(2)} DCC* balance is safe.
      `.trim(), {
        parse_mode: 'Markdown' as const,
        reply_markup: backToMainKeyboard(),
      });
      return;
    }
  } catch (err) {
    logger.error({ err }, 'Failed to check rewards wallet balance');
    // Proceed anyway — sendDCC will fail if wallet is truly empty
  }

  await editOrReply(ctx, '⏳ Processing your redemption...', {
    parse_mode: 'Markdown' as const,
  });

  try {
    // Mark rewards as redeemed BEFORE sending DCC to prevent double-redeem.
    // If sendDCC fails, we'll unmark them.
    let inviteRedeemed = 0;
    let purchaseRedeemed = 0;
    let commissionRedeemed = 0;
    let lockEarningsRedeemed = 0;
    const placeholderTxId = `pending_${randomBytes(16).toString('hex')}`;

    if (balance.inviteAvailable > 0) {
      inviteRedeemed = await markInviteRewardsRedeemed(ctx.dbUser.id, placeholderTxId);
    }
    if (balance.purchaseAvailable > 0) {
      purchaseRedeemed = await markPurchasesRedeemed(ctx.dbUser.id, placeholderTxId);
    }
    if (balance.commissionEarnings > 0) {
      commissionRedeemed = await markLockCommissionsRedeemed(ctx.dbUser.id, placeholderTxId);
    }
    if (balance.lockEarnings > 0) {
      lockEarningsRedeemed = await markLockEarningsRedeemed(ctx.dbUser.id, placeholderTxId);
    }

    const totalRedeemed = inviteRedeemed + purchaseRedeemed + commissionRedeemed + lockEarningsRedeemed;

    let txId: string;
    try {
      txId = await sendDCC(wallet.address, balance.totalAvailable);
    } catch (sendErr) {
      // Send failed — unmark rewards so the user can retry
      logger.error({ err: sendErr, userId: ctx.dbUser.id }, 'sendDCC failed, reverting redeemed marks');
      await unmarkRedeemed(ctx.dbUser.id, placeholderTxId);
      throw sendErr;
    }

    // Update placeholder txId to the real one
    await updateRedeemTxId(ctx.dbUser.id, placeholderTxId, txId);

    await audit({
      actorType: 'user',
      actorId: ctx.dbUser.id,
      action: 'dcc_redeemed',
      targetType: 'user',
      targetId: ctx.dbUser.id,
      metadata: { txId, totalRedeemed, inviteRedeemed, purchaseRedeemed, commissionRedeemed, lockEarningsRedeemed, wallet: wallet.address },
    });

    logger.info(
      { userId: ctx.dbUser.id, amount: totalRedeemed, inviteRedeemed, purchaseRedeemed, commissionRedeemed, lockEarningsRedeemed, txId },
      'Off-chain DCC redeemed',
    );

    const breakdown: string[] = [];
    if (inviteRedeemed > 0) breakdown.push(`│ Invite Rewards: ${inviteRedeemed} DCC`);
    if (purchaseRedeemed > 0) breakdown.push(`│ Purchases: ${purchaseRedeemed} DCC`);
    if (lockEarningsRedeemed > 0) breakdown.push(`│ Lock Earnings: ${lockEarningsRedeemed.toFixed(2)} DCC`);
    if (commissionRedeemed > 0) breakdown.push(`│ Lock Commissions: ${commissionRedeemed.toFixed(2)} DCC`);

    const msg = `
✅ *Redemption Successful!*

💰 *${totalRedeemed} DCC* sent to your wallet!

┌─────────────────────────
${breakdown.join('\n')}
│ ──────────────────
│ Total: ${totalRedeemed} DCC
│ TX: \`${txId}\`
│ To: \`${wallet.address}\`
└─────────────────────────

Your tokens are on their way! 🚀
    `.trim();

    await editOrReply(ctx, msg, {
      parse_mode: 'Markdown' as const,
      reply_markup: afterRedeemKeyboard(),
    });
  } catch (err) {
    logger.error({ err, userId: ctx.dbUser.id }, 'Redeem failed');
    await editOrReply(ctx, `
⚠️ *Redemption Failed*

Something went wrong processing your redemption. Please try again later.

Your *${balance.totalAvailable} DCC* balance is safe and will be available for redemption.
    `.trim(), {
      parse_mode: 'Markdown' as const,
      reply_markup: backToMainKeyboard(),
    });
  } finally {
    await redis.del(lockKey);
  }
}
