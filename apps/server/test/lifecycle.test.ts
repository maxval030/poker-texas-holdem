import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client.ts'
import { room, user } from '../src/db/schema.ts'
import {
  IDLE_NO_ACTION_MS,
  ROOM_MAX_LIFETIME_MS,
  runJanitorPass,
  teardownRoom,
} from '../src/rooms/lifecycle.ts'
import {
  assertCanCreateRoom,
  closeRoomAsHost,
  countOpenRoomsForHost,
  createRoom,
} from '../src/rooms/service.ts'
import { MAX_OPEN_ROOMS_GUEST } from '../src/rooms/constants.ts'
import { connectValkey, getPublisher } from '../src/valkey.ts'

const HOST_ID = 'lifecycle-host-2'
const OTHER_ID = 'lifecycle-other'

beforeAll(async () => {
  await connectValkey()
  for (const id of [HOST_ID, OTHER_ID]) {
    await db
      .insert(user)
      .values({
        id,
        name: 'Life',
        email: `${id}@test.local`,
        emailVerified: true,
        isAnonymous: id === HOST_ID,
      })
      .onConflictDoNothing()
  }
})

afterAll(async () => {
  await db.delete(room).where(eq(room.hostUserId, HOST_ID))
  await db.delete(user).where(eq(user.id, HOST_ID))
  await db.delete(user).where(eq(user.id, OTHER_ID))
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
    }, true)

    await getPublisher().set(`room:${created.id}:state`, '{}', 'EX', 30)
    await teardownRoom(created.id, 'test')

    const [row] = await db.select().from(room).where(eq(room.id, created.id)).limit(1)
    expect(row?.status).toBe('closed')
    expect(row?.closedAt).toBeTruthy()
    expect(await getPublisher().exists(`room:${created.id}:state`)).toBe(0)
  })

  test('janitor closes idle and expired rooms', async () => {
    const created = await createRoom(HOST_ID, {
      smallBlind: 25,
      bigBlind: 50,
      minBuyIn: 2_000,
      maxBuyIn: 10_000,
      actionClockMs: 30_000,
      rebuy: { kind: 'unlimited' },
    }, true)

    await db
      .update(room)
      .set({
        status: 'active',
        lastHumanActionAt: new Date(Date.now() - IDLE_NO_ACTION_MS - 1_000),
        createdAt: new Date(Date.now() - ROOM_MAX_LIFETIME_MS - 1_000),
      })
      .where(eq(room.id, created.id))

    await getPublisher().del('holdem:janitor')
    const closed = await runJanitorPass()
    expect(closed).toBeGreaterThanOrEqual(1)

    const [row] = await db.select().from(room).where(eq(room.id, created.id)).limit(1)
    expect(row?.status).toBe('closed')
  })
})

describe('room limits and host close', () => {
  test('limits concurrent guest rooms', async () => {
    const ids: string[] = []
    for (let i = 0; i < MAX_OPEN_ROOMS_GUEST; i++) {
      const created = await createRoom(
        HOST_ID,
        {
          smallBlind: 25,
          bigBlind: 50,
          minBuyIn: 2_000,
          maxBuyIn: 10_000,
          actionClockMs: 30_000,
          rebuy: { kind: 'unlimited' },
        },
        true,
      )
      ids.push(created.id)
    }

    expect(await countOpenRoomsForHost(HOST_ID)).toBe(MAX_OPEN_ROOMS_GUEST)
    await expect(assertCanCreateRoom(HOST_ID, true)).rejects.toMatchObject({ status: 429 })

    await teardownRoom(ids[0]!, 'test')
    await expect(assertCanCreateRoom(HOST_ID, true)).resolves.toBeUndefined()

    for (const id of ids.slice(1)) {
      await teardownRoom(id, 'test')
    }
  })

  test('only host can close a room', async () => {
    const created = await createRoom(
      HOST_ID,
      {
        smallBlind: 25,
        bigBlind: 50,
        minBuyIn: 2_000,
        maxBuyIn: 10_000,
        actionClockMs: 30_000,
        rebuy: { kind: 'unlimited' },
      },
      true,
    )

    await expect(closeRoomAsHost(created.id, OTHER_ID)).rejects.toMatchObject({ status: 403 })
    await closeRoomAsHost(created.id, HOST_ID)

    const [row] = await db.select().from(room).where(eq(room.id, created.id)).limit(1)
    expect(row?.status).toBe('closed')
  })
})
