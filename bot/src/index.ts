// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Entry Point — DecentralChain Airdrop Telegram Bot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { logger } from './utils/logger';
import { connectRedis, disconnectRedis, getRedis } from './utils/redis';
import prisma from './db/prisma';
import { createBot } from './bot';
import { startEligibilityRefreshJob, startLockFinalizationJob, startDepositWatcherJob } from './jobs';
import { createServer } from 'http';

async function main(): Promise<void> {
  logger.info('Starting DCC Airdrop Bot...');

  // 1. Connect Redis
  await connectRedis();

  // 2. Verify database connectivity
  await prisma.$connect();
  logger.info('Database connected');

  // 3. Create and start the bot
  const bot = createBot();

  // Set bot commands for the menu
  await bot.api.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'eligibility', description: 'Check your eligibility' },
    { command: 'airdrop', description: 'View your airdrop allocation' },
    { command: 'referrals', description: 'Referral menu' },
    { command: 'claim', description: 'Check claim status' },
    { command: 'buy', description: 'Buy DCC with SOL/USDC/USDT' },
    { command: 'lock', description: 'Lock DCC for 3% daily rewards' },
    { command: 'redeem', description: 'Redeem off-chain DCC to wallet' },
    { command: 'stake', description: 'Stake DCC for stDCC rewards' },
    { command: 'liquidity', description: 'Add liquidity to LP pools' },
    { command: 'help', description: 'Help & FAQ' },
  ]);

  // 4. Start background jobs
  startEligibilityRefreshJob();
  startLockFinalizationJob();
  startDepositWatcherJob();

  // 5. Start bot in polling mode
  logger.info('Bot starting in polling mode...');

  // Force-clear any competing getUpdates session
  await bot.api.deleteWebhook({ drop_pending_updates: true });

  bot.start({
    drop_pending_updates: true,
    onStart: (botInfo) => {
      logger.info({ username: botInfo.username }, 'Bot is running');
    },
  });

  // 6. Health-check HTTP endpoint
  const healthPort = parseInt(process.env.HEALTH_PORT ?? '8080', 10);
  const server = createServer(async (req, res) => {
    if (req.url === '/health') {
      try {
        await prisma.$queryRaw`SELECT 1`;
        const redis = getRedis();
        await redis.ping();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'unhealthy' }));
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(healthPort, () => logger.info({ port: healthPort }, 'Health endpoint ready'));

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down...');

    // Force exit after 10 seconds if graceful shutdown hangs
    const forceTimer = setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
    forceTimer.unref();

    try {
      bot.stop();
      server.close();
      await Promise.all([
        prisma.$disconnect(),
        disconnectRedis(),
      ]);
      logger.info('Clean shutdown complete');
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start bot');
  process.exit(1);
});
