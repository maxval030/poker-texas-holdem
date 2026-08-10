import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { connectValkey, getPublisher } from '../src/valkey.ts'
import {
  createGateSession,
  GATE_COOKIE_NAME,
  hasValidGate,
  isGateSessionValid,
  parseGateCookie,
} from '../src/gate/session.ts'
import { isTurnstileEnabled, verifyTurnstileToken } from '../src/gate/turnstile.ts'
import { hitRateLimit } from '../src/rate-limit/limit.ts'

beforeAll(async () => {
  await connectValkey()
})

afterAll(async () => {
  const publisher = getPublisher()
  const gateKeys = await publisher.keys('holdem:gate:*')
  if (gateKeys.length > 0) await publisher.del(...gateKeys)
  const rlKeys = await publisher.keys('holdem:rl:stats:online:*')
  if (rlKeys.length > 0) await publisher.del(...rlKeys)
})

describe('gate session', () => {
  test('creates a valid session and parses the cookie', async () => {
    const gateId = await createGateSession()
    const cookie = `${GATE_COOKIE_NAME}=${gateId}`
    expect(parseGateCookie(cookie)).toBe(gateId)
    expect(await isGateSessionValid(gateId)).toBe(true)
    expect(await hasValidGate(new Headers({ cookie }))).toBe(true)
  })

  test('allows missing cookie when turnstile is disabled', async () => {
    expect(isTurnstileEnabled()).toBe(false)
    expect(await hasValidGate(new Headers())).toBe(true)
  })
})

describe('turnstile verify', () => {
  test('passes dev-bypass when turnstile is disabled', async () => {
    const result = await verifyTurnstileToken('dev-bypass')
    expect(result.success).toBe(true)
  })
})

describe('stats rate limit keys', () => {
  test('tracks gate sessions independently', async () => {
    const gateA = await createGateSession()
    const gateB = await createGateSession()
    const scope = 'stats:online'
    const limit = 2

    expect((await hitRateLimit(`${scope}:${gateA}`, limit, 60)).limited).toBe(false)
    expect((await hitRateLimit(`${scope}:${gateA}`, limit, 60)).limited).toBe(false)
    expect((await hitRateLimit(`${scope}:${gateA}`, limit, 60)).limited).toBe(true)

    expect((await hitRateLimit(`${scope}:${gateB}`, limit, 60)).limited).toBe(false)
  })
})
