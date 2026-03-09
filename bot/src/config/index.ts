// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Config Loader — Validated environment config
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  BOT_USERNAME: z.string().min(1),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().min(1),

  // DecentralChain
  DCC_NODE_URL: z.string().url(),
  DCC_CHAIN_ID: z.string().length(1).default('D'),

  // Contract addresses
  ELIGIBILITY_TRACKER_ADDRESS: z.string().min(1),
  AIRDROP_CLAIM_ADDRESS: z.string().min(1),
  STDCC_ASSET_ID: z.string().min(1),

  // Admin
  ADMIN_TELEGRAM_IDS: z.string().transform((val) =>
    val.split(',').map((id) => BigInt(id.trim()))
  ),

  // Campaign
  BASE_AIRDROP_AMOUNT: z.string().transform(Number).pipe(z.number().positive()),
  ALLOCATION_MODE: z.enum(['fixed', 'score_based', 'base_plus_referral']).default('base_plus_referral'),

  // Multi-level referral tiers
  REFERRAL_MAX_DEPTH: z.string().transform(Number).pipe(z.number().int().min(1).max(10)).default('3'),
  REFERRAL_TIER1_BONUS: z.string().transform(Number).pipe(z.number().nonnegative()),
  REFERRAL_TIER2_BONUS: z.string().transform(Number).pipe(z.number().nonnegative()).default('0'),
  REFERRAL_TIER3_BONUS: z.string().transform(Number).pipe(z.number().nonnegative()).default('0'),
  MAX_REFERRAL_REWARDS_PER_TIER: z.string().transform(Number).pipe(z.number().nonnegative()).default('50'),

  // Claim
  CLAIM_LIVE: z.string().transform((v) => v === 'true').default('false'),

  // Verification
  CHALLENGE_EXPIRY_MINUTES: z.string().transform(Number).pipe(z.number().positive()).default('30'),
  VERIFICATION_METHOD: z.enum(['transfer_memo', 'signed_message']).default('transfer_memo'),

  // Wallet encryption
  WALLET_ENCRYPTION_SECRET: z.string().min(16),

  // Rewards wallet seed (used to send instant invite rewards)
  REWARDS_WALLET_SEED: z.string().min(1),

  // Bridge API (SOL-Gateway-DCC)
  BRIDGE_API_URL: z.string().url().default('http://localhost:3000/api/v1'),

  // Rate Limits
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).pipe(z.number().positive()).default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).pipe(z.number().positive()).default('30'),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Blockchain
  BLOCK_TIME_SECONDS: z.string().transform(Number).pipe(z.number().positive()).default('60'),
  MIN_LP_AGE_BLOCKS: z.string().transform(Number).pipe(z.number().positive()).default('10080'),
  MIN_STDCC_BALANCE: z.string().transform(Number).pipe(z.number().nonnegative()).default('10000000000'),
});

export type Config = z.infer<typeof configSchema>;

let _config: Config | null = null;

export function loadConfig(): Config {
  if (_config) return _config;
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment configuration:');
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  _config = parsed.data;
  return _config;
}

export const config = loadConfig();
