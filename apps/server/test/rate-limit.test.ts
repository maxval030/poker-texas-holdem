import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { connectValkey, getPublisher } from '../src/valkey.ts'
import { hitRateLimit } from '../src/rate-limit/limit.ts'

const TEST_KEY = 'test:rate-limit'

beforeAll(async () => {
  await connectValkey()
})

afterAll(async () => {
  await getPublisher().del(`holdem:rl:${TEST_KEY}`)
})

describe('hitRateLimit', () => {
  test('allows requests up to the limit', async () => {
    const limit = 3
    for (let i = 0; i < limit; i++) {
      const result = await hitRateLimit(`${TEST_KEY}:allow`, limit, 60)
      expect(result.limited).toBe(false)
    }
  })

  test('blocks once the limit is exceeded', async () => {
    const limit = 2
    const key = `${TEST_KEY}:block`
    await getPublisher().del(`holdem:rl:${key}`)

    expect((await hitRateLimit(key, limit, 60)).limited).toBe(false)
    expect((await hitRateLimit(key, limit, 60)).limited).toBe(false)
    expect((await hitRateLimit(key, limit, 60)).limited).toBe(true)
  })
})
