import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    _redis.on('error', (err) => logger.error({ err }, 'Redis error'));
  }
  return _redis;
}

export async function connectRedis(): Promise<void> {
  const redis = getRedis();
  await redis.connect();
  logger.info('Redis connected');
}

export async function disconnectRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
    logger.info('Redis disconnected');
  }
}
