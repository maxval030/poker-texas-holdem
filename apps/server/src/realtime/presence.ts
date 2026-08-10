import { getPublisher } from '../valkey.ts'

const USERS_KEY = 'holdem:presence:users'
const ROOMS_KEY = 'holdem:presence:rooms'
const LEASE_PREFIX = 'holdem:presence:lease:'
const LEASE_TTL_SECONDS = 60
const REFRESH_INTERVAL_MS = 30_000

function roomUsersKey(roomId: string): string {
  return `holdem:presence:room:${roomId}`
}

function leaseKey(userId: string): string {
  return `${LEASE_PREFIX}${userId}`
}

export function presenceRefreshIntervalMs(): number {
  return REFRESH_INTERVAL_MS
}

export async function joinPresence(roomId: string, userId: string): Promise<void> {
  const publisher = getPublisher()
  await publisher
    .multi()
    .sadd(USERS_KEY, userId)
    .sadd(ROOMS_KEY, roomId)
    .sadd(roomUsersKey(roomId), userId)
    .set(leaseKey(userId), roomId, 'EX', LEASE_TTL_SECONDS)
    .exec()
}

export async function refreshPresence(userId: string): Promise<void> {
  await getPublisher().expire(leaseKey(userId), LEASE_TTL_SECONDS)
}

export async function leavePresence(roomId: string, userId: string): Promise<void> {
  const publisher = getPublisher()
  await publisher.srem(USERS_KEY, userId)
  await publisher.srem(roomUsersKey(roomId), userId)
  await publisher.del(leaseKey(userId))
  const remaining = await publisher.scard(roomUsersKey(roomId))
  if (remaining === 0) {
    await publisher.srem(ROOMS_KEY, roomId)
    await publisher.del(roomUsersKey(roomId))
  }
}

export async function clearRoomPresence(roomId: string): Promise<void> {
  const publisher = getPublisher()
  const members = await publisher.smembers(roomUsersKey(roomId))
  if (members.length > 0) {
    await publisher.srem(USERS_KEY, ...members)
  }
  await publisher.srem(ROOMS_KEY, roomId)
  await publisher.del(roomUsersKey(roomId))
  for (const userId of members) {
    await publisher.del(leaseKey(userId))
  }
}

async function pruneStalePresence(): Promise<void> {
  const publisher = getPublisher()
  const users = await publisher.smembers(USERS_KEY)
  for (const userId of users) {
    const alive = await publisher.exists(leaseKey(userId))
    if (alive === 0) {
      await publisher.srem(USERS_KEY, userId)
      const roomIds = await publisher.smembers(ROOMS_KEY)
      for (const roomId of roomIds) {
        await publisher.srem(roomUsersKey(roomId), userId)
        const count = await publisher.scard(roomUsersKey(roomId))
        if (count === 0) {
          await publisher.srem(ROOMS_KEY, roomId)
          await publisher.del(roomUsersKey(roomId))
        }
      }
    }
  }

  const rooms = await publisher.smembers(ROOMS_KEY)
  for (const roomId of rooms) {
    const count = await publisher.scard(roomUsersKey(roomId))
    if (count === 0) {
      await publisher.srem(ROOMS_KEY, roomId)
      await publisher.del(roomUsersKey(roomId))
    }
  }
}

export async function getOnlineStats(): Promise<{ rooms: number; players: number }> {
  await pruneStalePresence()
  const publisher = getPublisher()
  const [rooms, players] = await Promise.all([
    publisher.scard(ROOMS_KEY),
    publisher.scard(USERS_KEY),
  ])
  return { rooms, players }
}
