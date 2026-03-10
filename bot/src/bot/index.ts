// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bot Setup — Wire commands, handlers, middleware
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Bot } from 'grammy';
import { config } from '../config';
import type { BotContext } from './middleware';
import {
  hydrateUser,
  rateLimiter,
  requestLogger,
  requireAdmin,
  errorHandler,
} from './middleware';

// Commands
import { handleStart } from './commands/start';

// Handlers
import { handleMyWallet, handleWalletAddress, handleExportSeed, handleExportSeedConfirm, handleBalances } from './handlers/wallet';
import {
  handleStake,
  handleStakeDeposit,
  handleStakeWithdraw,
  handleStakeAmount,
  handleUnstakeAmount,
  handleStakeConfirm,
  handleUnstakeConfirm,
} from './handlers/stake';
import {
  handleLiquidity,
  handlePoolDetail,
  handleLpPositions,
  handleLpAdd,
  handleLpAmount,
  handleLpConfirm,
  handleLpRemove,
  handleLpRemoveAmount,
  handleLpRemoveConfirm,
  handleLpQuickAdd,
} from './handlers/liquidity';
import { handleMyEligibility, handleMyAirdrop } from './handlers/eligibility';
import { handleExplainer } from './handlers/explainer';
import {
  handleReferralsMenu,
  handleReferralLink,
  handleReferralStats,
  handleReferralRewards,
  handleReferralRules,
  handleReferralTree,
  handleReferralLeaderboard,
} from './handlers/referrals';
import { handleClaimStatus } from './handlers/claim';
import { handleRedeem } from './handlers/redeem';
import {
  handleBuy,
  handleBuyToken,
  handleBuyAmount,
  handleBuyConfirm,
  handleBuyCancel,
  handleBuyStatus,
  handleBuyHistory,
} from './handlers/buy';
import {
  handleLock,
  handleLockNew,
  handleLockList,
  handleLockAmount,
  handleLockAmountPick,
  handleLockConfirm,
  handleLockCancel,
  handleLockInfo,
} from './handlers/lock';
import {
  handleHelpMenu,
  handleHelpAbout,
  handleHelpHow,
  handleHelpEligibility,
  handleHelpVerification,
  handleHelpClaim,
  handleHelpSupport,
  handleHelpReferral,
  handleHelpLock,
} from './handlers/help';
import {
  handleDeposit,
  handleDepositConfirm,
  handleDepositHistory,
} from './handlers/deposit';
import { handleHistory } from './handlers/history';
import {
  handleAdmin,
  handleAdminStats,
  handleAdminUser,
  handleAdminReferrals,
  handleAdminSyncWallet,
  handleAdminSetClaimLive,
  handleAdminExportAllocations,
  handleAdminGames,
  handleAdminGamesLeaderboard,
  handleAdminGamesUser,
  handleAdminGamesExport,
} from './handlers/admin';
import {
  handleSwap,
  handleSwapDirection,
  handleSwapPercent,
  handleSwapAmount,
  handleSwapConfirm,
} from './handlers/swap';
import {
  handleGamesMenu,
  handleGameStats,
  handleSlots,
  handleSlotsBetButton,
  handleSlotsAmount,
  handleMines,
  handleMinesBetButton,
  handleMinesAmount,
  handleMinesStart,
  handleMinesTile,
  handleMinesCashOut,
  handleMinesForfeit,
  handleCrash,
  handleCrashBetButton,
  handleCrashAmount,
  handleCrashNext,
  handleCrashCashOut,
  handleWheel,
  handleWheelBetButton,
  handleWheelAmount,
  handleHiLo,
  handleHiLoBetButton,
  handleHiLoAmount,
  handleHiLoGuess,
  handleHiLoCashOut,
  handleHiLoForfeit,
  handleDailyPrize,
  handleDailySpin,
} from './handlers/games';

// Keyboards
import { mainMenuKeyboard } from './keyboards';
import { WELCOME_MESSAGE, welcomeMessageWithBalance } from './messages';
import { getTotalOffChainBalance } from '../services/purchases';
import { getBoostedRate } from '../services/locks';
import { getUserWallet } from '../services/wallet';
import { getCachedBalances } from '../services/blockchain';
import { WAVELETS_PER_DCC } from '../config/constants';

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.TELEGRAM_BOT_TOKEN);

  // ── Global middleware ───────────────────
  bot.use(requestLogger);
  bot.use(rateLimiter);
  bot.use(hydrateUser);

  // ── Commands ────────────────────────────
  bot.command('start', handleStart);

  bot.command('eligibility', handleMyEligibility);
  bot.command('airdrop', handleMyAirdrop);
  bot.command('explainer', handleExplainer);
  bot.command('referrals', handleReferralsMenu);
  bot.command('claim', handleClaimStatus);
  bot.command('help', handleHelpMenu);
  bot.command('redeem', handleRedeem);
  bot.command('buy', handleBuy);
  bot.command('lock', handleLock);
  bot.command('deposit', handleDeposit);
  bot.command('stake', handleStake);
  bot.command('liquidity', handleLiquidity);
  bot.command('swap', handleSwap);
  bot.command('games', handleGamesMenu);

  // ── Admin commands (guarded) ────────────
  bot.command('admin', requireAdmin, handleAdmin);
  bot.command('admin_stats', requireAdmin, handleAdminStats);
  bot.command('admin_user', requireAdmin, handleAdminUser);
  bot.command('admin_referrals', requireAdmin, handleAdminReferrals);
  bot.command('admin_sync_wallet', requireAdmin, handleAdminSyncWallet);
  bot.command('admin_set_claim_live', requireAdmin, handleAdminSetClaimLive);
  bot.command('admin_export_allocations', requireAdmin, handleAdminExportAllocations);
  bot.command('admin_games', requireAdmin, handleAdminGames);
  bot.command('admin_games_leaderboard', requireAdmin, handleAdminGamesLeaderboard);
  bot.command('admin_games_user', requireAdmin, handleAdminGamesUser);
  bot.command('admin_games_export', requireAdmin, handleAdminGamesExport);

  // ── Callback queries (inline buttons) ───
  bot.callbackQuery('main_menu', async (ctx) => {
    let message = WELCOME_MESSAGE;
    if (ctx.dbUser) {
      const wallet = await getUserWallet(ctx.dbUser.id);
      const [balance, boost, onChain] = await Promise.all([
        getTotalOffChainBalance(ctx.dbUser.id),
        getBoostedRate(ctx.dbUser.id),
        wallet ? getCachedBalances(wallet.address) : Promise.resolve({ dccBalance: BigInt(0), stDCCBalance: BigInt(0) }),
      ]);
      const onChainDCC = Number(onChain.dccBalance) / WAVELETS_PER_DCC;
      if (balance.totalAvailable > 0 || balance.locked > 0 || onChainDCC > 0) {
        message = welcomeMessageWithBalance(balance.totalAvailable, balance.locked, onChainDCC, boost.referralCount, boost.rate, wallet?.address);
      }
    }
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: mainMenuKeyboard(),
    }).catch(() => ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: mainMenuKeyboard(),
    }));
    await ctx.answerCallbackQuery();
  });

  // Section dividers (no-op)
  bot.callbackQuery('noop', async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // Wallet
  bot.callbackQuery('my_wallet', handleMyWallet);
  bot.callbackQuery('wallet_address', handleWalletAddress);
  bot.callbackQuery('wallet_balances', handleBalances);
  bot.callbackQuery('export_seed', handleExportSeed);
  bot.callbackQuery('export_seed_confirm', handleExportSeedConfirm);

  // Staking
  bot.callbackQuery('stake', handleStake);
  bot.callbackQuery('stake_deposit', handleStakeDeposit);
  bot.callbackQuery('stake_withdraw', handleStakeWithdraw);
  bot.callbackQuery('stake_confirm', handleStakeConfirm);
  bot.callbackQuery('unstake_confirm', handleUnstakeConfirm);

  // Swap
  bot.callbackQuery('swap', handleSwap);
  bot.callbackQuery('swap_dcc_to_stdcc', handleSwapDirection);
  bot.callbackQuery('swap_stdcc_to_dcc', handleSwapDirection);
  bot.callbackQuery(/^swap_pct_/, handleSwapPercent);
  bot.callbackQuery('swap_confirm', handleSwapConfirm);

  // Liquidity
  bot.callbackQuery('liquidity', handleLiquidity);
  bot.callbackQuery(/^lpp_/, handlePoolDetail);
  bot.callbackQuery('lp_positions', handleLpPositions);
  bot.callbackQuery(/^lp_quick_/, handleLpQuickAdd);
  bot.callbackQuery(/^lpa_/, handleLpAdd);
  bot.callbackQuery('lp_confirm', handleLpConfirm);
  bot.callbackQuery('lp_remove_confirm', handleLpRemoveConfirm);
  bot.callbackQuery(/^lpr_/, handleLpRemove);

  // Eligibility / airdrop
  bot.callbackQuery('my_eligibility', handleMyEligibility);
  bot.callbackQuery('explainer', handleExplainer);
  bot.callbackQuery('my_airdrop', handleMyAirdrop);

  // Referrals
  bot.callbackQuery('referrals_menu', handleReferralsMenu);
  bot.callbackQuery('referral_link', handleReferralLink);
  bot.callbackQuery('referral_stats', handleReferralStats);
  bot.callbackQuery('referral_rewards', handleReferralRewards);
  bot.callbackQuery('referral_rules', handleReferralRules);
  bot.callbackQuery('referral_tree', handleReferralTree);
  bot.callbackQuery('referral_leaderboard', handleReferralLeaderboard);

  // Claim
  bot.callbackQuery('claim_status', handleClaimStatus);

  // Redeem
  bot.callbackQuery('redeem', handleRedeem);

  // Buy DCC
  bot.callbackQuery('buy', handleBuy);
  bot.callbackQuery(/^buy_token_/, handleBuyToken);
  bot.callbackQuery('buy_confirm', handleBuyConfirm);
  bot.callbackQuery('buy_cancel', handleBuyCancel);
  bot.callbackQuery(/^buy_status_/, handleBuyStatus);
  bot.callbackQuery('buy_history', handleBuyHistory);

  // Lock DCC
  bot.callbackQuery('lock', handleLock);
  bot.callbackQuery('lock_new', handleLockNew);
  bot.callbackQuery('lock_list', handleLockList);
  bot.callbackQuery(/^lock_amount_/, handleLockAmountPick);
  bot.callbackQuery('lock_confirm', handleLockConfirm);
  bot.callbackQuery('lock_cancel', handleLockCancel);
  bot.callbackQuery('lock_info', handleLockInfo);

  // Deposit DCC
  bot.callbackQuery('deposit', handleDeposit);
  bot.callbackQuery('deposit_confirm', handleDepositConfirm);
  bot.callbackQuery('deposit_history', handleDepositHistory);

  // Activity history
  bot.callbackQuery('history', handleHistory);
  bot.callbackQuery(/^history_page_/, handleHistory);

  // Help
  bot.callbackQuery('help_menu', handleHelpMenu);
  bot.callbackQuery('help_about', handleHelpAbout);
  bot.callbackQuery('help_how', handleHelpHow);
  bot.callbackQuery('help_eligibility', handleHelpEligibility);
  bot.callbackQuery('help_verification', handleHelpVerification);
  bot.callbackQuery('help_claim', handleHelpClaim);
  bot.callbackQuery('help_support', handleHelpSupport);
  bot.callbackQuery('help_referral', handleHelpReferral);
  bot.callbackQuery('help_lock', handleHelpLock);

  // Mini Games
  bot.callbackQuery('games_menu', handleGamesMenu);
  bot.callbackQuery('game_stats', handleGameStats);
  bot.callbackQuery('game_slots', handleSlots);
  bot.callbackQuery(/^slots_bet_/, handleSlotsBetButton);
  bot.callbackQuery('game_mines', handleMines);
  bot.callbackQuery(/^mines_bet_/, handleMinesBetButton);
  bot.callbackQuery(/^mines_start_/, handleMinesStart);
  bot.callbackQuery(/^mines_tile_/, handleMinesTile);
  bot.callbackQuery('mines_cashout', handleMinesCashOut);
  bot.callbackQuery('mines_forfeit', handleMinesForfeit);
  bot.callbackQuery('game_crash', handleCrash);
  bot.callbackQuery(/^crash_bet_/, handleCrashBetButton);
  bot.callbackQuery('crash_next', handleCrashNext);
  bot.callbackQuery('crash_cashout', handleCrashCashOut);
  bot.callbackQuery('game_wheel', handleWheel);
  bot.callbackQuery(/^wheel_bet_/, handleWheelBetButton);
  bot.callbackQuery('game_hilo', handleHiLo);
  bot.callbackQuery(/^hilo_bet_/, handleHiLoBetButton);
  bot.callbackQuery('hilo_higher', handleHiLoGuess);
  bot.callbackQuery('hilo_lower', handleHiLoGuess);
  bot.callbackQuery('hilo_cashout', handleHiLoCashOut);
  bot.callbackQuery('hilo_forfeit', handleHiLoForfeit);
  bot.callbackQuery('game_daily', handleDailyPrize);
  bot.callbackQuery('daily_spin', handleDailySpin);


  // ── Text message handler (session-based flows) ─
  bot.on('message:text', async (ctx) => {
    if (!ctx.dbUser) return;

    // Active session step — route to handler
    if (ctx.sessionStep === 'buy:enter_amount') {
      return handleBuyAmount(ctx);
    }
    if (ctx.sessionStep === 'lock:enter_amount') {
      return handleLockAmount(ctx);
    }
    if (ctx.sessionStep === 'stake:enter_amount') {
      return handleStakeAmount(ctx);
    }
    if (ctx.sessionStep === 'stake:enter_unstake_amount') {
      return handleUnstakeAmount(ctx);
    }
    if (ctx.sessionStep === 'swap:enter_amount') {
      return handleSwapAmount(ctx);
    }
    if (ctx.sessionStep === 'lp:enter_amount') {
      return handleLpAmount(ctx);
    }
    if (ctx.sessionStep === 'lp:enter_remove_amount') {
      return handleLpRemoveAmount(ctx);
    }
    if (ctx.sessionStep === 'game:slots_bet') {
      return handleSlotsAmount(ctx);
    }
    if (ctx.sessionStep === 'game:mines_bet') {
      return handleMinesAmount(ctx);
    }
    if (ctx.sessionStep === 'game:crash_bet') {
      return handleCrashAmount(ctx);
    }
    if (ctx.sessionStep === 'game:wheel_bet') {
      return handleWheelAmount(ctx);
    }
    if (ctx.sessionStep === 'game:hilo_bet') {
      return handleHiLoAmount(ctx);
    }


    // No active session — check if user might be typing an amount into an expired flow
    const text = ctx.message.text.trim();
    if (/^\d+(\.\d+)?$/.test(text) || text.toLowerCase() === 'max') {
      await ctx.reply(
        '⚠️ Your session expired. Please restart the action you were performing:\n\n'
        + '💳 /buy — Purchase DCC\n'
        + '🔒 /lock — Lock DCC\n'
        + '🥩 /stake — Stake DCC\n'
        + '🔄 /swap — Swap Tokens\n'
        + '🌊 /liquidity — LP Pools',
        { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() },
      );
    }
  });

  // ── Error handling ──────────────────────
  bot.catch((err) => {
    errorHandler(err.error as Error, err.ctx as BotContext);
  });

  return bot;
}
