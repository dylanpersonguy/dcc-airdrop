// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NOWPayments Service — Crypto payment gateway
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { config } from '../../config';
import { logger } from '../../utils/logger';

const BASE_URL = 'https://api.nowpayments.io/v1';

async function npFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'x-api-key': config.NOWPAYMENTS_API_KEY,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error({ url, status: res.status, body }, 'NOWPayments API error');
    throw new Error(`NOWPayments API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────

export interface NowPaymentCreate {
  payment_id: number;
  payment_status: string;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  price_amount: number;
  price_currency: string;
  order_id?: string;
  order_description?: string;
  purchase_id?: string;
  expiration_estimate_date?: string;
  created_at: string;
}

export interface NowPaymentStatus {
  payment_id: number;
  payment_status:
    | 'waiting'
    | 'confirming'
    | 'confirmed'
    | 'sending'
    | 'partially_paid'
    | 'finished'
    | 'failed'
    | 'refunded'
    | 'expired';
  pay_address: string;
  pay_amount: number;
  actually_paid: number;
  pay_currency: string;
  price_amount: number;
  price_currency: string;
  order_id?: string;
  outcome_amount?: number;
  outcome_currency?: string;
  created_at: string;
  updated_at: string;
}

export interface EstimateResponse {
  currency_from: string;
  amount_from: number;
  currency_to: string;
  estimated_amount: number;
}

export interface MinAmountResponse {
  currency_from: string;
  currency_to: string;
  min_amount: number;
}

// ── API Functions ─────────────────────────

/** Get estimated crypto amount for a given USD value */
export async function getEstimatedPrice(
  amountUsd: number,
  payCurrency: string,
): Promise<number> {
  const data = await npFetch<EstimateResponse>(
    `/estimate?amount=${amountUsd}&currency_from=usd&currency_to=${encodeURIComponent(payCurrency)}`,
  );
  return data.estimated_amount;
}

/** Create a new payment via NOWPayments */
export async function createPayment(
  priceAmountUsd: number,
  payCurrency: string,
  orderId: string,
  orderDescription?: string,
): Promise<NowPaymentCreate> {
  return npFetch<NowPaymentCreate>('/payment', {
    method: 'POST',
    body: JSON.stringify({
      price_amount: priceAmountUsd,
      price_currency: 'usd',
      pay_currency: payCurrency,
      order_id: orderId,
      order_description: orderDescription ?? `Purchase DCC - ${orderId}`,
    }),
  });
}

/** Get payment status by NOWPayments payment ID */
export async function getPaymentStatus(paymentId: string | number): Promise<NowPaymentStatus> {
  return npFetch<NowPaymentStatus>(`/payment/${paymentId}`);
}

/** Get minimum payment amount for a currency */
export async function getMinPaymentAmount(currencyFrom: string): Promise<number> {
  const data = await npFetch<MinAmountResponse>(
    `/min-amount?currency_from=${encodeURIComponent(currencyFrom)}&currency_to=usd`,
  );
  return data.min_amount;
}
