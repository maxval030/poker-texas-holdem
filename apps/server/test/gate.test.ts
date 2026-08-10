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

beforeAll(async () => {
  await connectValkey()
})

afterAll(async () => {
  const keys = await getPublisher().keys('holdem:gate:*')
  if (keys.length > 0) await getPublisher().del(...keys)
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
