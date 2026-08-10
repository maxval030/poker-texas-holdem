import { and, eq, inArray, lt, ne } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { room } from '../db/schema.ts'
import { deleteRoomKeys, getOwner } from '../realtime/bus.ts'
import { roomRegistry } from '../realtime/registry.ts'
import { getPublisher } from '../valkey.ts'

export const CREATED_EMPTY_MS = 2 * 60_000
export const DORMANT_CLOSE_MS = 5 * 60_000
export const JANITOR_INTERVAL_MS = 30_000
const JANITOR_LOCK_KEY = 'holdem:janitor'
const JANITOR_LOCK_TTL_SECONDS = 25

/**
 * Full teardown for one room: cancel local runtime, wipe Valkey keys, mark the
 * Postgres row closed. Safe to call when the room is only half-alive.
 */
export async function teardownRoom(roomId: string, reason: string): Promise<void> {
  await roomRegistry.dispose(roomId)
  await deleteRoomKeys(roomId)
  await db
    .update(room)
    .set({
      status: 'closed',
      closedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(room.id, roomId), ne(room.status, 'closed')))
  console.info(`room ${roomId} closed (${reason})`)
}

export async function markRoomDormant(roomId: string): Promise<void> {
  await db
    .update(room)
    .set({
      status: 'dormant',
      lastHumanAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(room.id, roomId), ne(room.status, 'closed')))
}

/**
 * Closes rooms that never got a player and rooms that sat empty too long.
 * Runs under a Valkey lock so only one instance janitors at a time.
 */
export async function runJanitorPass(): Promise<number> {
  const locked = await getPublisher().set(
    JANITOR_LOCK_KEY,
    '1',
    'EX',
    JANITOR_LOCK_TTL_SECONDS,
    'NX',
  )
  if (locked !== 'OK') return 0

  let closed = 0
  const now = Date.now()

  const createdStale = await db
    .select({ id: room.id })
    .from(room)
    .where(and(eq(room.status, 'created'), lt(room.createdAt, new Date(now - CREATED_EMPTY_MS))))

  for (const row of createdStale) {
    await teardownRoom(row.id, 'created timeout')
    closed += 1
  }

  const dormantStale = await db
    .select({ id: room.id })
    .from(room)
    .where(and(eq(room.status, 'dormant'), lt(room.lastHumanAt, new Date(now - DORMANT_CLOSE_MS))))

  for (const row of dormantStale) {
    await teardownRoom(row.id, 'dormant timeout')
    closed += 1
  }

  // Orphans: Postgres still says open, but no owner and no snapshot remain.
  const openRooms = await db
    .select({ id: room.id, status: room.status })
    .from(room)
    .where(inArray(room.status, ['created', 'active', 'dormant']))

  for (const row of openRooms) {
    if (row.status === 'created') continue
    const owner = await getOwner(row.id)
    if (owner) continue
    const snapshot = await getPublisher().exists(`room:${row.id}:state`)
    const live = roomRegistry.get(row.id)
    if (!live && snapshot === 0) {
      await teardownRoom(row.id, 'orphan')
      closed += 1
    }
  }

  return closed
}

export function startJanitor(): () => void {
  const id = setInterval(() => {
    void runJanitorPass().catch((error) => {
      console.error('janitor failed', error)
    })
  }, JANITOR_INTERVAL_MS)
  return () => clearInterval(id)
}
