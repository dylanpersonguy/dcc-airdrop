// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Games Service — Casino mini-game logic & balance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import prisma from '../../db/prisma';
import { getFullBalance, invalidateBalanceCache } from '../balance';
import { audit } from '../../utils/audit';
import { getRedis } from '../../utils/redis';
import crypto from 'crypto';

// ── Constants ─────────────────────────────

export const MIN_BET = 5;
export const MAX_BET = 1000;

// ── Balance helpers ───────────────────────

export async function getGameBalance(userId: string): Promise<number> {
  const balance = await getFullBalance(userId);
  return balance.totalAvailable;
}

export async function getGameNetProfit(userId: string): Promise<number> {
  const result = await prisma.gameTransaction.aggregate({
    where: { userId },
    _sum: { profit: true },
  });
  return result._sum.profit ?? 0;
}

export async function getGameStats(userId: string): Promise<{
  totalGames: number;
  totalWagered: number;
  totalWon: number;
  netProfit: number;
  biggestWin: number;
}> {
  const [agg, bigWin] = await Promise.all([
    prisma.gameTransaction.aggregate({
      where: { userId },
      _sum: { betAmount: true, payout: true, profit: true },
      _count: true,
    }),
    prisma.gameTransaction.findFirst({
      where: { userId, profit: { gt: 0 } },
      orderBy: { profit: 'desc' },
    }),
  ]);
  return {
    totalGames: agg._count,
    totalWagered: agg._sum.betAmount ?? 0,
    totalWon: agg._sum.payout ?? 0,
    netProfit: agg._sum.profit ?? 0,
    biggestWin: bigWin?.profit ?? 0,
  };
}

async function recordGame(
  userId: string,
  game: string,
  betAmount: number,
  payout: number,
  multiplier: number,
  details?: Record<string, unknown>,
): Promise<void> {
  const profit = payout - betAmount;
  await prisma.gameTransaction.create({
    data: {
      userId,
      game,
      betAmount,
      payout,
      profit,
      multiplier,
      details: details ? JSON.stringify(details) : null,
    },
  });
  await invalidateBalanceCache(userId);
  await audit({
    actorType: 'user',
    actorId: userId,
    action: `game_${game}`,
    targetType: 'user',
    targetId: userId,
    metadata: { game, betAmount, payout, profit, multiplier },
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GAME 1: MEGA SLOTS 🎰
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SLOT_SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', '👑'];
const SLOT_WEIGHTS = [30, 25, 20, 15, 8, 2]; // out of 100
const SLOT_PAYOUTS: Record<string, number> = {
  '👑': 100, // Jackpot: 100x
  '💎': 50,
  '⭐': 25,
  '🔔': 10,
  '🍋': 5,
  '🍒': 3,
};

function weightedRandomSymbol(): string {
  const rand = crypto.randomInt(0, 100);
  let cumulative = 0;
  for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
    cumulative += SLOT_WEIGHTS[i];
    if (rand < cumulative) return SLOT_SYMBOLS[i];
  }
  return SLOT_SYMBOLS[0];
}

export interface SlotResult {
  reels: [string, string, string];
  multiplier: number;
  payout: number;
  isJackpot: boolean;
  isWin: boolean;
}

export async function playSlots(userId: string, bet: number): Promise<SlotResult> {
  const reels: [string, string, string] = [
    weightedRandomSymbol(),
    weightedRandomSymbol(),
    weightedRandomSymbol(),
  ];

  let multiplier = 0;
  let isJackpot = false;

  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    // Triple match
    multiplier = SLOT_PAYOUTS[reels[0]] ?? 3;
    isJackpot = reels[0] === '👑';
  } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    // Pair
    multiplier = 1.5;
  }

  const payout = Math.floor(bet * multiplier * 100) / 100;
  await recordGame(userId, 'slots', bet, payout, multiplier, { reels });

  return { reels, multiplier, payout, isJackpot, isWin: multiplier > 0 };
}

/**
 * Generate animation frames for slot spin effect.
 */
export function generateSlotFrames(finalReels: [string, string, string]): string[][] {
  const frames: string[][] = [];
  for (let i = 0; i < 6; i++) {
    const frame = [
      i < 2 ? SLOT_SYMBOLS[crypto.randomInt(0, SLOT_SYMBOLS.length)] : finalReels[0],
      i < 4 ? SLOT_SYMBOLS[crypto.randomInt(0, SLOT_SYMBOLS.length)] : finalReels[1],
      i < 6 ? SLOT_SYMBOLS[crypto.randomInt(0, SLOT_SYMBOLS.length)] : finalReels[2],
    ];
    frames.push(frame);
  }
  // Last frame is always final
  frames[frames.length - 1] = [...finalReels];
  return frames;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GAME 2: MINES 💣
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const MINES_GRID_SIZE = 25; // 5x5
export const MINE_COUNTS = [3, 5, 7, 10] as const;
export type MineCount = (typeof MINE_COUNTS)[number];

export interface MinesState {
  grid: boolean[]; // true = mine
  revealed: boolean[];
  mineCount: MineCount;
  bet: number;
  currentMultiplier: number;
  revealedSafe: number;
  gameOver: boolean;
  cashedOut: boolean;
  hitMine: boolean;
}

/** Multiplier table for each mine count + safe tiles revealed */
function minesMultiplier(mines: MineCount, safeRevealed: number): number {
  if (safeRevealed === 0) return 1;
  const safeTiles = MINES_GRID_SIZE - mines;
  let mult = 1;
  for (let i = 0; i < safeRevealed; i++) {
    mult *= MINES_GRID_SIZE / (safeTiles - i);
  }
  // Apply 3% house edge
  return Math.floor(mult * 0.97 * 100) / 100;
}

export function createMinesGame(bet: number, mineCount: MineCount): MinesState {
  // Place mines randomly
  const minePositions = new Set<number>();
  while (minePositions.size < mineCount) {
    minePositions.add(crypto.randomInt(0, MINES_GRID_SIZE));
  }

  const grid = Array(MINES_GRID_SIZE).fill(false);
  for (const pos of minePositions) grid[pos] = true;

  return {
    grid,
    revealed: Array(MINES_GRID_SIZE).fill(false),
    mineCount,
    bet,
    currentMultiplier: 1,
    revealedSafe: 0,
    gameOver: false,
    cashedOut: false,
    hitMine: false,
  };
}

export interface MinesRevealResult {
  isMine: boolean;
  position: number;
  newMultiplier: number;
  payout: number;
  gameOver: boolean;
}

export function revealMinesTile(state: MinesState, position: number): MinesRevealResult {
  if (state.gameOver || state.revealed[position]) {
    return {
      isMine: false,
      position,
      newMultiplier: state.currentMultiplier,
      payout: 0,
      gameOver: state.gameOver,
    };
  }

  state.revealed[position] = true;

  if (state.grid[position]) {
    // Hit a mine!
    state.gameOver = true;
    state.hitMine = true;
    return {
      isMine: true,
      position,
      newMultiplier: 0,
      payout: 0,
      gameOver: true,
    };
  }

  state.revealedSafe++;
  state.currentMultiplier = minesMultiplier(state.mineCount, state.revealedSafe);

  const safeTilesLeft = MINES_GRID_SIZE - state.mineCount - state.revealedSafe;
  if (safeTilesLeft === 0) {
    state.gameOver = true;
    state.cashedOut = true;
  }

  return {
    isMine: false,
    position,
    newMultiplier: state.currentMultiplier,
    payout: Math.floor(state.bet * state.currentMultiplier * 100) / 100,
    gameOver: state.gameOver,
  };
}

export async function cashOutMines(userId: string, state: MinesState): Promise<number> {
  const payout = Math.floor(state.bet * state.currentMultiplier * 100) / 100;
  state.gameOver = true;
  state.cashedOut = true;
  await recordGame(userId, 'mines', state.bet, payout, state.currentMultiplier, {
    mineCount: state.mineCount,
    revealedSafe: state.revealedSafe,
  });
  return payout;
}

export async function loseMines(userId: string, state: MinesState): Promise<void> {
  await recordGame(userId, 'mines', state.bet, 0, 0, {
    mineCount: state.mineCount,
    revealedSafe: state.revealedSafe,
  });
}

// Mines game state storage in Redis
const MINES_STATE_TTL = 600; // 10 minutes

export async function saveMinesState(userId: string, state: MinesState): Promise<void> {
  const redis = getRedis();
  await redis.set(`mines:${userId}`, JSON.stringify(state), 'EX', MINES_STATE_TTL);
}

export async function loadMinesState(userId: string): Promise<MinesState | null> {
  const redis = getRedis();
  const raw = await redis.get(`mines:${userId}`);
  return raw ? (JSON.parse(raw) as MinesState) : null;
}

export async function clearMinesState(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`mines:${userId}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GAME 3: CRASH 🚀
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CrashState {
  bet: number;
  crashPoint: number; // Pre-determined crash point
  currentMultiplier: number;
  step: number;
  gameOver: boolean;
  cashedOut: boolean;
  crashed: boolean;
}

/**
 * Generate a crash point using inverse distribution.
 * Median ~1.8x, can go up to 1000x (extremely rare).
 * House edge: ~4%
 */
function generateCrashPoint(): number {
  const h = 0.04; // 4% house edge
  const r = crypto.randomInt(1, 10001) / 10000; // 0.0001 to 1.0
  if (r <= h) return 1.0; // Instant crash (4% chance)
  const point = (1 - h) / (r - h);
  return Math.floor(Math.min(point, 1000) * 100) / 100;
}

export function createCrashGame(bet: number): CrashState {
  return {
    bet,
    crashPoint: generateCrashPoint(),
    currentMultiplier: 1.0,
    step: 0,
    gameOver: false,
    cashedOut: false,
    crashed: false,
  };
}

/**
 * Advance the crash game by one tick.
 * Returns true if the game continues, false if crashed.
 */
export function advanceCrash(state: CrashState): boolean {
  if (state.gameOver) return false;

  state.step++;
  // Multiplier increases ~0.1-0.3x per tick, accelerating
  const increment = 0.1 + state.step * 0.02;
  state.currentMultiplier = Math.floor((state.currentMultiplier + increment) * 100) / 100;

  if (state.currentMultiplier >= state.crashPoint) {
    state.currentMultiplier = state.crashPoint;
    state.gameOver = true;
    state.crashed = true;
    return false;
  }

  return true;
}

export async function cashOutCrash(userId: string, state: CrashState): Promise<number> {
  const payout = Math.floor(state.bet * state.currentMultiplier * 100) / 100;
  state.gameOver = true;
  state.cashedOut = true;
  await recordGame(userId, 'crash', state.bet, payout, state.currentMultiplier, {
    crashPoint: state.crashPoint,
    cashedAtStep: state.step,
  });
  return payout;
}

export async function loseCrash(userId: string, state: CrashState): Promise<void> {
  await recordGame(userId, 'crash', state.bet, 0, 0, {
    crashPoint: state.crashPoint,
    crashedAtStep: state.step,
  });
}

// Crash game state storage in Redis
const CRASH_STATE_TTL = 300; // 5 minutes

export async function saveCrashState(userId: string, state: CrashState): Promise<void> {
  const redis = getRedis();
  await redis.set(`crash:${userId}`, JSON.stringify(state), 'EX', CRASH_STATE_TTL);
}

export async function loadCrashState(userId: string): Promise<CrashState | null> {
  const redis = getRedis();
  const raw = await redis.get(`crash:${userId}`);
  return raw ? (JSON.parse(raw) as CrashState) : null;
}

export async function clearCrashState(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`crash:${userId}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GAME 4: LUCKY WHEEL 🎡
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface WheelSegment {
  label: string;
  emoji: string;
  multiplier: number;
  weight: number; // relative weight
  color: string; // for display bars
}

export const WHEEL_SEGMENTS: WheelSegment[] = [
  { label: '💀 BUST',    emoji: '💀', multiplier: 0,    weight: 25, color: '⬛' },
  { label: '0.5x',       emoji: '😬', multiplier: 0.5,  weight: 20, color: '🟫' },
  { label: '1x',         emoji: '😐', multiplier: 1,    weight: 15, color: '⬜' },
  { label: '1.5x',       emoji: '🙂', multiplier: 1.5,  weight: 12, color: '🟨' },
  { label: '2x',         emoji: '😊', multiplier: 2,    weight: 8,  color: '🟩' },
  { label: '💀 BUST',    emoji: '💀', multiplier: 0,    weight: 25, color: '⬛' },
  { label: '0.5x',       emoji: '😬', multiplier: 0.5,  weight: 20, color: '🟫' },
  { label: '3x',         emoji: '😃', multiplier: 3,    weight: 6,  color: '🟦' },
  { label: '1x',         emoji: '😐', multiplier: 1,    weight: 15, color: '⬜' },
  { label: '💀 BUST',    emoji: '💀', multiplier: 0,    weight: 25, color: '⬛' },
  { label: '0.5x',       emoji: '😬', multiplier: 0.5,  weight: 20, color: '🟫' },
  { label: '1.5x',       emoji: '🙂', multiplier: 1.5,  weight: 12, color: '🟨' },
  { label: '2x',         emoji: '😊', multiplier: 2,    weight: 8,  color: '🟩' },
  { label: '💀 BUST',    emoji: '💀', multiplier: 0,    weight: 25, color: '⬛' },
  { label: '🤩 5x',      emoji: '🤩', multiplier: 5,    weight: 3,  color: '🟪' },
  { label: '0.5x',       emoji: '😬', multiplier: 0.5,  weight: 20, color: '🟫' },
  { label: '🔥 10x',     emoji: '🔥', multiplier: 10,   weight: 2,  color: '🟧' },
  { label: '50x JACKPOT',emoji: '👑', multiplier: 50,   weight: 1,  color: '👑' },
];

const WHEEL_TOTAL_WEIGHT = WHEEL_SEGMENTS.reduce((s, seg) => s + seg.weight, 0);

export interface WheelResult {
  segmentIndex: number;
  segment: WheelSegment;
  multiplier: number;
  payout: number;
  isJackpot: boolean;
  isBust: boolean;
}

export async function spinWheel(userId: string, bet: number): Promise<WheelResult> {
  const rand = crypto.randomInt(0, WHEEL_TOTAL_WEIGHT);
  let cumulative = 0;
  let segmentIndex = 0;

  for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
    cumulative += WHEEL_SEGMENTS[i].weight;
    if (rand < cumulative) {
      segmentIndex = i;
      break;
    }
  }

  const segment = WHEEL_SEGMENTS[segmentIndex];
  const payout = Math.floor(bet * segment.multiplier * 100) / 100;

  await recordGame(userId, 'wheel', bet, payout, segment.multiplier, {
    segmentIndex,
    segmentLabel: segment.label,
  });

  return {
    segmentIndex,
    segment,
    multiplier: segment.multiplier,
    payout,
    isJackpot: segment.multiplier >= 50,
    isBust: segment.multiplier === 0,
  };
}

/** Build visual wheel frames for animation (positions the pointer moves through) */
export function generateWheelFrames(finalIndex: number): number[] {
  // Spin 2-3 full rotations + land on final
  const totalSegments = WHEEL_SEGMENTS.length;
  const rotations = 2 + crypto.randomInt(0, 2); // 2 or 3 full spins
  const totalSteps = rotations * totalSegments + finalIndex;

  // Generate frames — fast at start, slow at end
  const frames: number[] = [];
  let pos = crypto.randomInt(0, totalSegments); // random start
  const stepSize = Math.max(8, Math.floor(totalSteps / 12));

  for (let i = 0; i < totalSteps; i += Math.max(1, Math.floor(stepSize * (1 - i / totalSteps)))) {
    frames.push((pos + i) % totalSegments);
  }

  // Ensure last 3 frames slow down toward final
  const nearFinal = [(finalIndex - 2 + totalSegments) % totalSegments, (finalIndex - 1 + totalSegments) % totalSegments, finalIndex];
  frames.push(...nearFinal);

  return frames;
}

/** Build a visual wheel display showing nearby segments with a pointer */
export function renderWheelVisual(currentIndex: number, spinning: boolean): string {
  const total = WHEEL_SEGMENTS.length;
  const lines: string[] = [];
  const visibleRange = 3; // show 3 above and 3 below current

  lines.push(spinning ? '   🎡 *SPINNING...*' : '   🎡 *RESULT*');
  lines.push('   ┌─────────────┐');

  for (let offset = -visibleRange; offset <= visibleRange; offset++) {
    const idx = (currentIndex + offset + total) % total;
    const seg = WHEEL_SEGMENTS[idx];
    const pointer = offset === 0 ? ' ▸' : '  ';
    const highlight = offset === 0 ? '*' : '';
    const bar = seg.color;

    if (offset === 0) {
      lines.push(`  ➤│ ${bar} ${highlight}${seg.label}${highlight} │◀`);
    } else {
      lines.push(`   │ ${bar} ${seg.label.padEnd(12)} │`);
    }
  }

  lines.push('   └─────────────┘');
  return lines.join('\n');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GAME 5: HI-LO 🃏
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CARD_VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
const CARD_SUITS = ['♠️', '♥️', '♣️', '♦️'] as const;
export type CardValue = (typeof CARD_VALUES)[number];
export type CardSuit = (typeof CARD_SUITS)[number];

export interface Card {
  value: CardValue;
  suit: CardSuit;
  numericValue: number; // 1-13
}

function randomCard(): Card {
  const valueIdx = crypto.randomInt(0, 13);
  const suitIdx = crypto.randomInt(0, 4);
  return {
    value: CARD_VALUES[valueIdx],
    suit: CARD_SUITS[suitIdx],
    numericValue: valueIdx + 1,
  };
}

export function cardDisplay(card: Card): string {
  return `${card.value}${card.suit}`;
}

export function cardEmoji(card: Card): string {
  if (card.numericValue >= 11) return '👑';
  if (card.numericValue >= 8) return '🔷';
  if (card.numericValue >= 5) return '🔶';
  return '🔸';
}

/** Calculate the multiplier for a correct guess based on probability */
function hiloMultiplier(currentCard: Card, guess: 'higher' | 'lower'): number {
  const v = currentCard.numericValue;
  // Probability of being correct (out of 13 possible values)
  // Higher: how many cards are above current, Lower: how many below
  let prob: number;
  if (guess === 'higher') {
    prob = (13 - v) / 13;
  } else {
    prob = (v - 1) / 13;
  }
  if (prob <= 0) return 0;
  // Apply 10% house edge to fair odds
  return Math.floor((0.90 / prob) * 100) / 100;
}

export interface HiLoState {
  bet: number;
  currentCard: Card;
  history: Array<{ card: Card; guess: 'higher' | 'lower'; correct: boolean }>;
  streak: number;
  currentMultiplier: number;
  gameOver: boolean;
  cashedOut: boolean;
  lost: boolean;
}

export function createHiLoGame(bet: number): HiLoState {
  return {
    bet,
    currentCard: randomCard(),
    history: [],
    streak: 0,
    currentMultiplier: 1,
    gameOver: false,
    cashedOut: false,
    lost: false,
  };
}

export interface HiLoGuessResult {
  correct: boolean;
  newCard: Card;
  oldCard: Card;
  newMultiplier: number;
  roundMultiplier: number;
  payout: number;
  gameOver: boolean;
}

export function guessHiLo(state: HiLoState, guess: 'higher' | 'lower'): HiLoGuessResult {
  const oldCard = state.currentCard;
  const newCard = randomCard();
  const roundMult = hiloMultiplier(oldCard, guess);

  let correct: boolean;
  if (guess === 'higher') {
    correct = newCard.numericValue > oldCard.numericValue;
  } else {
    correct = newCard.numericValue < oldCard.numericValue;
  }

  // Tie = loss (house wins on ties)
  if (newCard.numericValue === oldCard.numericValue) {
    correct = false;
  }

  state.history.push({ card: oldCard, guess, correct });
  state.currentCard = newCard;

  if (correct) {
    state.streak++;
    state.currentMultiplier = Math.floor(state.currentMultiplier * roundMult * 100) / 100;
    // Cap at 500x
    state.currentMultiplier = Math.min(state.currentMultiplier, 500);
  } else {
    state.gameOver = true;
    state.lost = true;
  }

  return {
    correct,
    newCard,
    oldCard,
    newMultiplier: state.currentMultiplier,
    roundMultiplier: roundMult,
    payout: correct ? Math.floor(state.bet * state.currentMultiplier * 100) / 100 : 0,
    gameOver: state.gameOver,
  };
}

export async function cashOutHiLo(userId: string, state: HiLoState): Promise<number> {
  const payout = Math.floor(state.bet * state.currentMultiplier * 100) / 100;
  state.gameOver = true;
  state.cashedOut = true;
  await recordGame(userId, 'hilo', state.bet, payout, state.currentMultiplier, {
    streak: state.streak,
    history: state.history.map((h) => ({ card: cardDisplay(h.card), guess: h.guess, correct: h.correct })),
  });
  return payout;
}

export async function loseHiLo(userId: string, state: HiLoState): Promise<void> {
  await recordGame(userId, 'hilo', state.bet, 0, 0, {
    streak: state.streak,
    history: state.history.map((h) => ({ card: cardDisplay(h.card), guess: h.guess, correct: h.correct })),
  });
}

// HiLo game state storage in Redis
const HILO_STATE_TTL = 600; // 10 minutes

export async function saveHiLoState(userId: string, state: HiLoState): Promise<void> {
  const redis = getRedis();
  await redis.set(`hilo:${userId}`, JSON.stringify(state), 'EX', HILO_STATE_TTL);
}

export async function loadHiLoState(userId: string): Promise<HiLoState | null> {
  const redis = getRedis();
  const raw = await redis.get(`hilo:${userId}`);
  return raw ? (JSON.parse(raw) as HiLoState) : null;
}

export async function clearHiLoState(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`hilo:${userId}`);
}

/** Render a visual card in a box */
export function renderCardBox(card: Card, hidden: boolean = false): string {
  if (hidden) {
    return '┌─────┐\n│ ??? │\n│  🂠  │\n│ ??? │\n└─────┘';
  }
  const val = card.value.padStart(2, ' ').padEnd(3, ' ');
  return `┌─────┐\n│${val}  │\n│  ${card.suit}  │\n│  ${val}│\n└─────┘`;
}

/** Build a streak display showing card history */
export function renderStreakBar(history: HiLoState['history'], currentCard: Card): string {
  if (history.length === 0) return '';
  const maxShow = 6;
  const shown = history.slice(-maxShow);
  const cards = shown.map((h) => {
    const icon = h.correct ? '✅' : '❌';
    return `${cardDisplay(h.card)}${icon}`;
  });
  cards.push(`*${cardDisplay(currentCard)}*❓`);
  return cards.join(' → ');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DAILY PRIZE — Free daily spin 🎁
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DailyPrizeSegment {
  label: string;
  emoji: string;
  amount: number;
  weight: number;
  color: string;
}

// Prize tiers — weights must sum to 10000 (basis points for precise probabilities)
export const DAILY_PRIZE_SEGMENTS: DailyPrizeSegment[] = [
  { label: '💎 JACKPOT',   emoji: '💎', amount: 10000, weight: 1,    color: '🟡' },  // 0.01%
  { label: '👑 MEGA',      emoji: '👑', amount: 5000,  weight: 4,    color: '🟡' },  // 0.04%
  { label: '🔥 HUGE',      emoji: '🔥', amount: 2500,  weight: 10,   color: '🟠' },  // 0.10%
  { label: '🤩 BIG',       emoji: '🤩', amount: 1000,  weight: 35,   color: '🟠' },  // 0.35%
  { label: '🎉 GREAT',     emoji: '🎉', amount: 500,   weight: 100,  color: '🔴' },  // 1.00%
  { label: '😃 NICE',      emoji: '😃', amount: 250,   weight: 200,  color: '🔴' },  // 2.00%
  { label: '😊 GOOD',      emoji: '😊', amount: 100,   weight: 500,  color: '🟣' },  // 5.00%
  { label: '🙂 OK',        emoji: '🙂', amount: 50,    weight: 1000, color: '🟣' },  // 10.00%
  { label: '😐 MEH',       emoji: '😐', amount: 25,    weight: 1500, color: '🔵' },  // 15.00%
  { label: '🪙 SMALL',     emoji: '🪙', amount: 10,    weight: 2650, color: '🔵' },  // 26.50%
  { label: '💸 TINY',      emoji: '💸', amount: 5,     weight: 2000, color: '⚪' },  // 20.00%
  { label: '🫧 MIN',       emoji: '🫧', amount: 3,     weight: 2000, color: '⚪' },  // 20.00%
];

export interface DailyPrizeResult {
  segment: DailyPrizeSegment;
  segmentIndex: number;
  amount: number;
  isJackpot: boolean;
}

/** Check if user has already claimed their daily prize today */
export async function canClaimDailyPrize(userId: string): Promise<{ canClaim: boolean; nextClaimAt: Date | null }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayClaim = await prisma.gameTransaction.findFirst({
    where: {
      userId,
      game: 'daily_prize',
      createdAt: { gte: today, lt: tomorrow },
    },
  });

  if (todayClaim) {
    return { canClaim: false, nextClaimAt: tomorrow };
  }
  return { canClaim: true, nextClaimAt: null };
}

/** Spin the daily prize wheel */
export async function spinDailyPrize(userId: string): Promise<DailyPrizeResult> {
  // Weighted random selection
  const totalWeight = DAILY_PRIZE_SEGMENTS.reduce((sum, s) => sum + s.weight, 0);
  const randBytes = crypto.randomBytes(4);
  const rand = randBytes.readUInt32BE(0) % totalWeight;

  let cumulative = 0;
  let selectedIndex = DAILY_PRIZE_SEGMENTS.length - 1;
  for (let i = 0; i < DAILY_PRIZE_SEGMENTS.length; i++) {
    cumulative += DAILY_PRIZE_SEGMENTS[i].weight;
    if (rand < cumulative) {
      selectedIndex = i;
      break;
    }
  }

  const segment = DAILY_PRIZE_SEGMENTS[selectedIndex];

  // Record as a game transaction with 0 bet
  await recordGame(userId, 'daily_prize', 0, segment.amount, 0, {
    prize: segment.label,
    amount: segment.amount,
  });

  await audit({
    actorType: 'user',
    actorId: userId,
    action: 'daily_prize_claimed',
    targetType: 'user',
    targetId: userId,
    metadata: { prize: segment.label, amount: segment.amount },
  });

  return {
    segment,
    segmentIndex: selectedIndex,
    amount: segment.amount,
    isJackpot: segment.amount >= 5000,
  };
}

/** Generate animation frames for the daily prize wheel */
export function generateDailyWheelFrames(finalIndex: number): number[] {
  const total = DAILY_PRIZE_SEGMENTS.length;
  const frames: number[] = [];

  // 2-3 full rotations + land on final
  const fullRotations = 2 + Math.floor(Math.random() * 2);
  const totalSteps = fullRotations * total + finalIndex;

  for (let i = 0; i < totalSteps; i++) {
    frames.push(i % total);
  }
  frames.push(finalIndex);
  return frames;
}

/** Render a visual of the daily prize wheel with pointer */
export function renderDailyWheelVisual(currentIndex: number, spinning: boolean): string {
  const segments = DAILY_PRIZE_SEGMENTS;
  const total = segments.length;
  const visible = 5; // show 5 segments
  const half = Math.floor(visible / 2);

  const lines: string[] = [];
  lines.push(spinning ? '╔═══════════════════╗' : '╔═══════╧═══════════╗');

  for (let offset = -half; offset <= half; offset++) {
    const idx = ((currentIndex + offset) % total + total) % total;
    const seg = segments[idx];
    const label = `${seg.emoji} ${seg.amount.toLocaleString()} DCC`;
    const padded = label.padEnd(17);
    if (offset === 0) {
      lines.push(`║➤ *${padded}* ◀║`);
    } else {
      lines.push(`║  ${padded}   ║`);
    }
  }

  lines.push(spinning ? '╚═══════════════════╝' : '╚═══════╤═══════════╝');
  return lines.join('\n');
}

/** Format time remaining until next daily claim */
export function formatTimeUntil(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  if (diff <= 0) return 'now';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
