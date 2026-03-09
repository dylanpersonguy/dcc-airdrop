// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bridge Service — SOL-Gateway-DCC API wrapper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { config } from '../../config';
import { logger } from '../../utils/logger';
import { DCC_PRICE_USD } from '../../config/constants';
export { DCC_PRICE_USD };

const BASE_URL = config.BRIDGE_API_URL;

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

export interface FeeQuote {
  token: string;
  inputAmount: number;
  fee: number;
  dccAmount: number;
  rate: number;
  expiresAt: string;
}

export interface DepositInstruction {
  depositAddress: string;
  memo?: string;
  minAmount: number;
  maxAmount: number;
  expiresAt: string;
}

export interface SplDepositInstruction {
  depositAddress: string;
  tokenMint: string;
  minAmount: number;
  maxAmount: number;
  expiresAt: string;
}

export interface DepositLimits {
  token: string;
  min: number;
  max: number;
}

export interface TransferStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  token: string;
  inputAmount: number;
  dccAmount: number;
  solanaTxId?: string;
  dccTxId?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Pricing ───────────────────────────────

const TOKEN_DECIMALS: Record<string, number> = { SOL: 9, USDC: 6, USDT: 6 };

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
  // Deduplicate concurrent requests — share a single in-flight fetch
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

export async function getFeeQuote(token: string, amount: number): Promise<FeeQuote> {
  return bridgeFetch<FeeQuote>(
    `/fees/quote?token=${encodeURIComponent(token)}&amount=${encodeURIComponent(amount)}`,
  );
}

export async function getDepositLimits(token: string): Promise<DepositLimits> {
  return bridgeFetch<DepositLimits>(
    `/deposit/limits?token=${encodeURIComponent(token)}`,
  );
}

export async function generateSolDeposit(amount: number): Promise<DepositInstruction> {
  return bridgeFetch<DepositInstruction>('/deposit', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export async function generateSplDeposit(
  token: string,
  amount: number,
): Promise<SplDepositInstruction> {
  return bridgeFetch<SplDepositInstruction>('/deposit/spl', {
    method: 'POST',
    body: JSON.stringify({ token, amount }),
  });
}

export async function registerTransfer(data: {
  token: string;
  amount: number;
  depositAddress: string;
  userId: string;
}): Promise<TransferStatus> {
  return bridgeFetch<TransferStatus>('/transfer/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getTransferStatus(transferId: string): Promise<TransferStatus> {
  return bridgeFetch<TransferStatus>(`/transfer/${encodeURIComponent(transferId)}`);
}

export async function getBridgeHealth(): Promise<{ ok: boolean }> {
  return bridgeFetch<{ ok: boolean }>('/health');
}
