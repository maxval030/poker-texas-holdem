import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client.ts'
import { room, user } from '../src/db/schema.ts'
import { CREATED_EMPTY_MS, runJanitorPass, teardownRoom } from '../src/rooms/lifecycle.ts'
import { createRoom } from '../src/rooms/service.ts'
import { connectValkey, getPublisher } from '../src/valkey.ts'

const HOST_ID = 'lifecycle-host'

beforeAll(async () => {
  await connectValkey()
  await db
    .insert(user)
    .values({
      id: HOST_ID,
      name: 'Life',
      email: 'life@test.local',
      emailVerified: true,
      isAnonymous: false,
    })
    .onConflictDoNothing()
})

afterAll(async () => {
  await db.delete(room).where(eq(room.hostUserId, HOST_ID))
  await db.delete(user).where(eq(user.id, HOST_ID))
})

describe('room lifecycle', () => {
  test('teardown marks the room closed and clears its keys', async () => {
    const created = await createRoom(HOST_ID, {
      smallBlind: 25,
      bigBlind: 50,
      minBuyIn: 2_000,
      maxBuyIn: 10_000,
      actionClockMs: 30_000,
      rebuy: { kind: 'unlimited' },
    })

    await getPublisher().set(`room:${created.id}:state`, '{}', 'EX', 30)
    await teardownRoom(created.id, 'test')

    const [row] = await db.select().from(room).where(eq(room.id, created.id)).limit(1)
    expect(row?.status).toBe('closed')
    expect(row?.closedAt).toBeTruthy()
    expect(await getPublisher().exists(`room:${created.id}:state`)).toBe(0)
  })

  test('janitor closes rooms that were created and then abandoned', async () => {
    const created = await createRoom(HOST_ID, {
      smallBlind: 25,
      bigBlind: 50,
      minBuyIn: 2_000,
      maxBuyIn: 10_000,
      actionClockMs: 30_000,
      rebuy: { kind: 'unlimited' },
    })

    await db
      .update(room)
      .set({ createdAt: new Date(Date.now() - CREATED_EMPTY_MS - 1_000) })
      .where(eq(room.id, created.id))

    // Ensure we hold the janitor lock.
    await getPublisher().del('holdem:janitor')
    const closed = await runJanitorPass()
    expect(closed).toBeGreaterThanOrEqual(1)

    const [row] = await db.select().from(room).where(eq(room.id, created.id)).limit(1)
    expect(row?.status).toBe('closed')
  })
})
