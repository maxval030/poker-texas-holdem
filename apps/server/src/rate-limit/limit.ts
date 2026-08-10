import { getPublisher } from '../valkey.ts'

const RATE_PREFIX = 'holdem:rl:'

export interface RateLimitResult {
  limited: boolean
  remaining: number
  retryAfterSeconds: number
}

/**
 * Fixed-window counter. Returns limited=true when count exceeds limit within
 * the window. Keys expire automatically after windowSeconds.
 */
export async function hitRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redisKey = `${RATE_PREFIX}${key}`
  const publisher = getPublisher()
  const count = await publisher.incr(redisKey)
  if (count === 1) {
    await publisher.expire(redisKey, windowSeconds)
  }

  const ttl = await publisher.ttl(redisKey)
  const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds

  return {
    limited: count > limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds,
  }
}
