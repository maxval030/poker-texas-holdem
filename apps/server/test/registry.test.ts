import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { ServerMessage } from '@holdem/protocol'
import { RoomRegistry, type SocketSink } from '../src/realtime/registry.ts'
import { connectValkey } from '../src/valkey.ts'

const CONFIG = {
  format: 'cash' as const,
  maxSeats: 9,
  smallBlind: 25,
  bigBlind: 50,
  ante: 0,
  minBuyIn: 1_000,
  maxBuyIn: 10_000,
  actionClockMs: 30_000,
  rebuy: { kind: 'unlimited' as const },
}

function fakeSocket() {
  const messages: ServerMessage[] = []
  const sink: SocketSink = {
    send(message) {
      messages.push(message)
    },
    close() {},
  }
  return { sink, messages }
}

beforeAll(async () => {
  await connectValkey()
})

afterAll(async () => {
  // kept alive across files
})

describe('RoomRegistry', () => {
  test("welcomes a player and never puts another seat's hole cards on the wire", async () => {
    const registry = new RoomRegistry()
    const alice = fakeSocket()
    const bob = fakeSocket()

    await registry.attach({
      roomId: 'room-privacy',
      userId: 'alice',
      name: 'Alice',
      config: CONFIG,
      socket: alice.sink,
    })
    await registry.attach({
      roomId: 'room-privacy',
      userId: 'bob',
      name: 'Bob',
      config: CONFIG,
      socket: bob.sink,
    })

    registry.receive('room-privacy', 'alice', { type: 'sit', seat: 0, buyIn: 5_000 })
    registry.receive('room-privacy', 'bob', { type: 'sit', seat: 1, buyIn: 5_000 })
    registry.receive('room-privacy', 'alice', { type: 'start' })

    const aliceUpdate = [...alice.messages].reverse().find((message) => message.type === 'update')
    const bobUpdate = [...bob.messages].reverse().find((message) => message.type === 'update')

    expect(aliceUpdate?.type).toBe('update')
    expect(bobUpdate?.type).toBe('update')
    if (aliceUpdate?.type !== 'update' || bobUpdate?.type !== 'update') return

    const aliceCards = aliceUpdate.update.view.hand?.players.find((p) => p.seat === 0)?.holeCards
    const bobSeenOfAlice = bobUpdate.update.view.hand?.players.find((p) => p.seat === 0)?.holeCards
    expect(aliceCards).toHaveLength(2)
    expect(bobSeenOfAlice).toBeNull()

    const leaked = bobUpdate.update.events.some(
      (event) => event.type === 'hole-cards-dealt' && event.deals.some((deal) => deal.seat === 0),
    )
    expect(leaked).toBe(false)

    await registry.dispose('room-privacy')
  })

  test('resync asks for a fresh snapshot without advancing the sequence', async () => {
    const registry = new RoomRegistry()
    const socket = fakeSocket()

    await registry.attach({
      roomId: 'room-resync',
      userId: 'carol',
      name: 'Carol',
      config: CONFIG,
      socket: socket.sink,
    })

    const before = socket.messages.length
    registry.receive('room-resync', 'carol', { type: 'resync' })
    const updates = socket.messages.slice(before).filter((message) => message.type === 'update')
    expect(updates.length).toBe(1)
    if (updates[0]?.type === 'update') {
      expect(updates[0].update.events).toEqual([])
    }

    await registry.dispose('room-resync')
  })
})
