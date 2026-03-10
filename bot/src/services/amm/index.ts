// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AMM Service — DCC Automated Market Maker API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { config } from '../../config';
import { logger } from '../../utils/logger';

const BASE_URL = config.AMM_API_URL;

async function ammFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    logger.error({ url, status: res.status, body }, 'AMM API error');
    throw new Error(`AMM API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────

export interface PoolSnapshot {
  poolKey: string;
  assetA: string;
  assetB: string;
  reserveA: string;
  reserveB: string;
  lpSupply: string;
  feeBps: number;
  status: string;
  priceAtoB: number;
  priceBtoA: number;
  tvlA: string;
  tvlB: string;
  timestamp: number;
  blockHeight: number;
}

export interface LpPosition {
  poolId: string;
  token0: string;
  token1: string;
  lpBalance: string;
  lpSupply: string;
  poolSharePct: number;
  reserve0: string;
  reserve1: string;
  userReserve0: string;
  userReserve1: string;
  feeBps: string;
  lpAssetId: string;
}

export interface AddLiquidityEstimate {
  estimate: {
    lpMinted: string;
    actualAmountA: string;
    actualAmountB: string;
    refundA: string;
    refundB: string;
  };
}

export interface RemoveLiquidityEstimate {
  estimate: {
    amountA: string;
    amountB: string;
  };
}

export interface InvokeScriptTx {
  type: number;
  dApp: string;
  call: { function: string; args: Array<{ type: string; value: string | number | boolean }> };
  payment: Array<{ assetId: string | null; amount: number }>;
  fee: number;
  chainId: string;
}

export interface AddLiquidityTxResponse {
  tx: InvokeScriptTx;
  estimate: {
    lpMinted: string;
    actualAmountA: string;
    actualAmountB: string;
    refundA: string;
    refundB: string;
  };
}

export interface RemoveLiquidityTxResponse {
  tx: InvokeScriptTx;
  estimate: {
    amountA: string;
    amountB: string;
  };
}

export interface TokenInfo {
  assetId: string;
  name: string;
  decimals: number;
  description: string;
  quantity: number;
  scripted: boolean;
}

export interface PoolStats {
  poolKey: string;
  volume24h: string;
  volume7d: string;
  fees24h: string;
  fees7d: string;
  tvl: string;
  txCount24h: number;
  apy: number;
}

// ── Pool Queries ──────────────────────────

export async function listPools(): Promise<PoolSnapshot[]> {
  return ammFetch<PoolSnapshot[]>('/pools');
}

export async function getPool(poolKey: string): Promise<PoolSnapshot> {
  return ammFetch<PoolSnapshot>(`/pools/${poolKey}`);
}

export async function getPoolStats(poolKey: string): Promise<PoolStats> {
  return ammFetch<PoolStats>(`/pools/${poolKey}/stats`);
}

// ── User Queries ──────────────────────────

export async function getUserPositions(address: string): Promise<LpPosition[]> {
  return ammFetch<LpPosition[]>(`/user/${encodeURIComponent(address)}/positions`);
}

// ── Token Info ────────────────────────────

export async function getTokenInfo(assetId: string): Promise<TokenInfo> {
  return ammFetch<TokenInfo>(`/token/${encodeURIComponent(assetId)}`);
}

// ── Quoting ───────────────────────────────

export async function quoteAddLiquidity(
  assetA: string,
  assetB: string,
  amountA: string,
  amountB: string,
  feeBps = 30,
): Promise<AddLiquidityEstimate> {
  const params = new URLSearchParams({ assetA, assetB, amountA, amountB, feeBps: String(feeBps) });
  return ammFetch<AddLiquidityEstimate>(`/quote/add-liquidity?${params}`);
}

export async function quoteRemoveLiquidity(
  assetA: string,
  assetB: string,
  lpAmount: string,
  feeBps = 30,
): Promise<RemoveLiquidityEstimate> {
  const params = new URLSearchParams({ assetA, assetB, lpAmount, feeBps: String(feeBps) });
  return ammFetch<RemoveLiquidityEstimate>(`/quote/remove-liquidity?${params}`);
}

// ── Transaction Builders ──────────────────

export async function buildAddLiquidityTx(
  assetA: string,
  assetB: string,
  amountA: string,
  amountB: string,
  feeBps = 30,
): Promise<AddLiquidityTxResponse> {
  return ammFetch<AddLiquidityTxResponse>('/tx/add-liquidity', {
    method: 'POST',
    body: JSON.stringify({ assetA, assetB, amountA, amountB, feeBps }),
  });
}

export async function buildRemoveLiquidityTx(
  assetA: string,
  assetB: string,
  lpAmount: string,
  feeBps = 30,
): Promise<RemoveLiquidityTxResponse> {
  return ammFetch<RemoveLiquidityTxResponse>('/tx/remove-liquidity', {
    method: 'POST',
    body: JSON.stringify({ assetA, assetB, lpAmount, feeBps }),
  });
}

// ── Swap Quoting & Transaction Building ───

export interface SwapQuote {
  poolId: string;
  assetIn: string;
  assetOut: string;
  feeBps: number;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  priceImpactBps: string;
  feeAmount: string;
  route: string;
}

export interface SwapTxResponse {
  tx: InvokeScriptTx;
  quote: SwapQuote;
}

export async function quoteSwap(
  assetIn: string,
  assetOut: string,
  amountIn: string,
  feeBps = 35,
  slippageBps = 50,
): Promise<SwapQuote> {
  const params = new URLSearchParams({
    assetIn,
    assetOut,
    amountIn,
    feeBps: String(feeBps),
    slippageBps: String(slippageBps),
  });
  return ammFetch<SwapQuote>(`/quote/swap?${params}`);
}

export async function buildSwapTx(
  assetIn: string,
  assetOut: string,
  amountIn: string,
  feeBps = 35,
  slippageBps = 50,
): Promise<SwapTxResponse> {
  return ammFetch<SwapTxResponse>('/tx/swap', {
    method: 'POST',
    body: JSON.stringify({ assetIn, assetOut, amountIn, feeBps, slippageBps }),
  });
}

// ── On-chain APY computation ──────────────

const POOL_CORE_ADDRESS = '3Dfh97WETii2jqHUZfw6AGsn3dLkAmvfiFm';

async function readPoolCoreKey(key: string): Promise<number> {
  try {
    const url = `${config.DCC_NODE_URL}/addresses/data/${POOL_CORE_ADDRESS}/${encodeURIComponent(key)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return 0;
    const data = (await res.json()) as { value: number };
    return typeof data.value === 'number' ? data.value : 0;
  } catch {
    return 0;
  }
}

/**
 * Compute APY from on-chain cumulative fees, reserves, and pool creation time.
 * Falls back to 0 if data is unavailable.
 */
export async function getOnChainPoolAPY(poolKey: string): Promise<{ apy: number; totalFeeDcc: number; volumeDcc: number }> {
  try {
    const [fees0, fees1, volume0, createdAt, r0, r1] = await Promise.all([
      readPoolCoreKey(`pool:fees0:${poolKey}`),
      readPoolCoreKey(`pool:fees1:${poolKey}`),
      readPoolCoreKey(`pool:volume0:${poolKey}`),
      readPoolCoreKey(`pool:createdAt:${poolKey}`),
      readPoolCoreKey(`pool:r0:${poolKey}`),
      readPoolCoreKey(`pool:r1:${poolKey}`),
    ]);

    const totalFeeDcc = (fees0 + fees1) / 1e8;
    const volumeDcc = volume0 / 1e8;
    const tvl = (r0 + r1) / 1e8;

    if (tvl <= 0 || createdAt <= 0 || totalFeeDcc <= 0) {
      return { apy: 0, totalFeeDcc, volumeDcc };
    }

    const ageMs = Date.now() - createdAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < 0.001) return { apy: 0, totalFeeDcc, volumeDcc };

    const dailyFeeRate = totalFeeDcc / tvl / ageDays;
    const apy = dailyFeeRate * 365 * 100;

    // Cap at 999% to avoid misleading values for very new pools
    return { apy: Math.min(apy, 999), totalFeeDcc, volumeDcc };
  } catch (err) {
    logger.warn({ err, poolKey }, 'Failed to compute on-chain APY');
    return { apy: 0, totalFeeDcc: 0, volumeDcc: 0 };
  }
}
