import { describe, expect, test } from 'bun:test'
import { chipsOnTable, referenceEvaluate7, seededRng } from '@holdem/engine'
import { createEquityEstimator } from '@holdem/evaluator'
import type { ServerMessage, TableConfig } from '@holdem/protocol'
import { ManualClock, TableHost } from '../src/index.ts'

const CONFIG: TableConfig = {
  format: 'cash',
  maxSeats: 9,
  smallBlind: 25,
  bigBlind: 50,
  ante: 0,
  minBuyIn: 1_000,
  maxBuyIn: 10_000,
  actionClockMs: 20_000,
  rebuy: { kind: 'unlimited' },
}

interface Harness {
  host: TableHost
  clock: ManualClock
  sent: { userId: string | null; message: ServerMessage }[]
  latest(userId: string): Extract<ServerMessage, { type: 'update' }> | null
  rejections(): string[]
}

function harness(options: { handIntervalMs?: number | null } = {}): Harness {
  const clock = new ManualClock(1_000_000)
  const sent: { userId: string | null; message: ServerMessage }[] = []

  const host = new TableHost({
    roomId: 'test',
    config: CONFIG,
    rng: seededRng(4242),
    evaluate7: referenceEvaluate7,
    estimator: createEquityEstimator(),
    clock,
    botDelayScale: 1,
    handIntervalMs: options.handIntervalMs === undefined ? 2_000 : options.handIntervalMs,
    deliver: (userId, message) => sent.push({ userId, message }),
  })

  return {
    host,
    clock,
    sent,
    latest(userId) {
      for (let index = sent.length - 1; index >= 0; index--) {
        const entry = sent[index]
        if (entry && entry.userId === userId && entry.message.type === 'update') {
          return entry.message
        }
      }
      return null
    },
    rejections() {
      return sent.flatMap((entry) =>
        entry.message.type === 'rejected' ? [entry.message.reason] : [],
      )
    },
  }
}

/** Seats a human at 0 with `bots` bots beside them, the single player opening. */
function seatTable(h: Harness, bots: number): void {
  h.host.join({ userId: 'human', name: 'You' })
  h.host.receive('human', { type: 'sit', seat: 0, buyIn: 5_000 })
  for (let seat = 1; seat <= bots; seat++) {
    h.host.receive('human', { type: 'add-bot', seat, difficulty: 'normal' })
  }
}

describe('joining', () => {
  test('welcomes a member with the protocol version and the table config', () => {
    const h = harness()
    h.host.join({ userId: 'human', name: 'You' })

    const welcome = h.sent.find((entry) => entry.message.type === 'welcome')?.message
    expect(welcome).toMatchObject({
      type: 'welcome',
      roomId: 'test',
      config: { bigBlind: 50 },
      self: { userId: 'human', seat: null, legal: null },
    })
  })

  test('sends a snapshot straight after the welcome, so the table is never blank', () => {
    const h = harness()
    h.host.join({ userId: 'human', name: 'You' })
    expect(h.latest('human')?.update.view.seats).toHaveLength(9)
  })
})

describe('sitting down', () => {
  test('puts the player in the seat they asked for', () => {
    const h = harness()
    seatTable(h, 0)
    const view = h.latest('human')?.update.view
    expect(view?.seats[0]?.occupant).toMatchObject({ id: 'human', name: 'You', kind: 'human' })
    expect(view?.viewerSeat).toBe(0)
  })

  test('refuses a second seat rather than cloning the player', () => {
    const h = harness()
    seatTable(h, 0)
    h.host.receive('human', { type: 'sit', seat: 3, buyIn: 5_000 })
    expect(h.rejections()).toContain('you are already seated')
    expect(h.latest('human')?.update.view.seats[3]?.occupant).toBeNull()
  })

  test('reports an illegal buy-in back to the player who tried it', () => {
    const h = harness()
    h.host.join({ userId: 'human', name: 'You' })
    h.host.receive('human', { type: 'sit', seat: 0, buyIn: 999_999 })
    expect(h.rejections()[0]).toContain('buy-in must be an integer')
  })
})

describe('bots', () => {
  test('fills a seat and reads as a bot to the client', () => {
    const h = harness()
    seatTable(h, 1)
    const seat = h.latest('human')?.update.view.seats[1]
    expect(seat?.occupant?.kind).toBe('bot')
    expect(seat?.controller).toBe('bot')
    expect(seat?.stack).toBe(CONFIG.maxBuyIn)
  })

  test('will not be removed from a seat that holds a person', () => {
    const h = harness()
    seatTable(h, 1)
    h.host.receive('human', { type: 'remove-bot', seat: 0 })
    expect(h.rejections()).toContain('that seat is not a bot')
  })

  test('act only after their delay, which is what makes the table feel alive', () => {
    const h = harness({ handIntervalMs: null })
    seatTable(h, 1)
    h.host.receive('human', { type: 'start' })

    const actor = h.latest('human')?.update.view.hand?.actorSeat
    if (actor !== 1) return // the human is first to act, nothing to measure

    h.clock.advance(500)
    expect(h.latest('human')?.update.view.hand?.actorSeat).toBe(1)
    h.clock.advance(2_500)
    expect(h.latest('human')?.update.view.hand?.actorSeat).not.toBe(1)
  })
})

describe('a dealt hand', () => {
  test('shows the viewer their own cards and no one else the same', () => {
    const h = harness({ handIntervalMs: null })
    seatTable(h, 3)
    h.host.receive('human', { type: 'start' })

    const players = h.latest('human')?.update.view.hand?.players ?? []
    expect(players).toHaveLength(4)
    const mine = players.find((player) => player.seat === 0)
    expect(mine?.holeCards).toHaveLength(2)
    for (const player of players) {
      if (player.seat === 0) continue
      expect(player.holeCards).toBeNull()
      expect(player.hasCards).toBe(true)
    }
  })

  test('never leaks the cards of another seat through the event stream', () => {
    const h = harness({ handIntervalMs: null })
    seatTable(h, 3)
    h.host.receive('human', { type: 'start' })

    const deals = h.sent.flatMap((entry) =>
      entry.message.type === 'update'
        ? entry.message.update.events.filter((event) => event.type === 'hole-cards-dealt')
        : [],
    )
    expect(deals.length).toBeGreaterThan(0)
    for (const event of deals) {
      expect(event.deals.map((deal) => deal.seat)).toEqual([0])
    }
  })

  test('offers legal actions only to the player whose turn it is', () => {
    const h = harness({ handIntervalMs: null })
    seatTable(h, 3)
    h.host.receive('human', { type: 'start' })

    const update = h.latest('human')
    const isMyTurn = update?.update.view.hand?.actorSeat === 0
    expect(update?.self.legal === null).toBe(!isMyTurn)
  })
})

describe('the action clock', () => {
  test('folds a player who never acts, rather than stalling the table', () => {
    const h = harness({ handIntervalMs: null })
    seatTable(h, 1)
    h.host.receive('human', { type: 'start' })

    // Let the bots move until it is the human's turn and then simply wait.
    for (let guard = 0; guard < 20; guard++) {
      if (h.latest('human')?.update.view.hand?.actorSeat === 0) break
      if (!h.clock.runNext()) break
    }
    expect(h.latest('human')?.update.view.hand?.actorSeat).toBe(0)

    h.clock.advance(CONFIG.actionClockMs + 1)
    const hand = h.latest('human')?.update.view.hand
    const me = hand?.players.find((player) => player.seat === 0)
    expect(hand?.actorSeat).not.toBe(0)
    expect(me?.status === 'folded' || hand?.complete === true || hand?.street !== 'preflop').toBe(
      true,
    )
  })
})

describe('playing out a session', () => {
  test('deals hand after hand without a person touching it, and loses no chips', () => {
    const h = harness({ handIntervalMs: 2_000 })
    h.host.join({ userId: 'human', name: 'You' })
    for (let seat = 0; seat < 6; seat++) {
      h.host.receive('human', { type: 'add-bot', seat, difficulty: 'easy' })
    }

    const banked = chipsOnTable(h.host.tableState)
    for (let step = 0; step < 4_000; step++) {
      if (h.host.tableState.handNumber >= 12) break
      if (!h.clock.runNext()) break
    }

    expect(h.host.tableState.handNumber).toBeGreaterThanOrEqual(12)
    expect(chipsOnTable(h.host.tableState)).toBe(banked)
    expect(h.rejections()).toEqual([])
  })

  test('stops dealing once only one funded seat is left', () => {
    const h = harness({ handIntervalMs: 2_000 })
    h.host.join({ userId: 'human', name: 'You' })
    h.host.receive('human', { type: 'add-bot', seat: 0, difficulty: 'easy' })
    h.host.receive('human', { type: 'add-bot', seat: 1, difficulty: 'easy' })

    for (let step = 0; step < 20_000; step++) {
      if (!h.clock.runNext()) break
    }

    const funded = h.host.tableState.seats.filter((seat) => seat.occupant && seat.stack > 0)
    expect(funded).toHaveLength(1)
    expect(h.host.tableState.hand?.complete).toBe(true)
  })
})

describe('leaving', () => {
  test('holds the seat when a member drops, because a refresh should cost nothing', () => {
    const h = harness({ handIntervalMs: null })
    seatTable(h, 1)
    h.host.disconnect('human')

    const seat = h.host.tableState.seats[0]
    expect(seat?.occupant?.id).toBe('human')
    expect(seat?.connected).toBe(false)

    h.host.join({ userId: 'human', name: 'You' })
    expect(h.host.tableState.seats[0]?.connected).toBe(true)
    expect(h.latest('human')?.update.view.viewerSeat).toBe(0)
  })

  test('empties the seat when the player says so', () => {
    const h = harness({ handIntervalMs: null })
    seatTable(h, 1)
    h.host.receive('human', { type: 'leave' })
    expect(h.host.tableState.seats[0]?.occupant).toBeNull()
  })
})

describe('shutting down', () => {
  test('cancels its timers, so a closed table cannot deal another card', () => {
    const h = harness({ handIntervalMs: 2_000 })
    seatTable(h, 2)
    h.host.dispose()

    const before = h.host.tableState.handNumber
    h.clock.advance(60_000)
    expect(h.host.tableState.handNumber).toBe(before)
  })
})
