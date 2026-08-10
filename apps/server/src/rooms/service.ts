import type { TableConfig } from '@holdem/engine'
import { and, count, eq, ne } from 'drizzle-orm'
import { db } from '../db/client.ts'
import {
  ACTION_CLOCK_OPTIONS_MS,
  type CreateRoomBody,
  type RoomStatus,
  room,
} from '../db/schema.ts'
import { generateRoomCode } from './codes.ts'
import { MAX_OPEN_ROOMS_GUEST, MAX_OPEN_ROOMS_REGISTERED } from './constants.ts'

const MAX_CODE_ATTEMPTS = 8

export class RoomError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function validateCreateBody(body: CreateRoomBody): TableConfig {
  const {
    smallBlind,
    bigBlind,
    ante = 0,
    minBuyIn,
    maxBuyIn,
    actionClockMs,
    rebuy,
    maxSeats = 9,
  } = body

  if (!Number.isInteger(smallBlind) || smallBlind <= 0) {
    throw new RoomError('smallBlind must be a positive integer', 400)
  }
  if (!Number.isInteger(bigBlind) || bigBlind < smallBlind * 2) {
    throw new RoomError('bigBlind must be at least twice the small blind', 400)
  }
  if (!Number.isInteger(ante) || ante < 0) {
    throw new RoomError('ante must be a non-negative integer', 400)
  }
  if (!Number.isInteger(minBuyIn) || minBuyIn < bigBlind * 20) {
    throw new RoomError('minBuyIn must be at least twenty big blinds', 400)
  }
  if (!Number.isInteger(maxBuyIn) || maxBuyIn < minBuyIn) {
    throw new RoomError('maxBuyIn must be at least minBuyIn', 400)
  }
  if (!(ACTION_CLOCK_OPTIONS_MS as readonly number[]).includes(actionClockMs)) {
    throw new RoomError('actionClockMs must be 15000, 20000, 30000, or 60000', 400)
  }
  if (!Number.isInteger(maxSeats) || maxSeats < 2 || maxSeats > 9) {
    throw new RoomError('maxSeats must be between 2 and 9', 400)
  }
  if (rebuy.kind === 'limited' && (!Number.isInteger(rebuy.maxRebuys) || rebuy.maxRebuys < 1)) {
    throw new RoomError('limited rebuy needs a positive maxRebuys', 400)
  }

  return {
    format: 'cash',
    maxSeats,
    smallBlind,
    bigBlind,
    ante,
    minBuyIn,
    maxBuyIn,
    actionClockMs,
    rebuy,
  }
}

export async function countOpenRoomsForHost(hostUserId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(room)
    .where(and(eq(room.hostUserId, hostUserId), ne(room.status, 'closed')))
  return Number(row?.total ?? 0)
}

export async function assertCanCreateRoom(hostUserId: string, isAnonymous: boolean): Promise<void> {
  const limit = isAnonymous ? MAX_OPEN_ROOMS_GUEST : MAX_OPEN_ROOMS_REGISTERED
  const open = await countOpenRoomsForHost(hostUserId)
  if (open >= limit) {
    throw new RoomError('too many open tables', 429)
  }
}

export async function createRoom(hostUserId: string, body: CreateRoomBody, isAnonymous = false) {
  await assertCanCreateRoom(hostUserId, isAnonymous)
  const config = validateCreateBody(body)
  const id = crypto.randomUUID()

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode()
    try {
      const [created] = await db
        .insert(room)
        .values({
          id,
          code,
          hostUserId,
          status: 'created',
          config,
        })
        .returning()
      if (!created) throw new RoomError('failed to create room', 500)
      return created
    } catch (error) {
      if (error instanceof RoomError) throw error
      // Unique violation on the invite code — try another.
      if (isUniqueViolation(error) && attempt + 1 < MAX_CODE_ATTEMPTS) continue
      throw error
    }
  }

  throw new RoomError('could not allocate an invite code', 500)
}

export async function findOpenRoomByCode(code: string) {
  const normalised = code.trim().toUpperCase()
  if (!/^[A-Z0-9]{4,8}$/.test(normalised)) {
    throw new RoomError('invalid room code', 400)
  }

  const [found] = await db
    .select()
    .from(room)
    .where(and(eq(room.code, normalised), ne(room.status, 'closed')))
    .limit(1)

  if (!found) throw new RoomError('room not found', 404)
  return found
}

export async function findOpenRoomById(id: string) {
  const [found] = await db
    .select()
    .from(room)
    .where(and(eq(room.id, id), ne(room.status, 'closed')))
    .limit(1)

  if (!found) throw new RoomError('room not found', 404)
  return found
}

export async function closeRoomAsHost(roomId: string, hostUserId: string): Promise<void> {
  const found = await findOpenRoomById(roomId)
  if (found.hostUserId !== hostUserId) {
    throw new RoomError('only the host can close this table', 403)
  }
  const { teardownRoom } = await import('./lifecycle.ts')
  await teardownRoom(roomId, 'host closed table')
}

export function publicRoom(row: typeof room.$inferSelect) {
  return {
    id: row.id,
    code: row.code,
    status: row.status as RoomStatus,
    config: row.config,
    hostUserId: row.hostUserId,
    createdAt: row.createdAt.toISOString(),
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  )
}
