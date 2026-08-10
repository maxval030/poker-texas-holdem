import { describe, expect, test } from 'bun:test'
import { referenceEvaluate7, seededRng } from '@holdem/engine'
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
}

function harness(options: { handIntervalMs?: number | null } = {}): Harness {
  const clock = new ManualClock(1_000_000)
  const sent: { userId: string | null; message: ServerMessage }[] = []

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
  })

  return { host, clock, sent }
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
})
