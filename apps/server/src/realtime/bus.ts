import type { GameEvent, TableState } from '@holdem/engine'
import type { ClientMessage } from '@holdem/protocol'
import { env } from '../env.ts'
import { getPublisher, getSubscriber } from '../valkey.ts'

let instanceId = process.env.INSTANCE_ID ?? crypto.randomUUID()

export function getInstanceId(): string {
  return instanceId
}

/** Test-only: two registries in one process need distinct identities. */
export function setInstanceIdForTests(id: string): void {
  instanceId = id
}

const OWNER_TTL_SECONDS = 15
const SNAPSHOT_TTL_SECONDS = 60

export type BusCommand = {
  kind: 'command'
  originId: string
  roomId: string
  userId: string
  name: string
  message: ClientMessage
}

export type BusEvent = {
  kind: 'event'
  originId: string
  roomId: string
  seq: number
  state: TableState
  /** Unredacted; each edge filters hole cards for its own sockets. */
  events: GameEvent[]
  serverTime: number
}

export type BusMessage = BusCommand | BusEvent

function ownerKey(roomId: string): string {
  return `room:${roomId}:owner`
}

function snapshotKey(roomId: string): string {
  return `room:${roomId}:state`
}

function channel(roomId: string): string {
  return `room:${roomId}:bus`
}

export async function tryAcquireOwnership(
  roomId: string,
  asInstance = getInstanceId(),
): Promise<boolean> {
  const result = await getPublisher().set(
    ownerKey(roomId),
    asInstance,
    'EX',
    OWNER_TTL_SECONDS,
    'NX',
  )
  return result === 'OK'
}

export async function refreshOwnership(
  roomId: string,
  asInstance = getInstanceId(),
): Promise<boolean> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("expire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `
  const result = await getPublisher().eval(
    script,
    1,
    ownerKey(roomId),
    asInstance,
    OWNER_TTL_SECONDS,
  )
  return result === 1
}

export async function releaseOwnership(
  roomId: string,
  asInstance = getInstanceId(),
): Promise<void> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `
  await getPublisher().eval(script, 1, ownerKey(roomId), asInstance)
}

export async function getOwner(roomId: string): Promise<string | null> {
  return getPublisher().get(ownerKey(roomId))
}

export async function saveSnapshot(roomId: string, state: TableState, seq: number): Promise<void> {
  await getPublisher().set(
    snapshotKey(roomId),
    JSON.stringify({ state, seq, savedAt: Date.now() }),
    'EX',
    SNAPSHOT_TTL_SECONDS,
  )
}

export async function loadSnapshot(
  roomId: string,
): Promise<{ state: TableState; seq: number } | null> {
  const raw = await getPublisher().get(snapshotKey(roomId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { state: TableState; seq: number }
    if (!parsed.state || typeof parsed.seq !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export async function deleteRoomKeys(roomId: string): Promise<void> {
  await getPublisher().del(ownerKey(roomId), snapshotKey(roomId))
}

export async function publish(roomId: string, message: BusMessage): Promise<void> {
  await getPublisher().publish(channel(roomId), JSON.stringify(message))
}

export async function subscribeRoom(
  roomId: string,
  onMessage: (message: BusMessage) => void,
): Promise<() => Promise<void>> {
  const topic = channel(roomId)
  const sub = getSubscriber()
  const handler = (channelName: string, payload: string) => {
    if (channelName !== topic) return
    try {
      onMessage(JSON.parse(payload) as BusMessage)
    } catch {
      // Drop malformed bus frames rather than taking down the subscriber.
    }
  }
  sub.on('message', handler)
  await sub.subscribe(topic)
  return async () => {
    sub.off('message', handler)
    await sub.unsubscribe(topic)
  }
}

export function describeInstance(): { id: string; webOrigin: string } {
  return { id: getInstanceId(), webOrigin: env.webOrigin }
}
