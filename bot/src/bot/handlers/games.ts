// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Games Handler — Casino Mini-Games 🎰💣🚀
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BotContext } from '../middleware';
import { setSession, getSession, clearSession } from '../middleware';
import { editOrReply } from '../utils';
import { InlineKeyboard } from 'grammy';
import {
  MIN_BET,
  MAX_BET,
  getGameBalance,
  getGameStats,
  playSlots,
  generateSlotFrames,
  createMinesGame,
  revealMinesTile,
  cashOutMines,
  loseMines,
  saveMinesState,
  loadMinesState,
  clearMinesState,
  createCrashGame,
  advanceCrash,
  cashOutCrash,
  loseCrash,
  saveCrashState,
  loadCrashState,
  clearCrashState,
  MINE_COUNTS,
  MINES_GRID_SIZE,
  spinWheel,
  generateWheelFrames,
  renderWheelVisual,
  WHEEL_SEGMENTS,
  createHiLoGame,
  guessHiLo,
  cashOutHiLo,
  loseHiLo,
  saveHiLoState,
  loadHiLoState,
  clearHiLoState,
  cardDisplay,
  cardEmoji,
  renderCardBox,
  renderStreakBar,
  canClaimDailyPrize,
  spinDailyPrize,
  generateDailyWheelFrames,
  renderDailyWheelVisual,
  formatTimeUntil,
  DAILY_PRIZE_SEGMENTS,

  type MineCount,
  type MinesState,
  type CrashState,
  type HiLoState,
} from '../../services/games';

// ── Helper: format DCC amount ─────────────
const fmt = (n: number) => n.toFixed(2);

// ── Helper: sleep ─────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GAMES MENU
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function handleGamesMenu(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const [balance, stats] = await Promise.all([
    getGameBalance(ctx.dbUser.id),
    getGameStats(ctx.dbUser.id),
  ]);

  const profitEmoji = stats.netProfit >= 0 ? '📈' : '📉';
  const profitSign = stats.netProfit >= 0 ? '+' : '';

  const msg = `
🎲 *MINI GAMES — DCC Casino*

┌─────────────────────────
│ 💰 Balance: *${fmt(balance)} DCC*
│ 🎮 Games Played: *${stats.totalGames}*
│ 💵 Total Wagered: *${fmt(stats.totalWagered)} DCC*
│ ${profitEmoji} Net P&L: *${profitSign}${fmt(stats.netProfit)} DCC*${stats.biggestWin > 0 ? `\n│ 🏆 Biggest Win: *+${fmt(stats.biggestWin)} DCC*` : ''}
└─────────────────────────

🎰 *Mega Slots* — Spin to win up to *100x*!
💣 *Mines* — Dodge the bombs, cash out anytime
🚀 *Crash* — Ride the rocket, bail before it blows
🎡 *Lucky Wheel* — Spin for up to *50x*!
🃏 *Hi-Lo* — Guess higher or lower, streak to *500x*!
🎁 *Daily Prize* — FREE spin, win up to *10,000 DCC*!

_Min bet: ${MIN_BET} DCC • Max bet: ${MAX_BET.toLocaleString()} DCC_`;

  const kb = new InlineKeyboard()
    .text('🎰 Mega Slots', 'game_slots')
    .text('💣 Mines', 'game_mines').row()
    .text('🚀 Crash', 'game_crash')
    .text('🎡 Lucky Wheel', 'game_wheel').row()
    .text('🃏 Hi-Lo', 'game_hilo').row()
    .text('🎁 Daily Prize (FREE)', 'game_daily').row()
    .text('─────────────────', 'noop').row()
    .text('📊 My Stats', 'game_stats')
    .text('◀️ Main Menu', 'main_menu');

  await editOrReply(ctx, msg, { parse_mode: 'Markdown', reply_markup: kb });
}

// ── Game Stats ────────────────────────────

export async function handleGameStats(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const [balance, stats] = await Promise.all([
    getGameBalance(ctx.dbUser.id),
    getGameStats(ctx.dbUser.id),
  ]);

  const profitEmoji = stats.netProfit >= 0 ? '📈' : '📉';
  const profitSign = stats.netProfit >= 0 ? '+' : '';
  const winRate = stats.totalGames > 0
    ? ((stats.totalWon / stats.totalWagered) * 100).toFixed(1)
    : '0.0';

  const msg = `
📊 *Your Casino Stats*

┌─────────────────────────
│ 💰 Current Balance: *${fmt(balance)} DCC*
│ ──────────────────
│ 🎮 Total Games: *${stats.totalGames}*
│ 💵 Total Wagered: *${fmt(stats.totalWagered)} DCC*
│ 💰 Total Won: *${fmt(stats.totalWon)} DCC*
│ ${profitEmoji} Net P&L: *${profitSign}${fmt(stats.netProfit)} DCC*
│ 📈 Return Rate: *${winRate}%*${stats.biggestWin > 0 ? `\n│ 🏆 Biggest Win: *+${fmt(stats.biggestWin)} DCC*` : ''}
└─────────────────────────

_Play responsibly. The house always has a small edge._`;

  const kb = new InlineKeyboard()
    .text('🎰 Slots', 'game_slots')
    .text('💣 Mines', 'game_mines').row()
    .text('🚀 Crash', 'game_crash')
    .text('🎡 Wheel', 'game_wheel').row()
    .text('🃏 Hi-Lo', 'game_hilo')
    .text('🎁 Daily', 'game_daily').row()
    .text('◀️ Games Menu', 'games_menu');

  await editOrReply(ctx, msg, { parse_mode: 'Markdown', reply_markup: kb });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GAME 1: MEGA SLOTS 🎰
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function handleSlots(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const balance = await getGameBalance(ctx.dbUser.id);

  const msg = `
🎰 *MEGA SLOTS*

┌─────────────────────────
│ 💰 Balance: *${fmt(balance)} DCC*
│ ──────────────────
│ 👑👑👑 → *100x* JACKPOT
│ 💎💎💎 → *50x*
│ ⭐⭐⭐ → *25x*
│ 🔔🔔🔔 → *10x*
│ 🍋🍋🍋 → *5x*
│ 🍒🍒🍒 → *3x*
│ Any Pair → *1.5x*
└─────────────────────────

💬 *Enter your bet amount* (${MIN_BET}–${Math.min(MAX_BET, Math.floor(balance))} DCC)
_Or use a quick bet button below:_`;

  const quickBets = [10, 25, 50, 100, 250, 500].filter((b) => b <= balance);
  const kb = new InlineKeyboard();
  for (let i = 0; i < quickBets.length; i++) {
    kb.text(`${quickBets[i]} DCC`, `slots_bet_${quickBets[i]}`);
    if (i % 3 === 2) kb.row();
  }
  if (quickBets.length % 3 !== 0) kb.row();
  if (balance >= MIN_BET) {
    kb.text('🔥 ALL IN', `slots_bet_max`).row();
  }
  kb.text('◀️ Games Menu', 'games_menu');

  await setSession(ctx.dbUser.id, { step: 'game:slots_bet' });
  await editOrReply(ctx, msg, { parse_mode: 'Markdown', reply_markup: kb });
}

export async function handleSlotsBetButton(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.callbackQuery?.data) return;
  await ctx.answerCallbackQuery();

  const data = ctx.callbackQuery.data;
  const balance = await getGameBalance(ctx.dbUser.id);
  let bet: number;

  if (data === 'slots_bet_max') {
    bet = Math.min(MAX_BET, Math.floor(balance));
  } else {
    bet = parseInt(data.replace('slots_bet_', ''), 10);
  }

  if (isNaN(bet) || bet < MIN_BET || bet > balance) {
    await ctx.reply(`❌ Invalid bet. You have *${fmt(balance)} DCC* available.`, { parse_mode: 'Markdown' });
    return;
  }

  await executeSlotsSpin(ctx, bet);
}

export async function handleSlotsAmount(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.message?.text) return;

  const text = ctx.message.text.trim().toLowerCase();
  const balance = await getGameBalance(ctx.dbUser.id);
  let bet: number;

  if (text === 'max') {
    bet = Math.min(MAX_BET, Math.floor(balance));
  } else {
    bet = parseFloat(text);
  }

  if (isNaN(bet) || bet < MIN_BET) {
    await ctx.reply(`❌ Minimum bet is *${MIN_BET} DCC*.`, { parse_mode: 'Markdown' });
    return;
  }
  if (bet > balance) {
    await ctx.reply(`❌ Insufficient balance. You have *${fmt(balance)} DCC*.`, { parse_mode: 'Markdown' });
    return;
  }
  if (bet > MAX_BET) {
    await ctx.reply(`❌ Maximum bet is *${MAX_BET} DCC*.`, { parse_mode: 'Markdown' });
    return;
  }

  await clearSession(ctx.dbUser.id);
  await executeSlotsSpin(ctx, Math.floor(bet * 100) / 100);
}

async function executeSlotsSpin(ctx: BotContext, bet: number): Promise<void> {
  if (!ctx.dbUser) return;

  const result = await playSlots(ctx.dbUser.id, bet);
  const frames = generateSlotFrames(result.reels);

  // Send initial spinning message
  const spinMsg = await ctx.reply(
    `🎰 *SPINNING...*\n\n` +
    `  ┌───┬───┬───┐\n` +
    `  │ ${frames[0][0]} │ ${frames[0][1]} │ ${frames[0][2]} │\n` +
    `  └───┴───┴───┘\n\n` +
    `💰 Bet: *${fmt(bet)} DCC*`,
    { parse_mode: 'Markdown' },
  );

  // Animate reel stops
  for (let i = 1; i < frames.length; i++) {
    await sleep(600);
    const locked = i >= 2 ? '🔒' : '🔄';
    const locked2 = i >= 4 ? '🔒' : '🔄';
    const statusLine = i < 2 ? '🔄 Spinning...' : i < 4 ? `${locked} Reel 1 locked!` : i < 6 ? `${locked} ${locked2} Reel 2 locked!` : '🎯 Final result!';

    await ctx.api.editMessageText(
      spinMsg.chat.id,
      spinMsg.message_id,
      `🎰 *SPINNING...*\n\n` +
      `  ┌───┬───┬───┐\n` +
      `  │ ${frames[i][0]} │ ${frames[i][1]} │ ${frames[i][2]} │\n` +
      `  └───┴───┴───┘\n\n` +
      `💰 Bet: *${fmt(bet)} DCC*\n${statusLine}`,
      { parse_mode: 'Markdown' },
    ).catch(() => {});
  }

  // Final result
  await sleep(800);

  let resultText: string;
  const newBalance = await getGameBalance(ctx.dbUser.id);

  if (result.isJackpot) {
    resultText = `
🎰 *━━━ JACKPOT!!! ━━━* 🎰

  ┌───┬───┬───┐
  │ ${result.reels[0]} │ ${result.reels[1]} │ ${result.reels[2]} │
  └───┴───┴───┘

🎉🎉🎉 *INCREDIBLE!* 🎉🎉🎉

👑 *${result.multiplier}x MULTIPLIER!*
💰 Bet: ${fmt(bet)} DCC
💎 Won: *+${fmt(result.payout)} DCC*
🏦 Balance: *${fmt(newBalance)} DCC*

_You hit the JACKPOT! The Crown Triple!_`;
  } else if (result.isWin && result.multiplier >= 10) {
    resultText = `
🎰 *BIG WIN!* 🎰

  ┌───┬───┬───┐
  │ ${result.reels[0]} │ ${result.reels[1]} │ ${result.reels[2]} │
  └───┴───┴───┘

🔥 *${result.multiplier}x MULTIPLIER!*
💰 Bet: ${fmt(bet)} DCC
💎 Won: *+${fmt(result.payout)} DCC*
🏦 Balance: *${fmt(newBalance)} DCC*`;
  } else if (result.isWin) {
    resultText = `
🎰 *Winner!* 🎰

  ┌───┬───┬───┐
  │ ${result.reels[0]} │ ${result.reels[1]} │ ${result.reels[2]} │
  └───┴───┴───┘

✅ *${result.multiplier}x*
💰 Bet: ${fmt(bet)} DCC
💵 Won: *+${fmt(result.payout)} DCC*
🏦 Balance: *${fmt(newBalance)} DCC*`;
  } else {
    resultText = `
🎰 *No luck this time...* 🎰

  ┌───┬───┬───┐
  │ ${result.reels[0]} │ ${result.reels[1]} │ ${result.reels[2]} │
  └───┴───┴───┘

❌ No match
💰 Lost: *-${fmt(bet)} DCC*
🏦 Balance: *${fmt(newBalance)} DCC*

_Better luck next spin!_`;
  }

  const kb = new InlineKeyboard()
    .text('🔄 Spin Again', 'game_slots')
    .text(`🔥 ${bet} DCC`, `slots_bet_${bet}`).row()
    .text('💣 Mines', 'game_mines')
    .text('🚀 Crash', 'game_crash').row()
    .text('◀️ Games Menu', 'games_menu');

  await ctx.api.editMessageText(
    spinMsg.chat.id,
    spinMsg.message_id,
    resultText,
    { parse_mode: 'Markdown', reply_markup: kb },
  ).catch(() => ctx.reply(resultText, { parse_mode: 'Markdown', reply_markup: kb }));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GAME 2: MINES 💣
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function handleMines(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  // Check for an active game
  const active = await loadMinesState(ctx.dbUser.id);
  if (active && !active.gameOver) {
    return renderMinesGrid(ctx, active);
  }

  const balance = await getGameBalance(ctx.dbUser.id);

  const msg = `
💣 *MINES — Dodge & Collect*

┌─────────────────────────
│ 💰 Balance: *${fmt(balance)} DCC*
│ ──────────────────
│ 🟢 5×5 grid with hidden mines
│ 💎 Reveal safe tiles to multiply
│ 💰 Cash out anytime to lock profits
│ 💥 Hit a mine = lose your bet
│ ──────────────────
│ 💣×3  = Lower risk, slower gains
│ 💣×5  = Medium risk
│ 💣×7  = High risk, big rewards
│ 💣×10 = EXTREME! Massive multipliers
└─────────────────────────

💬 *Enter your bet* (${MIN_BET}–${Math.min(MAX_BET, Math.floor(balance))} DCC)
_Or use a quick bet:_`;

  const quickBets = [10, 25, 50, 100, 250].filter((b) => b <= balance);
  const kb = new InlineKeyboard();
  for (let i = 0; i < quickBets.length; i++) {
    kb.text(`${quickBets[i]} DCC`, `mines_bet_${quickBets[i]}`);
    if (i % 3 === 2) kb.row();
  }
  if (quickBets.length % 3 !== 0) kb.row();
  if (balance >= MIN_BET) {
    kb.text('🔥 ALL IN', 'mines_bet_max').row();
  }
  kb.text('◀️ Games Menu', 'games_menu');

  await setSession(ctx.dbUser.id, { step: 'game:mines_bet' });
  await editOrReply(ctx, msg, { parse_mode: 'Markdown', reply_markup: kb });
}

export async function handleMinesBetButton(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.callbackQuery?.data) return;
  await ctx.answerCallbackQuery();

  const data = ctx.callbackQuery.data;
  const balance = await getGameBalance(ctx.dbUser.id);
  let bet: number;

  if (data === 'mines_bet_max') {
    bet = Math.min(MAX_BET, Math.floor(balance));
  } else {
    bet = parseInt(data.replace('mines_bet_', ''), 10);
  }

  if (isNaN(bet) || bet < MIN_BET || bet > balance) {
    await ctx.reply(`❌ Invalid bet. You have *${fmt(balance)} DCC* available.`, { parse_mode: 'Markdown' });
    return;
  }

  await setSession(ctx.dbUser.id, { step: 'game:mines_difficulty', gameBet: String(bet) });
  await showMinesDifficultyPicker(ctx, bet);
}

export async function handleMinesAmount(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.message?.text) return;

  const text = ctx.message.text.trim().toLowerCase();
  const balance = await getGameBalance(ctx.dbUser.id);
  let bet: number;

  if (text === 'max') {
    bet = Math.min(MAX_BET, Math.floor(balance));
  } else {
    bet = parseFloat(text);
  }

  if (isNaN(bet) || bet < MIN_BET) {
    await ctx.reply(`❌ Minimum bet is *${MIN_BET} DCC*.`, { parse_mode: 'Markdown' });
    return;
  }
  if (bet > balance) {
    await ctx.reply(`❌ Insufficient balance. You have *${fmt(balance)} DCC*.`, { parse_mode: 'Markdown' });
    return;
  }
  if (bet > MAX_BET) {
    await ctx.reply(`❌ Maximum bet is *${MAX_BET} DCC*.`, { parse_mode: 'Markdown' });
    return;
  }

  bet = Math.floor(bet * 100) / 100;
  await setSession(ctx.dbUser.id, { step: 'game:mines_difficulty', gameBet: String(bet) });
  await showMinesDifficultyPicker(ctx, bet);
}

async function showMinesDifficultyPicker(ctx: BotContext, bet: number): Promise<void> {
  const msg = `
💣 *Select Difficulty*

💰 Your bet: *${fmt(bet)} DCC*

┌─────────────────────────
│ 💣×3  — Safe  │ ~1.4x per tile
│ 💣×5  — Medium │ ~1.6x per tile
│ 💣×7  — Risky  │ ~2.0x per tile
│ 💣×10 — INSANE │ ~3.0x per tile
└─────────────────────────

_More mines = higher risk, faster multiplier growth_`;

  const kb = new InlineKeyboard()
    .text('💣×3 Safe', 'mines_start_3')
    .text('💣×5 Medium', 'mines_start_5').row()
    .text('💣×7 Risky', 'mines_start_7')
    .text('💣×10 INSANE', 'mines_start_10').row()
    .text('◀️ Back', 'game_mines');

  await editOrReply(ctx, msg, { parse_mode: 'Markdown', reply_markup: kb });
}

export async function handleMinesStart(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.callbackQuery?.data) return;
  await ctx.answerCallbackQuery();

  const mineCount = parseInt(ctx.callbackQuery.data.replace('mines_start_', ''), 10) as MineCount;
  if (!MINE_COUNTS.includes(mineCount)) return;

  const session = await getSession(ctx.dbUser.id);
  const bet = parseFloat(session.gameBet ?? '0');
  const balance = await getGameBalance(ctx.dbUser.id);

  if (bet < MIN_BET || bet > balance) {
    await ctx.reply('❌ Invalid bet or insufficient balance.', { parse_mode: 'Markdown' });
    return;
  }

  const state = createMinesGame(bet, mineCount);
  await saveMinesState(ctx.dbUser.id, state);
  await clearSession(ctx.dbUser.id);
  await renderMinesGrid(ctx, state);
}

async function renderMinesGrid(ctx: BotContext, state: MinesState): Promise<void> {
  const potential = Math.floor(state.bet * state.currentMultiplier * 100) / 100;

  let header: string;
  if (state.gameOver && state.hitMine) {
    header = `💥 *BOOM! You hit a mine!*\n\n💰 Bet: *${fmt(state.bet)} DCC* — LOST\n💣 Mines: ${state.mineCount} | 💎 Found: ${state.revealedSafe}`;
  } else if (state.gameOver && state.cashedOut) {
    header = `💰 *Cashed out at ${state.currentMultiplier}x!*\n\n💎 Won: *+${fmt(potential)} DCC*\n💣 Mines: ${state.mineCount} | 💎 Found: ${state.revealedSafe}`;
  } else {
    header = `💣 *MINES* — ${state.mineCount} mines hidden\n\n💰 Bet: *${fmt(state.bet)} DCC*\n📈 Multiplier: *${state.currentMultiplier}x* → *${fmt(potential)} DCC*\n💎 Safe tiles found: *${state.revealedSafe}*`;
  }

  const kb = new InlineKeyboard();

  // Build 5x5 grid
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const idx = row * 5 + col;
      if (state.revealed[idx]) {
        if (state.grid[idx]) {
          kb.text('💥', 'noop');
        } else {
          kb.text('💎', 'noop');
        }
      } else if (state.gameOver) {
        // Reveal all mines at end
        if (state.grid[idx]) {
          kb.text('💣', 'noop');
        } else {
          kb.text('⬜', 'noop');
        }
      } else {
        kb.text('⬛', `mines_tile_${idx}`);
      }
    }
    kb.row();
  }

  // Action buttons
  if (!state.gameOver && state.revealedSafe > 0) {
    kb.text(`💰 Cash Out (${state.currentMultiplier}x = ${fmt(potential)} DCC)`, 'mines_cashout').row();
  }

  if (state.gameOver) {
    kb.text('🔄 Play Again', 'game_mines')
      .text('◀️ Games', 'games_menu');
  } else {
    kb.text('◀️ Forfeit', 'mines_forfeit');
  }

  await editOrReply(ctx, header, { parse_mode: 'Markdown', reply_markup: kb });
}

export async function handleMinesTile(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.callbackQuery?.data) return;

  const position = parseInt(ctx.callbackQuery.data.replace('mines_tile_', ''), 10);
  if (isNaN(position) || position < 0 || position >= MINES_GRID_SIZE) {
    await ctx.answerCallbackQuery('Invalid tile');
    return;
  }

  const state = await loadMinesState(ctx.dbUser.id);
  if (!state || state.gameOver) {
    await ctx.answerCallbackQuery('No active game');
    return;
  }

  const result = revealMinesTile(state, position);
  await saveMinesState(ctx.dbUser.id, state);

  if (result.isMine) {
    await loseMines(ctx.dbUser.id, state);
    await clearMinesState(ctx.dbUser.id);
    await ctx.answerCallbackQuery('💥 BOOM! Mine!');
  } else if (state.gameOver) {
    // All safe tiles found
    await cashOutMines(ctx.dbUser.id, state);
    await clearMinesState(ctx.dbUser.id);
    await ctx.answerCallbackQuery('🎉 All safe tiles found!');
  } else {
    await ctx.answerCallbackQuery(`💎 Safe! ${result.newMultiplier}x`);
  }

  await renderMinesGrid(ctx, state);
}

export async function handleMinesCashOut(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;

  const state = await loadMinesState(ctx.dbUser.id);
  if (!state || state.gameOver || state.revealedSafe === 0) {
    await ctx.answerCallbackQuery('No active game to cash out');
    return;
  }

  const payout = await cashOutMines(ctx.dbUser.id, state);
  await clearMinesState(ctx.dbUser.id);
  await ctx.answerCallbackQuery(`💰 Cashed out ${fmt(payout)} DCC!`);
  await renderMinesGrid(ctx, state);
}

export async function handleMinesForfeit(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;

  const state = await loadMinesState(ctx.dbUser.id);
  if (!state || state.gameOver) {
    await ctx.answerCallbackQuery();
    return handleGamesMenu(ctx);
  }

  // If no tiles revealed, just cancel without loss
  if (state.revealedSafe === 0) {
    await clearMinesState(ctx.dbUser.id);
    await ctx.answerCallbackQuery('Game cancelled');
    return handleGamesMenu(ctx);
  }

  // Otherwise, forfeit = lose the bet
  await loseMines(ctx.dbUser.id, state);
  state.gameOver = true;
  state.hitMine = true;
  await clearMinesState(ctx.dbUser.id);
  await ctx.answerCallbackQuery('💸 Forfeited bet');
  await renderMinesGrid(ctx, state);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GAME 3: CRASH 🚀
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function handleCrash(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const balance = await getGameBalance(ctx.dbUser.id);

  const msg = `
🚀 *CRASH — Ride the Rocket*

┌─────────────────────────
│ 💰 Balance: *${fmt(balance)} DCC*
│ ──────────────────
│ 🚀 Multiplier starts at 1.00x
│ 📈 It climbs higher and higher...
│ 💥 But it WILL crash eventually!
│ 💰 Cash out before it crashes
│ ──────────────────
│ 🎯 Median crash: ~1.8x
│ 🔥 Can reach 100x+ (rare!)
│ ⚡ Instant crash: ~4% chance
└─────────────────────────

💬 *Enter your bet* (${MIN_BET}–${Math.min(MAX_BET, Math.floor(balance))} DCC)`;

  const quickBets = [10, 25, 50, 100, 250, 500].filter((b) => b <= balance);
  const kb = new InlineKeyboard();
  for (let i = 0; i < quickBets.length; i++) {
    kb.text(`${quickBets[i]} DCC`, `crash_bet_${quickBets[i]}`);
    if (i % 3 === 2) kb.row();
  }
  if (quickBets.length % 3 !== 0) kb.row();
  if (balance >= MIN_BET) {
    kb.text('🔥 ALL IN', 'crash_bet_max').row();
  }
  kb.text('◀️ Games Menu', 'games_menu');

  await setSession(ctx.dbUser.id, { step: 'game:crash_bet' });
  await editOrReply(ctx, msg, { parse_mode: 'Markdown', reply_markup: kb });
}

export async function handleCrashBetButton(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.callbackQuery?.data) return;
  await ctx.answerCallbackQuery();

  const data = ctx.callbackQuery.data;
  const balance = await getGameBalance(ctx.dbUser.id);
  let bet: number;

  if (data === 'crash_bet_max') {
    bet = Math.min(MAX_BET, Math.floor(balance));
  } else {
    bet = parseInt(data.replace('crash_bet_', ''), 10);
  }

  if (isNaN(bet) || bet < MIN_BET || bet > balance) {
    await ctx.reply(`❌ Invalid bet. You have *${fmt(balance)} DCC* available.`, { parse_mode: 'Markdown' });
    return;
  }

  await clearSession(ctx.dbUser.id);
  await executeCrashGame(ctx, bet);
}

export async function handleCrashAmount(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.message?.text) return;

  const text = ctx.message.text.trim().toLowerCase();
  const balance = await getGameBalance(ctx.dbUser.id);
  let bet: number;

  if (text === 'max') {
    bet = Math.min(MAX_BET, Math.floor(balance));
  } else {
    bet = parseFloat(text);
  }

  if (isNaN(bet) || bet < MIN_BET) {
    await ctx.reply(`❌ Minimum bet is *${MIN_BET} DCC*.`, { parse_mode: 'Markdown' });
    return;
  }
  if (bet > balance) {
    await ctx.reply(`❌ Insufficient balance. You have *${fmt(balance)} DCC*.`, { parse_mode: 'Markdown' });
    return;
  }
  if (bet > MAX_BET) {
    await ctx.reply(`❌ Maximum bet is *${MAX_BET} DCC*.`, { parse_mode: 'Markdown' });
    return;
  }

  await clearSession(ctx.dbUser.id);
  await executeCrashGame(ctx, Math.floor(bet * 100) / 100);
}

async function executeCrashGame(ctx: BotContext, bet: number): Promise<void> {
  if (!ctx.dbUser) return;

  const state = createCrashGame(bet);
  await saveCrashState(ctx.dbUser.id, state);

  // Build the rocket chart
  const rocketChart = buildRocketChart(state.currentMultiplier, false);

  const msg = `🚀 *CRASH — Launching...*\n\n` +
    `${rocketChart}\n\n` +
    `💰 Bet: *${fmt(bet)} DCC*\n` +
    `📈 Multiplier: *${state.currentMultiplier.toFixed(2)}x*\n` +
    `💵 Payout: *${fmt(bet * state.currentMultiplier)} DCC*`;

  const kb = new InlineKeyboard()
    .text(`💰 CASH OUT (${state.currentMultiplier.toFixed(2)}x)`, 'crash_cashout').row()
    .text('⏩ Next Tick', 'crash_next');

  const sentMsg = await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: kb });

  // Auto-advance with animation
  await animateCrash(ctx, state, sentMsg.chat.id, sentMsg.message_id);
}

function buildRocketChart(multiplier: number, crashed: boolean): string {
  const height = Math.min(8, Math.floor(multiplier));
  const lines: string[] = [];

  if (crashed) {
    lines.push('     💥');
    lines.push('    ╱╲');
    lines.push('   ╱  ╲');
    lines.push('  💔 CRASHED 💔');
  } else {
    lines.push(`     🚀 ${multiplier.toFixed(2)}x`);
    for (let i = 0; i < Math.min(height, 6); i++) {
      const padding = '     '.slice(0, Math.max(0, 4 - i));
      lines.push(`${padding}${'╱'.padEnd(i + 1, ' ')}`);
    }
  }

  // Add a progress bar
  const barLength = 20;
  const filled = Math.min(barLength, Math.floor(multiplier * 2));
  const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

  lines.push('');
  lines.push(`[${bar}]`);

  return lines.join('\n');
}

async function animateCrash(
  ctx: BotContext,
  state: CrashState,
  chatId: number,
  messageId: number,
): Promise<void> {
  if (!ctx.dbUser) return;

  // Auto-advance a few ticks with animation
  for (let tick = 0; tick < 3; tick++) {
    await sleep(1200);

    // Re-check if player cashed out
    const current = await loadCrashState(ctx.dbUser.id);
    if (!current || current.gameOver) return;

    const continues = advanceCrash(current);
    await saveCrashState(ctx.dbUser.id, current);

    if (!continues) {
      // Crashed!
      await loseCrash(ctx.dbUser.id, current);
      await clearCrashState(ctx.dbUser.id);

      const newBalance = await getGameBalance(ctx.dbUser.id);
      const chart = buildRocketChart(current.crashPoint, true);

      const crashMsg = `🚀 *CRASHED at ${current.crashPoint.toFixed(2)}x!*\n\n` +
        `${chart}\n\n` +
        `💥 *The rocket exploded!*\n` +
        `💰 Bet: ${fmt(current.bet)} DCC — *LOST*\n` +
        `🏦 Balance: *${fmt(newBalance)} DCC*`;

      const kb = new InlineKeyboard()
        .text('🔄 Play Again', 'game_crash')
        .text('🎰 Slots', 'game_slots').row()
        .text('◀️ Games Menu', 'games_menu');

      await ctx.api.editMessageText(chatId, messageId, crashMsg, {
        parse_mode: 'Markdown',
        reply_markup: kb,
      }).catch(() => {});
      return;
    }

    // Update display
    const potential = Math.floor(current.bet * current.currentMultiplier * 100) / 100;
    const chart = buildRocketChart(current.currentMultiplier, false);

    const mulEmoji = current.currentMultiplier >= 5 ? '🔥' : current.currentMultiplier >= 3 ? '⚡' : '📈';

    const updatedMsg = `🚀 *CRASH — Flying!*\n\n` +
      `${chart}\n\n` +
      `💰 Bet: *${fmt(current.bet)} DCC*\n` +
      `${mulEmoji} Multiplier: *${current.currentMultiplier.toFixed(2)}x*\n` +
      `💵 Payout: *${fmt(potential)} DCC*\n` +
      `\n⚠️ _Cash out NOW or risk losing it all!_`;

    const kb = new InlineKeyboard()
      .text(`💰 CASH OUT (${current.currentMultiplier.toFixed(2)}x = ${fmt(potential)} DCC)`, 'crash_cashout').row()
      .text('⏩ Next Tick', 'crash_next');

    await ctx.api.editMessageText(chatId, messageId, updatedMsg, {
      parse_mode: 'Markdown',
      reply_markup: kb,
    }).catch(() => {});
  }

  // After 3 auto-ticks, wait for user input
  const current = await loadCrashState(ctx.dbUser.id);
  if (!current || current.gameOver) return;

  const potential = Math.floor(current.bet * current.currentMultiplier * 100) / 100;
  const chart = buildRocketChart(current.currentMultiplier, false);
  const mulEmoji = current.currentMultiplier >= 5 ? '🔥' : current.currentMultiplier >= 3 ? '⚡' : '📈';

  const waitMsg = `🚀 *CRASH — In Flight!*\n\n` +
    `${chart}\n\n` +
    `💰 Bet: *${fmt(current.bet)} DCC*\n` +
    `${mulEmoji} Multiplier: *${current.currentMultiplier.toFixed(2)}x*\n` +
    `💵 Payout: *${fmt(potential)} DCC*\n` +
    `\n🎯 _Tap "Next Tick" to keep going or "Cash Out" to win!_`;

  const kb = new InlineKeyboard()
    .text(`💰 CASH OUT (${fmt(potential)} DCC)`, 'crash_cashout').row()
    .text('⏩ Next Tick', 'crash_next');

  await ctx.api.editMessageText(chatId, messageId, waitMsg, {
    parse_mode: 'Markdown',
    reply_markup: kb,
  }).catch(() => {});
}

export async function handleCrashNext(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;

  const state = await loadCrashState(ctx.dbUser.id);
  if (!state || state.gameOver) {
    await ctx.answerCallbackQuery('No active game');
    return;
  }

  const continues = advanceCrash(state);
  await saveCrashState(ctx.dbUser.id, state);

  if (!continues) {
    // Crashed!
    await loseCrash(ctx.dbUser.id, state);
    await clearCrashState(ctx.dbUser.id);
    await ctx.answerCallbackQuery('💥 CRASHED!');

    const newBalance = await getGameBalance(ctx.dbUser.id);
    const chart = buildRocketChart(state.crashPoint, true);

    const crashMsg = `🚀 *CRASHED at ${state.crashPoint.toFixed(2)}x!*\n\n` +
      `${chart}\n\n` +
      `💥 *The rocket exploded!*\n` +
      `💰 Bet: ${fmt(state.bet)} DCC — *LOST*\n` +
      `🏦 Balance: *${fmt(newBalance)} DCC*`;

    const kb = new InlineKeyboard()
      .text('🔄 Play Again', 'game_crash')
      .text('🎰 Slots', 'game_slots').row()
      .text('◀️ Games Menu', 'games_menu');

    await editOrReply(ctx, crashMsg, { parse_mode: 'Markdown', reply_markup: kb });
    return;
  }

  const potential = Math.floor(state.bet * state.currentMultiplier * 100) / 100;
  const chart = buildRocketChart(state.currentMultiplier, false);
  const mulEmoji = state.currentMultiplier >= 5 ? '🔥' : state.currentMultiplier >= 3 ? '⚡' : '📈';

  await ctx.answerCallbackQuery(`${mulEmoji} ${state.currentMultiplier.toFixed(2)}x`);

  const msg = `🚀 *CRASH — In Flight!*\n\n` +
    `${chart}\n\n` +
    `💰 Bet: *${fmt(state.bet)} DCC*\n` +
    `${mulEmoji} Multiplier: *${state.currentMultiplier.toFixed(2)}x*\n` +
    `💵 Payout: *${fmt(potential)} DCC*\n` +
    `\n⚠️ _Cash out or keep pushing your luck!_`;

  const kb = new InlineKeyboard()
    .text(`💰 CASH OUT (${fmt(potential)} DCC)`, 'crash_cashout').row()
    .text('⏩ Next Tick', 'crash_next');

  await editOrReply(ctx, msg, { parse_mode: 'Markdown', reply_markup: kb });
}

export async function handleCrashCashOut(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;

  const state = await loadCrashState(ctx.dbUser.id);
  if (!state || state.gameOver) {
    await ctx.answerCallbackQuery('No active game');
    return;
  }

  const payout = await cashOutCrash(ctx.dbUser.id, state);
  await clearCrashState(ctx.dbUser.id);

  const newBalance = await getGameBalance(ctx.dbUser.id);
  const profit = payout - state.bet;
  const chart = buildRocketChart(state.currentMultiplier, false);

  await ctx.answerCallbackQuery(`💰 +${fmt(payout)} DCC!`);

  const msg = `🚀 *CASHED OUT at ${state.currentMultiplier.toFixed(2)}x!*\n\n` +
    `${chart}\n\n` +
    `✅ *Smart move!*\n` +
    `💰 Bet: ${fmt(state.bet)} DCC\n` +
    `📈 Multiplier: *${state.currentMultiplier.toFixed(2)}x*\n` +
    `💎 Won: *+${fmt(payout)} DCC* (profit: +${fmt(profit)} DCC)\n` +
    `🏦 Balance: *${fmt(newBalance)} DCC*\n` +
    `\n_The rocket ${state.crashed ? `crashed at ${state.crashPoint.toFixed(2)}x` : 'is still flying'}..._`;

  const kb = new InlineKeyboard()
    .text('🔄 Play Again', 'game_crash')
    .text('🎰 Slots', 'game_slots').row()
    .text('💣 Mines', 'game_mines')
    .text('◀️ Games', 'games_menu');

  await editOrReply(ctx, msg, { parse_mode: 'Markdown', reply_markup: kb });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GAME 4: LUCKY WHEEL 🎡
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function handleWheel(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const balance = await getGameBalance(ctx.dbUser.id);

  const oddsDisplay = [
    '│ 👑 50x JACKPOT — Ultra Rare!',
    '│ 💎 25x — Very Rare',
    '│ 🔥 10x — Rare',
    '│ 🤩 5x  — Uncommon',
    '│ 😃 3x  — Lucky',
    '│ 😊 2x  — Nice',
    '│ 🙂 1.5x — Small Win',
    '│ 😐 1x  — Push (break even)',
    '│ 😬 0.5x — Half Back',
    '│ 💀 BUST — Lose It All!',
  ].join('\n');

  const msg = `🎡 *LUCKY WHEEL*\n\n` +
    `┌─────────────────────────\n` +
    `│ 💰 Balance: *${fmt(balance)} DCC*\n` +
    `│ ──────────────────\n` +
    `${oddsDisplay}\n` +
    `└─────────────────────────\n\n` +
    `🎯 *Spin the wheel and test your fate!*\n` +
    `💬 Enter your bet (${MIN_BET}–${Math.min(MAX_BET, Math.floor(balance))} DCC)`;

  const quickBets = [10, 25, 50, 100, 250, 500].filter((b) => b <= balance);
  const kb = new InlineKeyboard();
  for (let i = 0; i < quickBets.length; i++) {
    kb.text(`${quickBets[i]} DCC`, `wheel_bet_${quickBets[i]}`);
    if (i % 3 === 2) kb.row();
  }
  if (quickBets.length % 3 !== 0) kb.row();
  if (balance >= MIN_BET) {
    kb.text('🔥 ALL IN', 'wheel_bet_max').row();
  }
  kb.text('◀️ Games Menu', 'games_menu');

  await setSession(ctx.dbUser.id, { step: 'game:wheel_bet' });
  await editOrReply(ctx, msg, { parse_mode: 'Markdown', reply_markup: kb });
}

export async function handleWheelBetButton(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.callbackQuery?.data) return;
  await ctx.answerCallbackQuery();

  const data = ctx.callbackQuery.data;
  const balance = await getGameBalance(ctx.dbUser.id);
  let bet: number;

  if (data === 'wheel_bet_max') {
    bet = Math.min(MAX_BET, Math.floor(balance));
  } else {
    bet = parseInt(data.replace('wheel_bet_', ''), 10);
  }

  if (isNaN(bet) || bet < MIN_BET || bet > balance) {
    await ctx.reply(`❌ Invalid bet. You have *${fmt(balance)} DCC* available.`, { parse_mode: 'Markdown' });
    return;
  }

  await clearSession(ctx.dbUser.id);
  await executeWheelSpin(ctx, bet);
}

export async function handleWheelAmount(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.message?.text) return;

  const text = ctx.message.text.trim().toLowerCase();
  const balance = await getGameBalance(ctx.dbUser.id);
  let bet: number;

  if (text === 'max') {
    bet = Math.min(MAX_BET, Math.floor(balance));
  } else {
    bet = parseFloat(text);
  }

  if (isNaN(bet) || bet < MIN_BET) {
    await ctx.reply(`❌ Minimum bet is *${MIN_BET} DCC*.`, { parse_mode: 'Markdown' });
    return;
  }
  if (bet > balance) {
    await ctx.reply(`❌ Insufficient balance. You have *${fmt(balance)} DCC*.`, { parse_mode: 'Markdown' });
    return;
  }
  if (bet > MAX_BET) {
    await ctx.reply(`❌ Maximum bet is *${MAX_BET} DCC*.`, { parse_mode: 'Markdown' });
    return;
  }

  await clearSession(ctx.dbUser.id);
  await executeWheelSpin(ctx, Math.floor(bet * 100) / 100);
}

async function executeWheelSpin(ctx: BotContext, bet: number): Promise<void> {
  if (!ctx.dbUser) return;

  const result = await spinWheel(ctx.dbUser.id, bet);
  const frames = generateWheelFrames(result.segmentIndex);

  // Send initial spinning message
  const wheelVis = renderWheelVisual(frames[0], true);
  const spinMsg = await ctx.reply(
    `🎡 *SPINNING THE WHEEL!*\n\n${wheelVis}\n\n💰 Bet: *${fmt(bet)} DCC*\n\n🔄 _The wheel is spinning..._`,
    { parse_mode: 'Markdown' },
  );

  // Animate through frames
  const showFrames = [
    frames[Math.floor(frames.length * 0.2)],
    frames[Math.floor(frames.length * 0.4)],
    frames[Math.floor(frames.length * 0.6)],
    frames[Math.floor(frames.length * 0.8)],
    frames[frames.length - 3],
    frames[frames.length - 2],
  ];

  for (let i = 0; i < showFrames.length; i++) {
    const delay = 400 + i * 200;
    await sleep(delay);

    const vis = renderWheelVisual(showFrames[i], true);
    const speed = i < 2 ? '💨 FAST!' : i < 4 ? '🔄 Slowing...' : '⏳ Almost there...';

    await ctx.api.editMessageText(
      spinMsg.chat.id,
      spinMsg.message_id,
      `🎡 *SPINNING THE WHEEL!*\n\n${vis}\n\n💰 Bet: *${fmt(bet)} DCC*\n\n${speed}`,
      { parse_mode: 'Markdown' },
    ).catch(() => {});
  }

  // Final result
  await sleep(1000);
  const finalVis = renderWheelVisual(result.segmentIndex, false);
  const newBalance = await getGameBalance(ctx.dbUser.id);

  let resultText: string;

  if (result.isJackpot) {
    resultText = `🎡 *━━ 👑 JACKPOT!!! 👑 ━━* 🎡\n\n` +
      `${finalVis}\n\n` +
      `🎉🎉🎉 *INCREDIBLE!* 🎉🎉🎉\n\n` +
      `👑 *${result.multiplier}x MULTIPLIER!*\n` +
      `💰 Bet: ${fmt(bet)} DCC\n` +
      `💎 Won: *+${fmt(result.payout)} DCC*\n` +
      `🏦 Balance: *${fmt(newBalance)} DCC*\n\n` +
      `_The legendary 50x hit! You're on fire!_`;
  } else if (result.isBust) {
    resultText = `🎡 *BUST!* 💀\n\n` +
      `${finalVis}\n\n` +
      `💀 *The wheel landed on BUST!*\n\n` +
      `💰 Lost: *-${fmt(bet)} DCC*\n` +
      `🏦 Balance: *${fmt(newBalance)} DCC*\n\n` +
      `_Ouch! The wheel giveth and the wheel taketh away._`;
  } else if (result.multiplier >= 10) {
    resultText = `🎡 *HUGE WIN!* 🔥\n\n` +
      `${finalVis}\n\n` +
      `🔥 *${result.multiplier}x MULTIPLIER!*\n\n` +
      `💰 Bet: ${fmt(bet)} DCC\n` +
      `💎 Won: *+${fmt(result.payout)} DCC*\n` +
      `🏦 Balance: *${fmt(newBalance)} DCC*`;
  } else if (result.multiplier > 1) {
    const profit = result.payout - bet;
    resultText = `🎡 *Winner!* ${result.segment.emoji}\n\n` +
      `${finalVis}\n\n` +
      `✅ *${result.multiplier}x*\n\n` +
      `💰 Bet: ${fmt(bet)} DCC\n` +
      `💵 Won: *+${fmt(result.payout)} DCC* (+${fmt(profit)} profit)\n` +
      `🏦 Balance: *${fmt(newBalance)} DCC*`;
  } else if (result.multiplier === 1) {
    resultText = `🎡 *Push!* 😐\n\n` +
      `${finalVis}\n\n` +
      `↩️ *1x — Break even!*\n\n` +
      `💰 Bet returned: ${fmt(bet)} DCC\n` +
      `🏦 Balance: *${fmt(newBalance)} DCC*\n\n` +
      `_Close call! Spin again?_`;
  } else {
    resultText = `🎡 *Partial Loss* 😬\n\n` +
      `${finalVis}\n\n` +
      `📉 *${result.multiplier}x — Half back*\n\n` +
      `💰 Bet: ${fmt(bet)} DCC\n` +
      `💵 Returned: *${fmt(result.payout)} DCC*\n` +
      `📉 Lost: *-${fmt(bet - result.payout)} DCC*\n` +
      `🏦 Balance: *${fmt(newBalance)} DCC*`;
  }

  const kb = new InlineKeyboard()
    .text('🔄 Spin Again', 'game_wheel')
    .text(`🎡 ${bet} DCC`, `wheel_bet_${bet}`).row()
    .text('🎰 Slots', 'game_slots')
    .text('🃏 Hi-Lo', 'game_hilo').row()
    .text('◀️ Games Menu', 'games_menu');

  await ctx.api.editMessageText(
    spinMsg.chat.id,
    spinMsg.message_id,
    resultText,
    { parse_mode: 'Markdown', reply_markup: kb },
  ).catch(() => ctx.reply(resultText, { parse_mode: 'Markdown', reply_markup: kb }));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GAME 5: HI-LO 🃏
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function handleHiLo(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  // Check for active game
  const active = await loadHiLoState(ctx.dbUser.id);
  if (active && !active.gameOver) {
    return renderHiLoGame(ctx, active);
  }

  const balance = await getGameBalance(ctx.dbUser.id);

  const msg = `🃏 *HI-LO — Card Streak*\n\n` +
    `┌─────────────────────────\n` +
    `│ 💰 Balance: *${fmt(balance)} DCC*\n` +
    `│ ──────────────────\n` +
    `│ 🎯 A card is drawn face-up\n` +
    `│ ⬆️ Guess if the next card is\n` +
    `│    HIGHER or LOWER\n` +
    `│ ✅ Correct = multiplier grows!\n` +
    `│ 💰 Cash out your winnings anytime\n` +
    `│ ❌ Wrong = lose your bet\n` +
    `│ ──────────────────\n` +
    `│ 🔥 Streak multipliers compound!\n` +
    `│ 🃏 Ace=1, J=11, Q=12, K=13\n` +
    `│ 🤝 Tie = push (safe!)\n` +
    `│ 🏆 Max multiplier: *500x*\n` +
    `└─────────────────────────\n\n` +
    `💬 Enter your bet (${MIN_BET}–${Math.min(MAX_BET, Math.floor(balance))} DCC)`;

  const quickBets = [10, 25, 50, 100, 250].filter((b) => b <= balance);
  const kb = new InlineKeyboard();
  for (let i = 0; i < quickBets.length; i++) {
    kb.text(`${quickBets[i]} DCC`, `hilo_bet_${quickBets[i]}`);
    if (i % 3 === 2) kb.row();
  }
  if (quickBets.length % 3 !== 0) kb.row();
  if (balance >= MIN_BET) {
    kb.text('🔥 ALL IN', 'hilo_bet_max').row();
  }
  kb.text('◀️ Games Menu', 'games_menu');

  await setSession(ctx.dbUser.id, { step: 'game:hilo_bet' });
  await editOrReply(ctx, msg, { parse_mode: 'Markdown', reply_markup: kb });
}

export async function handleHiLoBetButton(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.callbackQuery?.data) return;
  await ctx.answerCallbackQuery();

  const data = ctx.callbackQuery.data;
  const balance = await getGameBalance(ctx.dbUser.id);
  let bet: number;

  if (data === 'hilo_bet_max') {
    bet = Math.min(MAX_BET, Math.floor(balance));
  } else {
    bet = parseInt(data.replace('hilo_bet_', ''), 10);
  }

  if (isNaN(bet) || bet < MIN_BET || bet > balance) {
    await ctx.reply(`❌ Invalid bet. You have *${fmt(balance)} DCC* available.`, { parse_mode: 'Markdown' });
    return;
  }

  await clearSession(ctx.dbUser.id);
  await startHiLoGame(ctx, bet);
}

export async function handleHiLoAmount(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.message?.text) return;

  const text = ctx.message.text.trim().toLowerCase();
  const balance = await getGameBalance(ctx.dbUser.id);
  let bet: number;

  if (text === 'max') {
    bet = Math.min(MAX_BET, Math.floor(balance));
  } else {
    bet = parseFloat(text);
  }

  if (isNaN(bet) || bet < MIN_BET) {
    await ctx.reply(`❌ Minimum bet is *${MIN_BET} DCC*.`, { parse_mode: 'Markdown' });
    return;
  }
  if (bet > balance) {
    await ctx.reply(`❌ Insufficient balance. You have *${fmt(balance)} DCC*.`, { parse_mode: 'Markdown' });
    return;
  }
  if (bet > MAX_BET) {
    await ctx.reply(`❌ Maximum bet is *${MAX_BET} DCC*.`, { parse_mode: 'Markdown' });
    return;
  }

  await clearSession(ctx.dbUser.id);
  await startHiLoGame(ctx, Math.floor(bet * 100) / 100);
}

async function startHiLoGame(ctx: BotContext, bet: number): Promise<void> {
  if (!ctx.dbUser) return;

  const state = createHiLoGame(bet);
  await saveHiLoState(ctx.dbUser.id, state);

  // Show deal animation
  const dealMsg = await ctx.reply(
    `🃏 *HI-LO — Dealing...*\n\n` +
    `${renderCardBox({ value: 'A', suit: '♠️', numericValue: 1 }, true)}\n\n` +
    `💰 Bet: *${fmt(bet)} DCC*\n🔄 _Shuffling deck..._`,
    { parse_mode: 'Markdown' },
  );

  await sleep(800);

  // Reveal card
  const card = state.currentCard;
  const cardBox = renderCardBox(card);
  const emoji = cardEmoji(card);

  const msg = `🃏 *HI-LO — Your Card*\n\n` +
    `${cardBox}\n\n` +
    `${emoji} Current: *${cardDisplay(card)}* (value: ${card.numericValue})\n` +
    `💰 Bet: *${fmt(bet)} DCC*\n` +
    `📈 Multiplier: *1.00x*\n\n` +
    `⬆️ Will the next card be *HIGHER* or *LOWER*?`;

  const kb = new InlineKeyboard()
    .text('⬆️ HIGHER', 'hilo_higher')
    .text('⬇️ LOWER', 'hilo_lower').row()
    .text('◀️ Forfeit', 'hilo_forfeit');

  await ctx.api.editMessageText(
    dealMsg.chat.id,
    dealMsg.message_id,
    msg,
    { parse_mode: 'Markdown', reply_markup: kb },
  ).catch(() => ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: kb }));
}

async function renderHiLoGame(ctx: BotContext, state: HiLoState): Promise<void> {
  const card = state.currentCard;
  const cardBox = renderCardBox(card);
  const emoji = cardEmoji(card);
  const potential = Math.floor(state.bet * state.currentMultiplier * 100) / 100;
  const streakBar = renderStreakBar(state.history, card);

  const streakEmoji = state.streak >= 8 ? '🔥🔥🔥' : state.streak >= 5 ? '🔥🔥' : state.streak >= 3 ? '🔥' : state.streak >= 1 ? '✨' : '';

  const msg = `🃏 *HI-LO — Streak: ${state.streak}* ${streakEmoji}\n\n` +
    `${cardBox}\n\n` +
    (streakBar ? `📜 ${streakBar}\n\n` : '') +
    `${emoji} Current: *${cardDisplay(card)}* (value: ${card.numericValue})\n` +
    `💰 Bet: *${fmt(state.bet)} DCC*\n` +
    `📈 Multiplier: *${state.currentMultiplier}x*\n` +
    `💵 Payout: *${fmt(potential)} DCC*\n\n` +
    `⬆️ Will the next card be *HIGHER* or *LOWER*?`;

  const kb = new InlineKeyboard()
    .text('⬆️ HIGHER', 'hilo_higher')
    .text('⬇️ LOWER', 'hilo_lower').row();

  if (state.streak > 0) {
    kb.text(`💰 Cash Out (${fmt(potential)} DCC)`, 'hilo_cashout').row();
  }
  kb.text('◀️ Forfeit', 'hilo_forfeit');

  await editOrReply(ctx, msg, { parse_mode: 'Markdown', reply_markup: kb });
}

export async function handleHiLoGuess(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser || !ctx.callbackQuery?.data) return;

  const guess = ctx.callbackQuery.data === 'hilo_higher' ? 'higher' : 'lower';

  const state = await loadHiLoState(ctx.dbUser.id);
  if (!state || state.gameOver) {
    await ctx.answerCallbackQuery('No active game');
    return;
  }

  const result = guessHiLo(state, guess);
  await saveHiLoState(ctx.dbUser.id, state);

  if (!result.correct) {
    await loseHiLo(ctx.dbUser.id, state);
    await clearHiLoState(ctx.dbUser.id);
    await ctx.answerCallbackQuery('❌ Wrong!');

    const newBalance = await getGameBalance(ctx.dbUser.id);
    const streakBar = renderStreakBar(state.history, result.newCard);

    const guessWord = guess === 'higher' ? 'HIGHER' : 'LOWER';
    const actualWord = result.newCard.numericValue > result.oldCard.numericValue ? 'HIGHER' : result.newCard.numericValue < result.oldCard.numericValue ? 'LOWER' : 'EQUAL';

    const msg = `🃏 *GAME OVER!* ❌\n\n` +
      `You said: *${guessWord}*\n` +
      `${cardDisplay(result.oldCard)} → ${cardDisplay(result.newCard)} (was *${actualWord}*)\n\n` +
      (streakBar ? `📜 ${streakBar}\n\n` : '') +
      `🔥 Streak: *${state.streak}*\n` +
      `💰 Lost: *-${fmt(state.bet)} DCC*\n` +
      `🏦 Balance: *${fmt(newBalance)} DCC*\n\n` +
      `_So close! ${state.streak > 0 ? `You had a ${state.streak}-streak going!` : 'Better luck next time!'}_`;

    const kb = new InlineKeyboard()
      .text('🔄 Play Again', 'game_hilo')
      .text(`🃏 ${state.bet} DCC`, `hilo_bet_${state.bet}`).row()
      .text('🎡 Wheel', 'game_wheel')
      .text('🎰 Slots', 'game_slots').row()
      .text('◀️ Games Menu', 'games_menu');

    await editOrReply(ctx, msg, { parse_mode: 'Markdown', reply_markup: kb });
    return;
  }

  // Correct!
  const streakEmoji = state.streak >= 8 ? '🔥🔥🔥' : state.streak >= 5 ? '🔥🔥' : state.streak >= 3 ? '🔥' : '✨';

  await ctx.answerCallbackQuery(`✅ Correct! ${state.currentMultiplier}x ${streakEmoji}`);
  await renderHiLoGame(ctx, state);
}

export async function handleHiLoCashOut(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;

  const state = await loadHiLoState(ctx.dbUser.id);
  if (!state || state.gameOver || state.streak === 0) {
    await ctx.answerCallbackQuery('No active game');
    return;
  }

  const payout = await cashOutHiLo(ctx.dbUser.id, state);
  await clearHiLoState(ctx.dbUser.id);

  const newBalance = await getGameBalance(ctx.dbUser.id);
  const profit = payout - state.bet;
  const streakBar = renderStreakBar(state.history, state.currentCard);

  await ctx.answerCallbackQuery(`💰 +${fmt(payout)} DCC!`);

  const msg = `🃏 *CASHED OUT!* 💰\n\n` +
    (streakBar ? `📜 ${streakBar}\n\n` : '') +
    `✅ *Smart play!*\n\n` +
    `🔥 Streak: *${state.streak}* correct guesses\n` +
    `📈 Final Multiplier: *${state.currentMultiplier}x*\n` +
    `💰 Bet: ${fmt(state.bet)} DCC\n` +
    `💎 Won: *+${fmt(payout)} DCC* (profit: +${fmt(profit)} DCC)\n` +
    `🏦 Balance: *${fmt(newBalance)} DCC*\n\n` +
    `_${state.streak >= 5 ? 'Legendary streak!' : state.streak >= 3 ? 'Nice run!' : 'Good call!'}_`;

  const kb = new InlineKeyboard()
    .text('🔄 Play Again', 'game_hilo')
    .text(`🃏 ${state.bet} DCC`, `hilo_bet_${state.bet}`).row()
    .text('🎡 Wheel', 'game_wheel')
    .text('🎰 Slots', 'game_slots').row()
    .text('◀️ Games Menu', 'games_menu');

  await editOrReply(ctx, msg, { parse_mode: 'Markdown', reply_markup: kb });
}

export async function handleHiLoForfeit(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;

  const state = await loadHiLoState(ctx.dbUser.id);
  if (!state || state.gameOver) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery();
    return handleGamesMenu(ctx);
  }

  // If no guesses made, cancel without loss
  if (state.streak === 0) {
    await clearHiLoState(ctx.dbUser.id);
    if (ctx.callbackQuery) await ctx.answerCallbackQuery('Game cancelled');
    return handleGamesMenu(ctx);
  }

  // With a streak, forfeiting = lose bet
  await loseHiLo(ctx.dbUser.id, state);
  await clearHiLoState(ctx.dbUser.id);
  if (ctx.callbackQuery) await ctx.answerCallbackQuery('💸 Forfeited bet');

  const newBalance = await getGameBalance(ctx.dbUser.id);

  const msg = `🃏 *Forfeited* 💸\n\n` +
    `🔥 Streak was: *${state.streak}*\n` +
    `📈 Multiplier was: *${state.currentMultiplier}x*\n` +
    `💰 Lost: *-${fmt(state.bet)} DCC*\n` +
    `🏦 Balance: *${fmt(newBalance)} DCC*`;

  const kb = new InlineKeyboard()
    .text('🔄 Play Again', 'game_hilo')
    .text('◀️ Games Menu', 'games_menu');

  await editOrReply(ctx, msg, { parse_mode: 'Markdown', reply_markup: kb });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GAME 6: DAILY PRIZE 🎁
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function handleDailyPrize(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const { canClaim, nextClaimAt } = await canClaimDailyPrize(ctx.dbUser.id);
  const balance = await getGameBalance(ctx.dbUser.id);

  const prizeList = DAILY_PRIZE_SEGMENTS.map((s) => {
    const pct = (s.weight / 100).toFixed(2);
    return `│ ${s.emoji} *${s.amount.toLocaleString()} DCC* — ${pct}%`;
  }).join('\n');

  if (!canClaim && nextClaimAt) {
    const timeLeft = formatTimeUntil(nextClaimAt);

    const msg = `🎁 *DAILY PRIZE*\n\n` +
      `┌─────────────────────────\n` +
      `│ 💰 Balance: *${fmt(balance)} DCC*\n` +
      `│ ──────────────────\n` +
      `│ ⏰ *Already claimed today!*\n` +
      `│ ⏳ Next spin in: *${timeLeft}*\n` +
      `└─────────────────────────\n\n` +
      `Come back tomorrow for another free spin! 🎉\n\n` +
      `*Prize Table:*\n` +
      `┌─────────────────────────\n` +
      `${prizeList}\n` +
      `└─────────────────────────`;

    const kb = new InlineKeyboard()
      .text('🎰 Play Slots', 'game_slots')
      .text('🎡 Spin Wheel', 'game_wheel').row()
      .text('◀️ Games Menu', 'games_menu');

    await editOrReply(ctx, msg, { parse_mode: 'Markdown', reply_markup: kb });
    return;
  }

  const msg = `🎁 *DAILY PRIZE — Free Spin!*\n\n` +
    `┌─────────────────────────\n` +
    `│ 💰 Balance: *${fmt(balance)} DCC*\n` +
    `│ ──────────────────\n` +
    `│ 🎯 Spin the wheel for a\n` +
    `│    *FREE daily prize!*\n` +
    `│ 🎁 Win *3 — 10,000 DCC*\n` +
    `│ 💎 Jackpot: *10,000 DCC*\n` +
    `│ 🆓 No bet required!\n` +
    `└─────────────────────────\n\n` +
    `*Prize Table:*\n` +
    `┌─────────────────────────\n` +
    `${prizeList}\n` +
    `└─────────────────────────\n\n` +
    `🎰 Ready to spin? Tap the button below!`;

  const kb = new InlineKeyboard()
    .text('🎁 SPIN FOR FREE!', 'daily_spin').row()
    .text('◀️ Games Menu', 'games_menu');

  await editOrReply(ctx, msg, { parse_mode: 'Markdown', reply_markup: kb });
}

export async function handleDailySpin(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;

  // Double-check eligibility
  const { canClaim } = await canClaimDailyPrize(ctx.dbUser.id);
  if (!canClaim) {
    await ctx.answerCallbackQuery('⏰ Already claimed today!');
    return handleDailyPrize(ctx);
  }

  await ctx.answerCallbackQuery('🎁 Spinning...');

  const result = await spinDailyPrize(ctx.dbUser.id);
  const frames = generateDailyWheelFrames(result.segmentIndex);

  // Send initial spinning message
  const wheelVis = renderDailyWheelVisual(frames[0], true);
  const spinMsg = await ctx.reply(
    `🎁 *DAILY PRIZE — SPINNING!*\n\n${wheelVis}\n\n🔄 _The prize wheel is spinning..._`,
    { parse_mode: 'Markdown' },
  );

  // Animate through frames
  const showFrames = [
    frames[Math.floor(frames.length * 0.15)],
    frames[Math.floor(frames.length * 0.3)],
    frames[Math.floor(frames.length * 0.5)],
    frames[Math.floor(frames.length * 0.65)],
    frames[Math.floor(frames.length * 0.8)],
    frames[frames.length - 3],
    frames[frames.length - 2],
  ];

  for (let i = 0; i < showFrames.length; i++) {
    const delay = 300 + i * 180;
    await sleep(delay);

    const vis = renderDailyWheelVisual(showFrames[i], true);
    const speed = i < 2 ? '💨 WHOOSH!' : i < 4 ? '🔄 Slowing down...' : '⏳ Almost there...';

    await ctx.api.editMessageText(
      spinMsg.chat.id,
      spinMsg.message_id,
      `🎁 *DAILY PRIZE — SPINNING!*\n\n${vis}\n\n${speed}`,
      { parse_mode: 'Markdown' },
    ).catch(() => {});
  }

  // Final result
  await sleep(1200);
  const finalVis = renderDailyWheelVisual(result.segmentIndex, false);
  const newBalance = await getGameBalance(ctx.dbUser.id);

  let resultText: string;

  if (result.amount >= 5000) {
    resultText = `🎁 *━━ 💎 JACKPOT!!! 💎 ━━* 🎁\n\n` +
      `${finalVis}\n\n` +
      `🎉🎉🎉 *UNBELIEVABLE!* 🎉🎉🎉\n\n` +
      `💎 You won: *+${result.amount.toLocaleString()} DCC!!!*\n` +
      `🏦 Balance: *${fmt(newBalance)} DCC*\n\n` +
      `_You hit the daily jackpot! This is incredibly rare!_`;
  } else if (result.amount >= 500) {
    resultText = `🎁 *HUGE PRIZE!* ${result.segment.emoji}\n\n` +
      `${finalVis}\n\n` +
      `🔥 *Amazing luck!*\n\n` +
      `🎁 You won: *+${result.amount.toLocaleString()} DCC!*\n` +
      `🏦 Balance: *${fmt(newBalance)} DCC*\n\n` +
      `_What a daily spin! 🎉_`;
  } else if (result.amount >= 50) {
    resultText = `🎁 *Nice Prize!* ${result.segment.emoji}\n\n` +
      `${finalVis}\n\n` +
      `✅ *Not bad at all!*\n\n` +
      `🎁 You won: *+${result.amount} DCC*\n` +
      `🏦 Balance: *${fmt(newBalance)} DCC*\n\n` +
      `_Free DCC every day! Come back tomorrow! 🎯_`;
  } else {
    resultText = `🎁 *Daily Prize* ${result.segment.emoji}\n\n` +
      `${finalVis}\n\n` +
      `🎁 You won: *+${result.amount} DCC*\n` +
      `🏦 Balance: *${fmt(newBalance)} DCC*\n\n` +
      `_Free is free! Try again tomorrow for a bigger prize! 🍀_`;
  }

  const kb = new InlineKeyboard()
    .text('🎰 Play Slots', 'game_slots')
    .text('🎡 Spin Wheel', 'game_wheel').row()
    .text('🃏 Hi-Lo', 'game_hilo')
    .text('💣 Mines', 'game_mines').row()
    .text('◀️ Games Menu', 'games_menu');

  await ctx.api.editMessageText(
    spinMsg.chat.id,
    spinMsg.message_id,
    resultText,
    { parse_mode: 'Markdown', reply_markup: kb },
  ).catch(() => ctx.reply(resultText, { parse_mode: 'Markdown', reply_markup: kb }));
}
