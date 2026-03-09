<div align="center">

# DecentralChain Airdrop Platform

**A full-stack airdrop ecosystem for the [DecentralChain](https://decentralchain.io) blockchain — on-chain eligibility tracking, Telegram bot, DCC token economy, and multi-tier referral system.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![RIDE V5](https://img.shields.io/badge/RIDE-V5-8B5CF6)](https://docs.waves.tech/en/ride/)
[![grammY](https://img.shields.io/badge/grammY-1.21-26A5E4?logo=telegram&logoColor=white)](https://grammy.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-5.10-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Features](#features) · [Architecture](#architecture) · [Quick Start](#quick-start) · [Smart Contract](#smart-contract) · [Bot Commands](#bot-commands) · [Deployment](#deployment)

</div>

---

## Overview

A production-grade airdrop platform built for the DecentralChain blockchain ecosystem. The system combines an on-chain RIDE V5 smart contract for tamper-proof eligibility tracking with a feature-rich Telegram bot that lets users buy, lock, earn, refer, and redeem DCC tokens — all through an intuitive conversational interface.

### Why This Exists

Traditional airdrops are riddled with sybil attacks, manual verification bottlenecks, and poor user experience. This platform solves that with:

- **On-chain proof** — Eligibility criteria (swaps, LP, staking, wallet age) are tracked immutably on-chain
- **Automated wallets** — Users get auto-generated wallets with encrypted seed storage
- **Token economy** — Buy DCC → Lock for daily rewards → Compound earnings → Redeem on-chain
- **Viral growth** — 3-tier referral system with commission sharing drives organic adoption

---

## Features

### Token Economy
| Feature | Description |
|---------|-------------|
| **Buy DCC** | Purchase with SOL, USDC, or USDT via bridge integration ($0.15/DCC) |
| **Lock & Earn** | Lock DCC for 30 days, earn 3–5% daily rewards |
| **Boost Tiers** | More referrals = higher lock rates (up to 5%/day at 5,000+ referrals) |
| **Commissions** | Earn 10%/5%/2% of your referrals' lock earnings across 3 tiers |
| **Deposit** | One-tap on-chain → off-chain balance transfer |
| **Redeem** | Withdraw off-chain DCC to your on-chain wallet |

### Bot Features
| Feature | Description |
|---------|-------------|
| **Auto Wallets** | DecentralChain wallets generated on signup with AES-256-GCM encrypted seeds |
| **Eligibility Checker** | Real-time on-chain eligibility status with progress tracking |
| **Referral System** | Deep-link invites, network tree visualization, leaderboard |
| **Transaction History** | Paginated unified log of all operations |
| **Admin Dashboard** | Real-time stats, user lookup, wallet sync, campaign controls |
| **Portfolio Display** | USD valuations alongside DCC balances |

### Infrastructure
| Feature | Description |
|---------|-------------|
| **Consolidated Balance** | Single cached balance service with Redis (30s TTL) |
| **Background Jobs** | Eligibility refresh (batched), lock finalization (every 5 min) |
| **Rate Limiting** | Global + per-action Redis-backed rate limiters |
| **Health Check** | HTTP `/health` endpoint checking Postgres + Redis |
| **Graceful Shutdown** | Clean disconnect with 10s timeout safety net |
| **Structured Logging** | pino JSON logging in production, pretty-print in dev |
| **Distributed Locks** | Redis-backed locks prevent race conditions on deposits/redeems |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Telegram Users                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  grammY Bot  │  ← Polling mode
                    │  (Node.js)   │
                    └──┬───┬───┬──┘
                       │   │   │
          ┌────────────┘   │   └────────────┐
          │                │                │
   ┌──────▼──────┐  ┌─────▼─────┐  ┌───────▼───────┐
   │  PostgreSQL  │  │   Redis   │  │  DecentralChain│
   │  (13 models) │  │  (cache,  │  │   Mainnet      │
   │              │  │  sessions,│  │   (RIDE V5)    │
   │              │  │  locks)   │  │                │
   └──────────────┘  └───────────┘  └────────────────┘
```

### Project Structure

```
├── EligibilityTracker.ride    # On-chain RIDE V5 smart contract (377 lines)
├── deploy-contract.js         # Contract deployment script
├── docker-compose.yml         # Production Docker stack
├── bot/                       # Telegram bot application
│   ├── src/
│   │   ├── index.ts           # Entry point + health endpoint
│   │   ├── config/            # Zod-validated environment config
│   │   ├── db/                # Prisma client singleton
│   │   ├── bot/
│   │   │   ├── index.ts       # Bot factory — routes & middleware
│   │   │   ├── middleware/    # Auth, rate limit, sessions, errors
│   │   │   ├── handlers/     # Feature handlers (10 modules)
│   │   │   ├── keyboards/    # Inline keyboard layouts
│   │   │   ├── messages/     # Message templates
│   │   │   ├── commands/     # /start with referral deep links
│   │   │   └── utils.ts      # Shared bot utilities
│   │   ├── services/
│   │   │   ├── blockchain/   # DecentralChain RPC adapter
│   │   │   ├── balance/      # Consolidated balance with caching
│   │   │   ├── locks/        # Lock lifecycle + boost tiers
│   │   │   ├── purchases/    # DCC purchase tracking
│   │   │   ├── referrals/    # Multi-tier referral engine
│   │   │   ├── deposit/      # On-chain → off-chain deposits
│   │   │   ├── bridge/       # SOL/USDC/USDT → DCC bridge
│   │   │   ├── transfer/     # DCC transfer service
│   │   │   ├── wallet/       # Auto-wallet generation + encryption
│   │   │   ├── eligibility/  # On-chain eligibility evaluator
│   │   │   ├── allocation/   # Airdrop amount calculator
│   │   │   └── claims/       # Claim status tracking
│   │   ├── jobs/             # Background cron (eligibility, locks)
│   │   ├── utils/            # Logger, Redis, validation, audit
│   │   └── types/            # Shared TypeScript interfaces
│   └── prisma/
│       ├── schema.prisma     # 13 models
│       └── migrations/       # Version-controlled migrations
```

### Data Models

The bot uses **13 Prisma models** to track the complete user lifecycle:

| Model | Purpose |
|-------|---------|
| `User` | Telegram users with referral codes |
| `Wallet` | Auto-generated wallets (AES-256-GCM encrypted seeds) |
| `EligibilitySnapshot` | Cached on-chain eligibility state |
| `ReferralEvent` | 3-tier referral relationships |
| `ReferralReward` | Referral bonus tracking |
| `InviteReward` | Instant 1 DCC invite rewards |
| `DccPurchase` | SOL/USDC/USDT → DCC purchases |
| `DccLock` | 30-day locks with daily earnings |
| `LockReferralReward` | Commission from referral lock earnings |
| `DccDeposit` | On-chain → off-chain deposit records |
| `ClaimRecord` | Airdrop claim tracking |
| `CampaignConfig` | Admin-configurable campaign settings |
| `AuditLog` | Complete audit trail |

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** 16+
- **Redis** 7+
- **Telegram Bot Token** from [@BotFather](https://t.me/BotFather)

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/dylanpersonguy/dcc-airdrop.git
cd dcc-airdrop

# 2. Set up environment
cp bot/.env.example bot/.env
# Edit bot/.env with your values (see Configuration section)

# 3. Install dependencies
cd bot && npm install

# 4. Set up the database
npx prisma migrate dev
npx prisma generate

# 5. Start the bot
npm run dev:watch
```

### Docker Deployment

```bash
# 1. Clone and configure
git clone https://github.com/dylanpersonguy/dcc-airdrop.git
cd dcc-airdrop

# 2. Set up environment files
cp .env.example .env
cp bot/.env.example bot/.env
# Edit both .env files with production values

# 3. Deploy
docker compose up --build -d

# 4. Verify
docker compose ps
curl http://localhost:8080/health  # → {"status":"ok"}
```

---

## Configuration

### Root `.env` (Docker Compose)

| Variable | Description | Required |
|----------|-------------|----------|
| `POSTGRES_USER` | PostgreSQL username | Yes |
| `POSTGRES_PASSWORD` | PostgreSQL password | Yes |
| `POSTGRES_DB` | Database name | Yes |

### Bot `.env`

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from BotFather | — |
| `BOT_USERNAME` | Bot username (without @) | — |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `REDIS_URL` | Redis connection string | — |
| `DCC_NODE_URL` | DecentralChain node RPC URL | — |
| `WALLET_ENCRYPTION_SECRET` | AES-256-GCM key (min 16 chars) | — |
| `REWARDS_WALLET_SEED` | Rewards wallet seed phrase | — |
| `ADMIN_TELEGRAM_IDS` | Comma-separated admin user IDs | — |
| `BASE_AIRDROP_AMOUNT` | Base airdrop amount per user | `1000` |
| `REFERRAL_TIER1_BONUS` | Tier 1 referral bonus | `50` |
| `REFERRAL_TIER2_BONUS` | Tier 2 referral bonus | `25` |
| `REFERRAL_TIER3_BONUS` | Tier 3 referral bonus | `10` |
| `LOG_LEVEL` | Logging level | `info` |

> See [`bot/.env.example`](bot/.env.example) for the complete list with descriptions.

---

## Smart Contract

The [`EligibilityTracker.ride`](EligibilityTracker.ride) contract (RIDE V5, 377 lines) provides tamper-proof on-chain eligibility tracking.

### Tracked Criteria

| Criterion | Key Pattern | Threshold |
|-----------|-------------|-----------|
| Swap count | `user:<addr>:swapCount` | ≥ 2 qualifying swaps |
| Pool participation | `user:<addr>:poolCount` | ≥ 2 unique pools |
| dApp interaction | `user:<addr>:dappCount` | ≥ 2 unique dApps |
| LP duration | `user:<addr>:firstLpHeight` | ≥ 7 days active LP |
| Wallet age | `user:<addr>:walletAgeOk` | ≥ 21 days old |
| Transaction count | `user:<addr>:txCountOk` | ≥ 5 on-chain txs |
| Sybil check | `user:<addr>:sybilFlag` | Must be `false` |
| stDCC balance | Checked by AirdropClaim | ≥ minimum threshold |

### Access Control

- **Admins** — Manage roles, allow-list dApps, set user flags
- **Allowed dApps** — Record swaps, LP events, staking
- **Updaters** — Set wallet age, tx count, sybil flags
- **Verifier** — Standard `sigVerify` for account security

### Deploying the Contract

```bash
DEPLOYER_SEED="your seed phrase" node deploy-contract.js
```

---

## Bot Commands

### User Commands
| Command | Description |
|---------|-------------|
| `/start` | Start bot, auto-generate wallet, process referral deep links |
| `/buy` | Purchase DCC with SOL, USDC, or USDT |
| `/lock` | Lock DCC for 30 days with daily rewards |
| `/deposit` | Transfer on-chain DCC to off-chain balance |
| `/redeem` | Withdraw off-chain DCC to your wallet |
| `/referrals` | View referral link, stats, network tree, leaderboard |
| `/eligibility` | Check on-chain eligibility status |
| `/airdrop` | View estimated airdrop allocation |
| `/claim` | Check airdrop claim status |
| `/help` | FAQ and support topics |

### Admin Commands
| Command | Description |
|---------|-------------|
| `/admin` | Admin dashboard with live stats |
| `/admin_stats` | Detailed platform statistics |
| `/admin_referrals` | Global referral analytics |
| `/admin_user <id>` | Look up specific user |
| `/admin_sync_wallet <addr>` | Force-refresh wallet cache |

---

## Lock & Earn System

### Boost Tiers

Lock rate increases with referral count:

| Referrals | Daily Rate |
|-----------|------------|
| 0+ | 3.0% |
| 10+ | 3.2% |
| 30+ | 3.4% |
| 60+ | 3.6% |
| 100+ | 3.8% |
| 500+ | 4.0% |
| 1,000+ | 4.2% |
| 2,000+ | 4.5% |
| 5,000+ | 5.0% |

### Commission Structure

Earn from your referrals' lock earnings:

| Tier | Commission | Scope |
|------|-----------|-------|
| Tier 1 | 10% | Direct referrals |
| Tier 2 | 5% | Referrals of referrals |
| Tier 3 | 2% | Third level |

---

## Security

- **Wallet Encryption** — Seed phrases encrypted at rest with AES-256-GCM using scrypt-derived keys
- **Distributed Locks** — Redis-based locks prevent race conditions on financial operations
- **Rate Limiting** — Global + per-action rate limiters prevent abuse
- **Input Validation** — Zod schemas validate all config; addresses and amounts validated at boundaries
- **Redeem Safety** — Mark-before-send with idempotency keys; automatic rollback on failure
- **On-chain Access Control** — Role-based allow lists (admin, dApp, updater) in the RIDE contract
- **Audit Trail** — Every financial operation logged to `AuditLog` table

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Smart Contract** | RIDE V5 (DecentralChain) |
| **Bot Framework** | [grammY](https://grammy.dev/) (TypeScript) |
| **Runtime** | Node.js ≥ 18 |
| **Database** | PostgreSQL 16 + Prisma ORM |
| **Cache** | Redis 7 (ioredis) |
| **Blockchain** | [@waves/waves-transactions](https://github.com/wavesplatform/waves-transactions) |
| **Validation** | Zod |
| **Logging** | pino (JSON structured) |
| **Containerization** | Docker + Docker Compose |

---

## Development

```bash
# Type check
cd bot && npm run typecheck

# Build
npm run build

# Database management
npx prisma studio        # Visual DB browser
npx prisma migrate dev   # Create migration
npx prisma generate      # Regenerate client

# Logs (Docker)
docker compose logs bot -f
```

---

## License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">
<sub>Built for the <a href="https://decentralchain.io">DecentralChain</a> ecosystem</sub>
</div>
