// @ts-ignore - ESM interop
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

// Redis is optional - workers won't run without it
// @ts-ignore - ESM interop
export const redis: any = redisUrl
  // @ts-ignore - ESM interop
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
  : null;

if (redis) {
  redis.on('error', (err: Error) => {
    console.error('Redis connection error:', err);
  });

  redis.on('connect', () => {
    console.log('Redis connected');
  });
} else {
  console.log('Redis not configured - workers will be disabled');
}

export default redis;
