// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Wallet Handlers — Auto-generated wallets
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import {
  walletInfoMessage,
  EXPORT_SEED_WARNING,
  seedExportMessage,
} from '../messages';
import {
  walletMenuKeyboard,
  exportSeedConfirmKeyboard,
  backToMainKeyboard,
} from '../keyboards';
import { generateWalletForUser, exportSeedPhrase } from '../../services/wallet';
import { getTotalOffChainBalance } from '../../services/purchases';
import { getCachedBalances, getAllTokenBalances } from '../../services/blockchain';
import { getBoostedRate } from '../../services/locks';
import { WAVELETS_PER_DCC } from '../../config/constants';

/**
 * Show the user's wallet dashboard with balances.
 */
export async function handleMyWallet(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;

  const result = await generateWalletForUser(ctx.dbUser.id);

  const [balance, onChain, boost] = await Promise.all([
    getTotalOffChainBalance(ctx.dbUser.id),
    getCachedBalances(result.address),
    getBoostedRate(ctx.dbUser.id),
  ]);

  const onChainDCC = Number(onChain.dccBalance) / WAVELETS_PER_DCC;

  const msg = walletInfoMessage({
    address: result.address,
    onChainDCC,
    offChainUnlocked: balance.totalAvailable,
    locked: balance.locked,
    lockEarnings: balance.lockEarnings,
    commissionEarnings: balance.commissionEarnings,
    depositBalance: balance.depositBalance,
    referralCount: boost.referralCount,
    lockRate: boost.rate,
  });

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: walletMenuKeyboard(onChainDCC > 0, balance.totalAvailable > 0),
  }).catch(() =>
    ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: walletMenuKeyboard(onChainDCC > 0, balance.totalAvailable > 0) }),
  );
  await ctx.answerCallbackQuery?.().catch(() => {});
}

/**
 * Show the wallet address in a copyable format.
 */
export async function handleWalletAddress(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;

  const result = await generateWalletForUser(ctx.dbUser.id);
  await ctx.answerCallbackQuery?.().catch(() => {});
  // Send as a separate message so it's easy to copy
  await ctx.reply(`\`${result.address}\``, { parse_mode: 'Markdown' });
}

/**
 * Show seed export warning and confirmation prompt.
 */
export async function handleExportSeed(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;

  await ctx.editMessageText(EXPORT_SEED_WARNING, {
    parse_mode: 'Markdown',
    reply_markup: exportSeedConfirmKeyboard(),
  }).catch(() =>
    ctx.reply(EXPORT_SEED_WARNING, {
      parse_mode: 'Markdown',
      reply_markup: exportSeedConfirmKeyboard(),
    }),
  );
  await ctx.answerCallbackQuery?.().catch(() => {});
}

/**
 * User confirmed — decrypt and show seed phrase, then auto-delete.
 */
export async function handleExportSeedConfirm(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;

  const seed = await exportSeedPhrase(ctx.dbUser.id);
  if (!seed) {
    await ctx.answerCallbackQuery({ text: 'Wallet not found.' });
    return;
  }

  await ctx.answerCallbackQuery?.().catch(() => {});

  // Send seed as a new message (not edit) so we can delete it after a delay
  const sent = await ctx.reply(seedExportMessage(seed), {
    parse_mode: 'Markdown',
    reply_markup: backToMainKeyboard(),
  });

  // Auto-delete after 60 seconds for security
  setTimeout(async () => {
    try {
      await ctx.api.deleteMessage(sent.chat.id, sent.message_id);
    } catch {
      // Message may already be deleted by user
    }
  }, 60_000);
}

/**
 * Show all token balances for the user's wallet.
 */
export async function handleBalances(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const wallet = await generateWalletForUser(ctx.dbUser.id);

  try {
    const { dcc, tokens } = await getAllTokenBalances(wallet.address);
    const dccAmount = dcc / WAVELETS_PER_DCC;

    let msg = `💰 *Token Balances*\n\n`;
    msg += `*DCC:* ${dccAmount.toFixed(4)} DCC\n`;

    if (tokens.length > 0) {
      msg += `\n*Other Tokens:*\n`;
      for (const t of tokens) {
        const bal = t.balance / Math.pow(10, t.decimals);
        msg += `• *${t.name}:* ${bal.toFixed(t.decimals > 4 ? 4 : t.decimals)}\n`;
      }
    } else {
      msg += `\n_No other tokens found._`;
    }

    await ctx.editMessageText(msg, {
      parse_mode: 'Markdown',
      reply_markup: backToMainKeyboard(),
    }).catch(() =>
      ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: backToMainKeyboard() }),
    );
  } catch {
    await ctx.editMessageText('⚠️ Could not load balances. Please try again.', {
      reply_markup: backToMainKeyboard(),
    }).catch(() =>
      ctx.reply('⚠️ Could not load balances. Please try again.', { reply_markup: backToMainKeyboard() }),
    );
  }
}
