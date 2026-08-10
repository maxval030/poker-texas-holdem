import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  getOnlineStats,
  joinPresence,
  leavePresence,
} from '../src/realtime/presence.ts'
import { connectValkey, getPublisher } from '../src/valkey.ts'

beforeAll(async () => {
  await connectValkey()
})

afterAll(async () => {
  await getPublisher().del('holdem:presence:users')
  await getPublisher().del('holdem:presence:rooms')
  await getPublisher().del('holdem:presence:room:room-a')
  await getPublisher().del('holdem:presence:lease:alice')
})

describe('presence', () => {
  test('tracks rooms and players', async () => {
    await joinPresence('room-a', 'alice')
    expect(await getOnlineStats()).toEqual({ rooms: 1, players: 1 })

    await leavePresence('room-a', 'alice')
    expect(await getOnlineStats()).toEqual({ rooms: 0, players: 0 })
  })
})
