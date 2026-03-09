// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bridge Service — SOL-Gateway-DCC API wrapper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { config } from '../../config';
import { logger } from '../../utils/logger';
import { DCC_PRICE_USD } from '../../config/constants';
import { randomUUID } from 'crypto';
export { DCC_PRICE_USD };

const BASE_URL = config.BRIDGE_API_URL;

/** Well-known Solana mainnet SPL token mint addresses */
const SPL_MINTS: Record<string, string> = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
};

async function bridgeFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error({ url, status: res.status, body }, 'Bridge API error');
    throw new Error(`Bridge API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────

export interface DepositResponse {
  success: boolean;
  instruction: {
    programId: string;
    accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
    data: { recipientDcc: string; amount: number };
  };
  metadata: {
    bridgeConfig: string;
    vault: string;
    userState: string;
    programId: string;
    amountLamports: number;
    currentSlot: number;
    estimatedFee: number;
    estimatedTime: string;
  };
}

export interface SplDepositResponse {
  success: boolean;
  instruction: Record<string, unknown>;
  metadata: {
    splVault: string;
    senderAta: string;
    tokenProgram: string;
    amountTokenUnits: number;
  };
}

export interface DepositLimits {
  minDeposit: string;
  maxDeposit: string;
  maxDailyVolume: string;
  currentDailyVolume: string;
  bridgeStatus: 'active' | 'paused';
  estimatedMintTime: string;
  solanaConfirmations: number;
}

export interface RegisterTransferResponse {
  success: boolean;
  transferId: string;
  status: string;
}

export type BridgeTransferStatus =
  | 'pending_confirmation'
  | 'awaiting_consensus'
  | 'consensus_reached'
  | 'minting'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'paused';

export interface TransferDetails {
  transferId: string;
  sender: string;
  recipient: string;
  amount: number;
  amountFormatted: string;
  direction: 'sol_to_dcc' | 'dcc_to_sol';
  status: BridgeTransferStatus;
  sourceTxHash?: string;
  destTxHash?: string;
  splMint?: string | null;
  error?: string | null;
  createdAt: number;
  updatedAt: number;
  confirmations: number;
  validatorSignatures: number;
}

export interface FeeQuoteResponse {
  success: boolean;
  quote: {
    inputAmount: number;
    feeAmount: number;
    receiveAmount: number;
    feeRate: number;
    feeDisplay: string;
    path: 'committee' | 'zk';
    direction: string;
    minFeeApplied?: boolean;
  };
}

// ── Pricing ───────────────────────────────

/**
 * Fetch the current SOL/USD price from CoinGecko (public, no key needed).
 * Cached for 60s in-memory to avoid hammering the API.
 */
let _solPriceCache: { price: number; ts: number } | null = null;
let _solPricePending: Promise<number> | null = null;
const SOL_CACHE_TTL_MS = 60_000;

export async function getSolPrice(): Promise<number> {
  if (_solPriceCache && Date.now() - _solPriceCache.ts < SOL_CACHE_TTL_MS) {
    return _solPriceCache.price;
  }
  if (_solPricePending) return _solPricePending;

  _solPricePending = (async () => {
    try {
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      );
      if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
      const data = (await res.json()) as { solana: { usd: number } };
      const price = data.solana.usd;
      _solPriceCache = { price, ts: Date.now() };
      return price;
    } finally {
      _solPricePending = null;
    }
  })();

  return _solPricePending;
}

/**
 * Get the USD value of `amount` of a given token.
 * USDC/USDT = $1 each; SOL = live price.
 */
export async function tokenToUsd(token: string, amount: number): Promise<number> {
  if (token === 'USDC' || token === 'USDT') return amount;
  if (token === 'SOL') return amount * await getSolPrice();
  throw new Error(`Unsupported token: ${token}`);
}

export interface LocalQuote {
  token: string;
  inputAmount: number;
  usdValue: number;
  dccAmount: number;
  pricePerDcc: number;
  solPrice?: number;
}

/**
 * Compute a purchase quote locally at the fixed $0.15/DCC rate.
 */
export async function getLocalQuote(token: string, amount: number): Promise<LocalQuote> {
  const usdValue = await tokenToUsd(token, amount);
  const dccAmount = Math.floor(usdValue / DCC_PRICE_USD * 100) / 100; // round down to 2 dp
  return {
    token,
    inputAmount: amount,
    usdValue: Math.round(usdValue * 100) / 100,
    dccAmount,
    pricePerDcc: DCC_PRICE_USD,
    solPrice: token === 'SOL' ? await getSolPrice() : undefined,
  };
}

// ── API Functions ─────────────────────────

/**
 * A placeholder "sender" address for generating deposit instructions.
 * The bridge only needs this to construct the instruction template;
 * the user signs the actual transaction from their own wallet.
 */
const PLACEHOLDER_SENDER = '11111111111111111111111111111111';

export async function getDepositLimits(token: string): Promise<DepositLimits> {
  return bridgeFetch<DepositLimits>(
    `/deposit/limits?token=${encodeURIComponent(token)}`,
  );
}

export async function generateSolDeposit(
  amount: number,
  recipientDcc: string,
  sender?: string,
): Promise<DepositResponse> {
  return bridgeFetch<DepositResponse>('/deposit', {
    method: 'POST',
    body: JSON.stringify({
      sender: sender ?? PLACEHOLDER_SENDER,
      recipientDcc,
      amount,
    }),
  });
}

export async function generateSplDeposit(
  token: string,
  amount: number,
  recipientDcc: string,
  sender?: string,
): Promise<SplDepositResponse> {
  const splMint = SPL_MINTS[token];
  if (!splMint) throw new Error(`Unsupported SPL token: ${token}`);

  return bridgeFetch<SplDepositResponse>('/deposit/spl', {
    method: 'POST',
    body: JSON.stringify({
      sender: sender ?? PLACEHOLDER_SENDER,
      recipientDcc,
      amount,
      splMint,
    }),
  });
}

export async function getFeeQuote(
  token: string,
  amount: number,
  direction: 'deposit' | 'withdrawal' = 'deposit',
): Promise<FeeQuoteResponse> {
  return bridgeFetch<FeeQuoteResponse>(
    `/fees/quote?token=${encodeURIComponent(token)}&amount=${encodeURIComponent(amount)}&direction=${direction}`,
  );
}

export async function registerTransfer(data: {
  sender: string;
  recipient: string;
  amount: number;
  direction: 'sol_to_dcc' | 'dcc_to_sol';
  amountFormatted?: string;
  splMint?: string;
}): Promise<RegisterTransferResponse> {
  return bridgeFetch<RegisterTransferResponse>('/transfer/register', {
    method: 'POST',
    body: JSON.stringify({
      transferId: randomUUID(),
      ...data,
    }),
  });
}

export async function getTransferStatus(transferId: string): Promise<TransferDetails> {
  return bridgeFetch<TransferDetails>(`/transfer/${encodeURIComponent(transferId)}`);
}

export async function getBridgeHealth(): Promise<{ status: string; [key: string]: unknown }> {
  return bridgeFetch<{ status: string }>('/health');
}
