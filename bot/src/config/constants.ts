// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants — Centralized magic numbers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** DecentralChain chain ID byte (produces 3D-prefixed addresses) */
export const DCC_CHAIN_ID = 63;

/** 1 DCC = 100,000,000 wavelets */
export const WAVELETS_PER_DCC = 1_0000_0000;

/** Default transfer fee in wavelets (0.001 DCC) */
export const FEE_WAVELETS = 100_000;

/** Transfer fee as DCC */
export const FEE_DCC = FEE_WAVELETS / WAVELETS_PER_DCC;

/** DCC price in USD */
export const DCC_PRICE_USD = 0.15;

/** Blockchain cache TTL in seconds */
export const BLOCKCHAIN_CACHE_TTL = 120;

/** Max retries for blockchain node requests */
export const NODE_MAX_RETRIES = 3;

/** Base delay between retries (ms) — doubled each attempt */
export const NODE_RETRY_BASE_DELAY_MS = 500;
