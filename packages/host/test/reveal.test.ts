import { describe, expect, test } from 'bun:test'
import { type GameEvent, referenceEvaluate7, seededRng } from '@holdem/engine'
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
  committed: { seq: number; events: GameEvent[] }[]
}

function harness(options: { handIntervalMs?: number | null } = {}): Harness {
  const clock = new ManualClock(1_000_000)
  const sent: { userId: string | null; message: ServerMessage }[] = []
  const committed: { seq: number; events: GameEvent[] }[] = []

  const host = new TableHost({
    roomId: 'reveal',
    config: CONFIG,
    rng: seededRng(4242),
    evaluate7: referenceEvaluate7,
    estimator: createEquityEstimator(),
    clock,
    botDelayScale: 0,
    handIntervalMs: options.handIntervalMs === undefined ? 1_000 : options.handIntervalMs,
    deliver: (userId, message) => sent.push({ userId, message }),
    onCommit: (_state, seq, events) => committed.push({ seq, events }),
  })

  return { host, clock, sent, committed }
}

/** Heads-up humans; first-to-act folds → other seat wins with a pending reveal. */
function foldWinWithPendingReveal(h: Harness): { winnerSeat: number; winnerId: string } {
  h.host.join({ userId: 'p0', name: 'P0' })
  h.host.join({ userId: 'p1', name: 'P1' })
  h.host.receive('p0', { type: 'sit', seat: 0, buyIn: 5_000 })
  h.host.receive('p1', { type: 'sit', seat: 1, buyIn: 5_000 })
  h.host.receive('p0', { type: 'start' })

  const actor = h.host.tableState.hand?.actorSeat
  expect(actor).not.toBeNull()
  const folderId = actor === 0 ? 'p0' : 'p1'
  const winnerSeat = actor === 0 ? 1 : 0
  const winnerId = winnerSeat === 0 ? 'p0' : 'p1'

  h.host.receive(folderId, { type: 'act', action: { type: 'fold' } })

  expect(h.host.tableState.hand?.complete).toBe(true)
  expect(h.host.tableState.hand?.reveal?.settled).toBe(false)
  expect(h.host.tableState.hand?.reveal?.choices).toEqual([{ seat: winnerSeat, choice: 'pending' }])

  return { winnerSeat, winnerId }
}

describe('reveal scheduling', () => {
  test('schedules timeout-reveal then next hand after interval', () => {
    const h = harness({ handIntervalMs: 1_000 })
    foldWinWithPendingReveal(h)

    const handNumber = h.host.tableState.handNumber

    h.clock.advance(8_000)
    expect(h.host.tableState.hand?.reveal?.settled).toBe(true)
    expect(h.host.tableState.handNumber).toBe(handNumber)

    h.clock.advance(1_000)
    expect(h.host.tableState.handNumber).toBe(handNumber + 1)
    expect(h.host.tableState.hand?.complete).toBe(false)
  })

  test('leave during reveal mucks', () => {
    const h = harness({ handIntervalMs: null })
    const { winnerSeat, winnerId } = foldWinWithPendingReveal(h)

    h.host.receive(winnerId, { type: 'leave' })

    expect(h.host.tableState.hand?.reveal?.choices.find((c) => c.seat === winnerSeat)?.choice).toBe(
      'mucked',
    )
    expect(h.host.tableState.hand?.reveal?.settled).toBe(true)
  })

  test('disconnect during reveal mucks', () => {
    const h = harness({ handIntervalMs: null })
    const { winnerSeat, winnerId } = foldWinWithPendingReveal(h)

    h.host.disconnect(winnerId)

    expect(h.host.tableState.hand?.reveal?.choices.find((c) => c.seat === winnerSeat)?.choice).toBe(
      'mucked',
    )
    expect(h.host.tableState.hand?.reveal?.settled).toBe(true)
  })
})

describe('showdown event redaction', () => {
  test('clients never receive foreign showdown cards or scores', () => {
    const h = harness({ handIntervalMs: null })
    h.host.join({ userId: 'p0', name: 'P0' })
    h.host.join({ userId: 'p1', name: 'P1' })
    h.host.receive('p0', { type: 'sit', seat: 0, buyIn: 5_000 })
    h.host.receive('p1', { type: 'sit', seat: 1, buyIn: 5_000 })
    h.host.receive('p0', { type: 'start' })

    // Heads-up: SB/button acts first — shove, call → showdown.
    const first = h.host.tableState.hand?.actorSeat
    expect(first).not.toBeNull()
    const firstId = first === 0 ? 'p0' : 'p1'
    const secondId = first === 0 ? 'p1' : 'p0'
    h.host.receive(firstId, { type: 'act', action: { type: 'all-in' } })
    h.host.receive(secondId, { type: 'act', action: { type: 'call' } })

    expect(h.host.tableState.hand?.complete).toBe(true)

    const committedShowdowns = h.committed.flatMap((entry) =>
      entry.events.filter((event) => event.type === 'showdown'),
    )
    expect(committedShowdowns.length).toBe(1)
    const full = committedShowdowns[0]
    expect(full?.type).toBe('showdown')
    if (full?.type !== 'showdown') throw new Error('expected committed showdown')
    expect(full.reveals.length).toBe(2)
    expect(full.reveals.every((r) => r.cards.length === 2 && typeof r.score === 'number')).toBe(true)

    const deliveredShowdowns = h.sent.flatMap((entry) =>
      entry.message.type === 'update'
        ? entry.message.update.events.filter((event) => event.type === 'showdown')
        : [],
    )
    expect(deliveredShowdowns.length).toBeGreaterThan(0)
    for (const event of deliveredShowdowns) {
      expect(event.reveals).toEqual([])
    }

    // Views stay redacted until Show; neither client sees the other's hole cards.
    for (const userId of ['p0', 'p1'] as const) {
      const update = [...h.sent].reverse().find(
        (entry) => entry.userId === userId && entry.message.type === 'update',
      )
      expect(update?.message.type).toBe('update')
      if (update?.message.type !== 'update') continue
      const view = update.message.update.view
      const ownSeat = userId === 'p0' ? 0 : 1
      const otherSeat = ownSeat === 0 ? 1 : 0
      expect(view.hand?.players.find((p) => p.seat === ownSeat)?.holeCards).not.toBeNull()
      expect(view.hand?.players.find((p) => p.seat === otherSeat)?.holeCards).toBeNull()
    }
  })
})
