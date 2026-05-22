import Redis from 'ioredis'

const g = globalThis as any

export const redis: Redis =
  g._redis ||
  (g._redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
  }))
