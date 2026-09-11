import IORedis from 'ioredis';
import { env } from './env';

/**
 * Shared IORedis connection for BullMQ and general caching.
 * Upstash requires TLS (rediss://) and maxRetriesPerRequest = null for BullMQ.
 */
export const redisConnection = new IORedis(env.REDIS_URL, {
  // Required by BullMQ — disables the per-request retry limit
  maxRetriesPerRequest: null,
  // Keep alive to avoid idle disconnects from Upstash
  enableReadyCheck: false,
  // Reconnect strategy
  retryStrategy(times: number) {
    if (times > 5) {
      console.error('❌ Redis: too many reconnect attempts, giving up.');
      return null;
    }
    const delay = Math.min(times * 200, 2000);
    console.warn(`⚠️  Redis: reconnecting in ${delay}ms (attempt ${times})`);
    return delay;
  },
});

redisConnection.on('connect', () => {
  console.log('✅ Redis (Upstash) connected successfully.');
});

redisConnection.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
});

export default redisConnection;
