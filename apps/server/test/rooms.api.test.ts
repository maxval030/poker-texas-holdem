import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client.ts'
import { room, user } from '../src/db/schema.ts'
import { createRoom, findOpenRoomByCode, publicRoom } from '../src/rooms/service.ts'
import { connectValkey, consumeWsTicket, issueWsTicket } from '../src/valkey.ts'

const HOST_ID = 'test-host-user'

beforeAll(async () => {
  await connectValkey()
  await db
    .insert(user)
    .values({
      id: HOST_ID,
      name: 'Host',
      email: 'host@test.local',
      emailVerified: true,
      isAnonymous: false,
    })
    .onConflictDoNothing()
})

afterAll(async () => {
  await db.delete(room).where(eq(room.hostUserId, HOST_ID))
  await db.delete(user).where(eq(user.id, HOST_ID))
  // kept alive across files
})

describe('room service', () => {
  test('creates a room with a public invite code and cash config', async () => {
    const created = await createRoom(HOST_ID, {
      smallBlind: 25,
      bigBlind: 50,
      minBuyIn: 2_000,
      maxBuyIn: 10_000,
      actionClockMs: 30_000,
      rebuy: { kind: 'unlimited' },
    })

    expect(created.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(created.status).toBe('created')
    expect(created.config.bigBlind).toBe(50)

    const found = await findOpenRoomByCode(created.code)
    expect(publicRoom(found).id).toBe(created.id)
  })

  test('rejects a max buy-in below the minimum', async () => {
    await expect(
      createRoom(HOST_ID, {
        smallBlind: 25,
        bigBlind: 50,
        minBuyIn: 5_000,
        maxBuyIn: 1_000,
        actionClockMs: 30_000,
        rebuy: { kind: 'none' },
      }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe('ws tickets', () => {
  test('are single use', async () => {
    const ticket = await issueWsTicket({ userId: 'u1', roomId: 'r1' })
    expect(await consumeWsTicket(ticket)).toEqual({ userId: 'u1', roomId: 'r1' })
    expect(await consumeWsTicket(ticket)).toBeNull()
  })
})
