// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Blockchain Service — DecentralChain RPC Adapter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// All blockchain reads are centralised here. No other layer should call
// the node directly. This makes it trivial to swap RPC providers, add
// caching, or introduce circuit breakers.
//
// DecentralChain (Waves-derived) exposes contract state via:
//   GET /addresses/data/{address}/{key}       — single key
//   GET /addresses/data/{address}?matches=... — regex batch
//   GET /assets/balance/{address}/{assetId}   — asset balance
//   GET /addresses/balance/{address}          — DCC balance
//   GET /blocks/height                        — current height
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import fetch from 'node-fetch';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { getRedis } from '../../utils/redis';
import { BLOCKCHAIN_CACHE_TTL, NODE_MAX_RETRIES, NODE_RETRY_BASE_DELAY_MS } from '../../config/constants';
import type { TrackerState, WalletBalances, OnChainClaimState } from '../../types';

const NODE = config.DCC_NODE_URL;
const TRACKER = config.ELIGIBILITY_TRACKER_ADDRESS;
const CLAIM = config.AIRDROP_CLAIM_ADDRESS;
const STDCC = config.STDCC_ASSET_ID;

// ── Low-level helpers ─────────────────────

const MAX_RETRIES = NODE_MAX_RETRIES;
const BASE_DELAY_MS = NODE_RETRY_BASE_DELAY_MS;

async function nodeGet<T>(path: string): Promise<T> {
  const url = `${NODE}${path}`;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        timeout: 10_000,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Node request failed: ${res.status} ${url} — ${body}`);
      }
      return res.json() as Promise<T>;
    } catch (err) {
      lastError = err as Error;
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        logger.warn({ attempt: attempt + 1, url, err: lastError.message }, 'Node request retry');
      }
    }
  }

  throw lastError!;
}

interface DataEntry {
  key: string;
  type: string;
  value: string | number | boolean;
}

/** Read a single key from a contract's data state */
async function readKey(contractAddr: string, key: string): Promise<DataEntry | null> {
  try {
    return await nodeGet<DataEntry>(`/addresses/data/${contractAddr}/${encodeURIComponent(key)}`);
  } catch {
    return null;
  }
}

/** Read multiple keys matching a prefix via regex */
async function readKeysByPrefix(contractAddr: string, prefix: string): Promise<DataEntry[]> {
  const encoded = encodeURIComponent(`^${escapeRegex(prefix)}`);
  return nodeGet<DataEntry[]>(`/addresses/data/${contractAddr}?matches=${encoded}`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Typed readers ─────────────────────────

async function readInt(contractAddr: string, key: string): Promise<number> {
  const entry = await readKey(contractAddr, key);
  return entry?.type === 'integer' ? (entry.value as number) : 0;
}

async function readBool(contractAddr: string, key: string): Promise<boolean> {
  const entry = await readKey(contractAddr, key);
  return entry?.type === 'boolean' ? (entry.value as boolean) : false;
}

async function readString(contractAddr: string, key: string): Promise<string | null> {
  const entry = await readKey(contractAddr, key);
  return entry?.type === 'string' ? (entry.value as string) : null;
}

// ── Public API ────────────────────────────

/** Get current blockchain height */
export async function getCurrentHeight(): Promise<number> {
  const data = await nodeGet<{ height: number }>('/blocks/height');
  return data.height;
}

/** Fetch all EligibilityTracker state for a given wallet address */
export async function getUserTrackerState(wallet: string): Promise<TrackerState> {
  const prefix = `user:${wallet}:`;

  // Batch read all user keys from the tracker contract
  const entries = await readKeysByPrefix(TRACKER, prefix);
  const map = new Map<string, string | number | boolean>();
  for (const e of entries) {
    // Strip the prefix so we get short keys like "poolCount", "swapCount", etc.
    const shortKey = e.key.slice(prefix.length);
    map.set(shortKey, e.value);
  }

  return {
    poolCount: (map.get('poolCount') as number) ?? 0,
    swapCount: (map.get('swapCount') as number) ?? 0,
    dappCount: (map.get('dappCount') as number) ?? 0,
    everStaked: (map.get('everStaked') as boolean) ?? false,
    hasCurrentStake: (map.get('hasCurrentStake') as boolean) ?? false,
    firstStakeHeight: (map.get('firstStakeHeight') as number) ?? 0,
    firstLpHeight: (map.get('firstLpHeight') as number) ?? 0,
    hasCurrentLp: (map.get('hasCurrentLp') as boolean) ?? false,
    walletAgeOk: (map.get('walletAgeOk') as boolean) ?? false,
    txCountOk: (map.get('txCountOk') as boolean) ?? false,
    sybilFlag: (map.get('sybilFlag') as boolean) ?? false,
    claimed: (map.get('claimed') as boolean) ?? false,
    lastSwapHeight: (map.get('lastSwapHeight') as number) ?? 0,
    lastLpHeight: (map.get('lastLpHeight') as number) ?? 0,
    lastActivityHeight: (map.get('lastActivityHeight') as number) ?? 0,
  };
}

/** Fetch wallet token balances */
export async function getWalletBalances(wallet: string): Promise<WalletBalances> {
  const [dccData, stDCCData] = await Promise.all([
    nodeGet<{ balance: number }>(`/addresses/balance/${wallet}`).catch(() => ({ balance: 0 })),
    nodeGet<{ balance: number }>(`/assets/balance/${wallet}/${STDCC}`).catch(() => ({ balance: 0 })),
  ]);

  return {
    dccBalance: BigInt(dccData.balance),
    stDCCBalance: BigInt(stDCCData.balance),
  };
}

/** Token balance entry from the node's all-assets endpoint */
export interface TokenBalance {
  assetId: string;
  name: string;
  balance: number;
  decimals: number;
}

/** Fetch all token balances for a wallet (DCC native + all issued assets) */
export async function getAllTokenBalances(wallet: string): Promise<{ dcc: number; tokens: TokenBalance[] }> {
  const [dccData, assetsData] = await Promise.all([
    nodeGet<{ balance: number }>(`/addresses/balance/${wallet}`).catch(() => ({ balance: 0 })),
    nodeGet<{ balances: Array<{ assetId: string; balance: number; issueTransaction?: { name: string; decimals: number } }> }>(
      `/assets/balance/${wallet}`,
    ).catch(() => ({ balances: [] })),
  ]);

  const tokens: TokenBalance[] = assetsData.balances
    .filter((b) => b.balance > 0 && b.issueTransaction)
    .map((b) => ({
      assetId: b.assetId,
      name: b.issueTransaction!.name,
      balance: b.balance,
      decimals: b.issueTransaction!.decimals,
    }));

  return { dcc: dccData.balance, tokens };
}

/** Check on-chain AirdropClaim contract state for a user */
export async function getClaimStatus(wallet: string): Promise<OnChainClaimState> {
  const [claimLive, userClaimed, claimTxId] = await Promise.all([
    readBool(CLAIM, 'config:claimLive'),
    readBool(CLAIM, `user:${wallet}:claimed`),
    readString(CLAIM, `user:${wallet}:claimTx`),
  ]);

  return { claimLive, userClaimed, claimTxId };
}

/** Verify that a data transaction exists with a specific key/value pair from a wallet */
export async function verifyDataTransaction(
  wallet: string,
  expectedKey: string,
  expectedValue: string,
): Promise<boolean> {
  try {
    // Search recent transactions from the wallet for a data tx with the challenge
    const txs = await nodeGet<Array<{
      type: number;
      sender: string;
      data?: Array<{ key: string; type: string; value: string }>;
    }>>(`/transactions/address/${wallet}/limit/20`);

    // Flatten — the endpoint returns [[...txs]]
    const flat = Array.isArray(txs[0]) ? (txs as unknown as Array<Array<{ type: number; sender: string; data?: Array<{ key: string; type: string; value: string }> }>>)[0] : txs;

    for (const tx of flat) {
      // Type 12 = DataTransaction on Waves-derived chains
      if (tx.type === 12 && tx.sender === wallet && tx.data) {
        for (const entry of tx.data) {
          if (entry.key === expectedKey && entry.value === expectedValue) {
            return true;
          }
        }
      }
    }
    return false;
  } catch (err) {
    logger.warn({ err, wallet }, 'Failed to verify data transaction');
    return false;
  }
}

// ── Cached wrapper (optional, uses Redis) ─

const CACHE_TTL = BLOCKCHAIN_CACHE_TTL;

export async function getCachedTrackerState(wallet: string): Promise<TrackerState> {
  const redis = getRedis();
  const cacheKey = `tracker:${wallet}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as TrackerState;
  }
  const state = await getUserTrackerState(wallet);
  await redis.set(cacheKey, JSON.stringify(state), 'EX', CACHE_TTL);
  return state;
}

export async function getCachedBalances(wallet: string): Promise<WalletBalances> {
  const redis = getRedis();
  const cacheKey = `balances:${wallet}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    return { dccBalance: BigInt(parsed.dccBalance), stDCCBalance: BigInt(parsed.stDCCBalance) };
  }
  const balances = await getWalletBalances(wallet);
  await redis.set(
    cacheKey,
    JSON.stringify({ dccBalance: balances.dccBalance.toString(), stDCCBalance: balances.stDCCBalance.toString() }),
    'EX',
    CACHE_TTL,
  );
  return balances;
}

export async function invalidateCache(wallet: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`tracker:${wallet}`, `balances:${wallet}`);
}
