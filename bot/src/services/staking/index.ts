// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Staking Service — DCC Liquid Staking Protocol API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { config } from '../../config';
import { logger } from '../../utils/logger';

const BASE_URL = config.STAKING_API_URL;

async function stakingFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    logger.error({ url, status: res.status, body }, 'Staking API error');
    throw new Error(`Staking API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// ── Types (matching real API responses) ───

export interface ProtocolSnapshot {
  id: number;
  height: number;
  timestamp: string;
  total_pooled_dcc: string;
  total_shares: string;
  exchange_rate: string;
  total_leased_dcc: string;
  total_liquid_dcc: string;
  total_claimable_dcc: string;
  total_pending_withdraw_dcc: string;
  total_protocol_fees_dcc: string;
  validator_count: number;
  created_at: string;
}

export interface ExchangeRate {
  exchangeRate: string;
  dccPerStDcc: number;
  totalPooledDcc: string;
  totalShares: string;
}

export interface UserStakingState {
  address: string;
  stDccBalance: string;
  sharesLocked: string;
  withdrawCount: number;
  estimatedDccValue: string;
}

export interface DepositEstimate {
  depositAmount: string;
  sharesToReceive: string;
  exchangeRate: string;
  dccPerStDcc: number;
  minDeposit: string;
  protocolPaused: boolean;
}

export interface WithdrawEstimate {
  sharesToBurn: string;
  dccToReceive: string;
  exchangeRate: string;
  dccPerStDcc: number;
  minWithdrawShares: string;
  protocolPaused: boolean;
}

export interface BuiltTransaction {
  type: string;
  tx: {
    dApp: string;
    call: { function: string; args: Array<{ type: string; value: string | number }> };
    payment: Array<{ amount: number; assetId: string | null }>;
    chainId: string;
    fee: number;
  };
}

// ── Protocol Info ─────────────────────────

export async function getProtocolSnapshot(): Promise<ProtocolSnapshot> {
  return stakingFetch<ProtocolSnapshot>('/protocol/snapshot');
}

export async function getExchangeRate(): Promise<ExchangeRate> {
  return stakingFetch<ExchangeRate>('/chain/exchange-rate');
}

// ── User Info ─────────────────────────────

export async function getUserStakingState(address: string): Promise<UserStakingState> {
  return stakingFetch<UserStakingState>(`/chain/users/${encodeURIComponent(address)}`);
}

// ── Estimators ────────────────────────────

export async function estimateDeposit(amount: number): Promise<DepositEstimate> {
  return stakingFetch<DepositEstimate>('/estimate/deposit', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export async function estimateWithdraw(shares: number): Promise<WithdrawEstimate> {
  return stakingFetch<WithdrawEstimate>('/estimate/withdraw', {
    method: 'POST',
    body: JSON.stringify({ shares }),
  });
}

// ── Transaction Builders ──────────────────

export async function buildDepositTx(callerAddress: string, amount: number): Promise<BuiltTransaction> {
  return stakingFetch<BuiltTransaction>('/tx/build/deposit', {
    method: 'POST',
    body: JSON.stringify({ callerAddress, amount }),
  });
}

export async function buildRequestWithdrawTx(callerAddress: string, shares: number): Promise<BuiltTransaction> {
  return stakingFetch<BuiltTransaction>('/tx/build/request-withdraw', {
    method: 'POST',
    body: JSON.stringify({ callerAddress, shares }),
  });
}

export async function buildClaimWithdrawTx(callerAddress: string, requestId: string): Promise<BuiltTransaction> {
  return stakingFetch<BuiltTransaction>('/tx/build/claim-withdraw', {
    method: 'POST',
    body: JSON.stringify({ callerAddress, requestId }),
  });
}

// ── Broadcast ─────────────────────────────

export async function broadcastTx(signedTx: unknown): Promise<{ id: string; [key: string]: unknown }> {
  return stakingFetch<{ id: string }>('/tx/broadcast', {
    method: 'POST',
    body: JSON.stringify(signedTx),
  });
}

// ── Health ────────────────────────────────

export async function getStakingHealth(): Promise<{ status: string }> {
  return stakingFetch<{ status: string }>('/health');
}
