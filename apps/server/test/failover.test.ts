import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { ServerMessage } from '@holdem/protocol'
import { deleteRoomKeys, getOwner } from '../src/realtime/bus.ts'
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

beforeAll(async () => {
  await connectValkey()
})

afterAll(async () => {
  // kept alive across files
})

describe('multi-instance ownership', () => {
  test('forwards a command from the follower and fans the update back', async () => {
    const roomId = `failover-${crypto.randomUUID()}`
    const alpha = new RoomRegistry('instance-alpha')
    const beta = new RoomRegistry('instance-beta')
    const alice = fakeSocket()
    const bob = fakeSocket()

    await alpha.attach({
      roomId,
      userId: 'alice',
      name: 'Alice',
      config: CONFIG,
      socket: alice.sink,
    })
    await beta.attach({
      roomId,
      userId: 'bob',
      name: 'Bob',
      config: CONFIG,
      socket: bob.sink,
    })

    expect(await getOwner(roomId)).toBe('instance-alpha')
    expect(alpha.get(roomId)?.owning).toBe(true)
    expect(beta.get(roomId)?.owning).toBe(false)

    // Bob sits through the follower; alpha must apply it and publish.
    beta.receive(roomId, 'bob', { type: 'sit', seat: 1, buyIn: 5_000 })
    await sleep(150)

    const bobSeated = bob.messages.some(
      (message) =>
        message.type === 'update' && message.update.view.seats[1]?.occupant?.id === 'bob',
    )
    const aliceSeesBob = alice.messages.some(
      (message) =>
        message.type === 'update' && message.update.view.seats[1]?.occupant?.id === 'bob',
    )
    expect(bobSeated).toBe(true)
    expect(aliceSeesBob).toBe(true)

    await alpha.dispose(roomId)
    await beta.dispose(roomId)
    await deleteRoomKeys(roomId)
  })

  test('a follower takes ownership when the owner disappears', async () => {
    const roomId = `takeover-${crypto.randomUUID()}`
    const alpha = new RoomRegistry('owner-a')
    const beta = new RoomRegistry('owner-b')
    const alice = fakeSocket()
    const bob = fakeSocket()

    await alpha.attach({
      roomId,
      userId: 'alice',
      name: 'Alice',
      config: CONFIG,
      socket: alice.sink,
    })
    await beta.attach({
      roomId,
      userId: 'bob',
      name: 'Bob',
      config: CONFIG,
      socket: bob.sink,
    })

    alpha.receive(roomId, 'alice', { type: 'sit', seat: 0, buyIn: 5_000 })
    await sleep(100)

    await alpha.crashOwner(roomId)
    expect(await getOwner(roomId)).toBeNull()

    beta.receive(roomId, 'bob', { type: 'sit', seat: 1, buyIn: 5_000 })
    await sleep(200)

    expect(await getOwner(roomId)).toBe('owner-b')
    expect(beta.get(roomId)?.owning).toBe(true)

    const bobSeated = bob.messages.some(
      (message) =>
        message.type === 'update' && message.update.view.seats[1]?.occupant?.id === 'bob',
    )
    expect(bobSeated).toBe(true)

    // Alice's seat survived in the snapshot the new owner hydrated from.
    const aliceStillThere = bob.messages.some(
      (message) =>
        message.type === 'update' && message.update.view.seats[0]?.occupant?.id === 'alice',
    )
    expect(aliceStillThere).toBe(true)

    await alpha.dispose(roomId)
    await beta.dispose(roomId)
    await deleteRoomKeys(roomId)
  })
})
