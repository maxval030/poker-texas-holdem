import Valkey from 'iovalkey'
import { env } from './env.ts'

/**
 * Two connections from day one: a publisher that issues commands and a
 * subscriber that only listens. Mixing them on one socket is what breaks
 * pub/sub under load, and the multi-instance work later needs both.
 */
function createPublisher(): Valkey {
  return new Valkey(env.valkeyUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  })
}

function createSubscriber(): Valkey {
  return new Valkey(env.valkeyUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  })
}

export let valkey = createPublisher()
export let valkeySub = createSubscriber()

export function getPublisher(): Valkey {
  return valkey
}

export function getSubscriber(): Valkey {
  return valkeySub
}

export async function connectValkey(): Promise<void> {
  if (valkey.status === 'end') valkey = createPublisher()
  if (valkeySub.status === 'end') valkeySub = createSubscriber()
  if (valkey.status === 'wait') await valkey.connect()
  if (valkeySub.status === 'wait') await valkeySub.connect()
}

export async function disconnectValkey(): Promise<void> {
  if (valkey.status !== 'end') await valkey.quit()
  if (valkeySub.status !== 'end') await valkeySub.quit()
}

const TICKET_PREFIX = 'ws-ticket:'
const TICKET_TTL_SECONDS = 30

export async function issueWsTicket(payload: { userId: string; roomId: string }): Promise<string> {
  const ticket = crypto.randomUUID()
  await getPublisher().set(
    `${TICKET_PREFIX}${ticket}`,
    JSON.stringify(payload),
    'EX',
    TICKET_TTL_SECONDS,
  )
  return ticket
}

/**
 * Atomic consume: a ticket is only good once, and only within its TTL. The
 * WebSocket upgrade path is the only caller.
 */
export async function consumeWsTicket(
  ticket: string,
): Promise<{ userId: string; roomId: string } | null> {
  const key = `${TICKET_PREFIX}${ticket}`
  const raw = await getPublisher().getdel(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { userId: string; roomId: string }
    if (typeof parsed.userId !== 'string' || typeof parsed.roomId !== 'string') return null
    return parsed
  } catch {
    return null
  }
}
