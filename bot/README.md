# DecentralChain Airdrop Telegram Bot

Production-grade Telegram bot for the DecentralChain airdrop campaign. Reads eligibility data from the on-chain `EligibilityTracker` smart contract and provides users a polished interface to check eligibility, view allocations, manage referrals, and track claim status.

## Architecture

```
src/
  index.ts                  # Entry point
  config/                   # Typed env config with zod validation
  db/prisma.ts              # Prisma client singleton
  types/                    # Shared TypeScript interfaces
  utils/
    logger.ts               # pino structured logging
    redis.ts                # Redis client (cache, sessions, rate limits)
    validation.ts           # Address & input validation
    audit.ts                # Audit log helper
  services/
    blockchain/             # DecentralChain RPC adapter (all on-chain reads)
    eligibility/            # Evaluates eligibility requirements
    allocation/             # Computes estimated airdrop amounts
    referrals/              # Referral lifecycle & rewards
    verification/           # Wallet ownership proof (data-tx challenge)
    claims/                 # Claim status & recording
    users/                  # User account management
  bot/
    index.ts                # Bot factory — wires commands, handlers, middleware
    middleware/             # User hydration, rate limits, admin guard, logging
    keyboards/              # Inline keyboard layouts
    messages/               # Message templates
    commands/
      start.ts              # /start with deep-link referral capture
    handlers/
      wallet.ts             # Connect / verify wallet flow
      eligibility.ts        # My eligibility checklist
      referrals.ts          # Referral link, stats, rewards, rules
      claim.ts              # Claim status display
      help.ts               # FAQ / help topics
      admin.ts              # Admin-only commands
  jobs/                     # Cron jobs (eligibility refresh)
```

## Setup

### Prerequisites

- Node.js ≥ 18
- PostgreSQL
- Redis
- A Telegram bot token (from @BotFather)

### Install

```bash
cd bot
npm install
```

### Database

```bash
# Generate Prisma client
npx prisma generate

# Run migrations (creates all tables)
npx prisma migrate dev --name init

# Optional: open Prisma Studio
npx prisma studio
```

### Environment

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

Key values to set:
- `TELEGRAM_BOT_TOKEN` — from @BotFather
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `DCC_NODE_URL` — DecentralChain node REST API
- `ELIGIBILITY_TRACKER_ADDRESS` — deployed EligibilityTracker contract address
- `AIRDROP_CLAIM_ADDRESS` — deployed AirdropClaim contract address
- `STDCC_ASSET_ID` — stDCC token asset ID
- `ADMIN_TELEGRAM_IDS` — comma-separated admin Telegram user IDs

### Run

```bash
# Development (ts-node)
npm run dev

# Production
npm run build
npm start
```

The bot starts in **polling mode** by default. For webhook mode, modify `src/index.ts` to use `bot.api.setWebhook()` and an Express/Fastify server.

## How Eligibility Is Computed

The bot reads from the `EligibilityTracker` smart contract state using the DecentralChain node REST API. For each wallet, it fetches all `user:<addr>:*` keys in a single batch request.

**Requirements checked:**

| Requirement | Source | Rule |
|---|---|---|
| Wallet age ≥ 21 days | `walletAgeOk` flag (set by updater bot) | Boolean |
| 5+ transactions | `txCountOk` flag (set by updater bot) | Boolean |
| 100+ stDCC held | Live balance from node API | `balance ≥ MIN_STDCC_BALANCE` |
| 2+ pools joined | `poolCount` from tracker | `poolCount ≥ 2` |
| Currently providing LP | `hasCurrentLp` from tracker | Boolean |
| LP held 7+ days | `firstLpHeight` from tracker | `currentHeight - firstLpHeight ≥ MIN_LP_AGE_BLOCKS` |
| 2+ swaps | `swapCount` from tracker | `swapCount ≥ 2` |
| 2+ dApps used | `dappCount` from tracker | `dappCount ≥ 2` |
| Not sybil-flagged | `sybilFlag` from tracker | Must be `false` |
| Not already claimed | `claimed` from tracker | Must be `false` |

A user is **eligible** when ALL requirements are met.

## How Referrals Are Counted

### Lifecycle

1. New user clicks referral link (`/start <code>`) → `PENDING`
2. Referred user connects wallet → `WALLET_CONNECTED`
3. Referred user verifies wallet → `WALLET_VERIFIED`
4. Referred user becomes eligible → `ELIGIBLE` (reward credited)
5. Reward distributed → `REWARDED`

### Anti-abuse

- Self-referrals blocked
- Each user can only be referred once
- Same wallet can't be referred by different accounts
- Referral reward cap per user (`MAX_REFERRAL_REWARDS`)
- Suspicious patterns flagged in audit logs

## Allocation Modes

Configured via `ALLOCATION_MODE` env var:

- **`fixed`** — all eligible users get `BASE_AIRDROP_AMOUNT`
- **`score_based`** — allocation scaled by activity score (pools, swaps, dApps, staking, balance)
- **`base_plus_referral`** — base amount + bonus per eligible referral

## Wallet Verification

Users prove wallet ownership by sending a **Data Transaction** from their wallet containing:
- Key: `dcc-airdrop-verify`
- Value: `<unique challenge string>`

The challenge is unique per user session, expires after `CHALLENGE_EXPIRY_MINUTES`, and is verified by checking recent transactions from the wallet via the node API.

## Security Considerations

### Trusted On-Chain
- EligibilityTracker state (pools, swaps, dApps, flags)
- Wallet balances (stDCC)
- Claim status

### Trusted Off-Chain
- Wallet verification challenges (stored in DB, verified on-chain)
- Referral relationships (DB)
- Admin role list (env config)

### Risks
- **Weak wallet verification**: If someone can observe the challenge and front-run the data transaction, they could hijack verification. Mitigation: challenges are scoped to individual users and expire quickly.
- **Premature referral finalization**: Referral rewards only credited after referred user reaches `ELIGIBLE` status, preventing referral spam.
- **Stale cache**: Cached blockchain data may be up to 2 minutes old. The eligibility refresh job runs every 30 minutes. Users see provisional estimates.
- **Admin key compromise**: Admin commands are restricted by Telegram user ID allowlist. Use unique IDs and keep the env file secure.

## Next Steps for Claim Integration

1. Deploy the `AirdropClaim` smart contract
2. Add the claim contract address to `AIRDROP_CLAIM_ADDRESS`
3. Set `CLAIM_LIVE=true` or use `/admin_set_claim_live true`
4. The bot will automatically show claim instructions to eligible users
5. After users claim on-chain, the eligibility refresh job will detect `claimed = true` and update the UI
6. Optionally add a webhook callback from the claim contract to record `ClaimRecord` entries in real-time
