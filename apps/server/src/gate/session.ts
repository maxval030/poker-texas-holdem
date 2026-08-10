import { getPublisher } from '../valkey.ts'
import { env } from '../env.ts'
import { isTurnstileEnabled } from './turnstile.ts'

export const GATE_COOKIE_NAME = 'holdem_gate'

const GATE_PREFIX = 'holdem:gate:'

function gateKey(id: string): string {
  return `${GATE_PREFIX}${id}`
}

export function gateCookieAttributes(maxAgeSeconds: number): string {
  const secure = env.betterAuthUrl.startsWith('https')
  const sameSite = secure ? 'SameSite=None' : 'SameSite=Lax'
  const secureFlag = secure ? '; Secure' : ''
  const partitioned = secure ? '; Partitioned' : ''
  return `Path=/; HttpOnly; Max-Age=${maxAgeSeconds}; ${sameSite}${secureFlag}${partitioned}`
}

export function parseGateCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === GATE_COOKIE_NAME) {
      const value = rest.join('=').trim()
      return value.length > 0 ? value : null
    }
  }
  return null
}

export async function createGateSession(): Promise<string> {
  const id = crypto.randomUUID()
  await getPublisher().set(gateKey(id), '1', 'EX', env.turnstile.gateTtlSeconds)
  return id
}

export async function isGateSessionValid(gateId: string | null): Promise<boolean> {
  if (!gateId) {
    return !isTurnstileEnabled()
  }
  const exists = await getPublisher().exists(gateKey(gateId))
  return exists === 1
}

export async function hasValidGate(headers: Headers): Promise<boolean> {
  const gateId = parseGateCookie(headers.get('cookie'))
  return isGateSessionValid(gateId)
}
