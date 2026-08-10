import { describe, expect, test } from 'bun:test'
import { referenceEvaluate7, SEAT_HOLD_MS, seededRng } from '@holdem/engine'
import { createEquityEstimator } from '@holdem/evaluator'
import type { ServerMessage, TableConfig } from '@holdem/protocol'
import { DISCONNECT_GRACE_MS, ManualClock, TableHost } from '../src/index.ts'

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

function harness() {
  const clock = new ManualClock(1_000_000)
  const sent: ServerMessage[] = []
  const host = new TableHost({
    roomId: 'dc',
    config: CONFIG,
    rng: seededRng(7),
    evaluate7: referenceEvaluate7,
    estimator: createEquityEstimator(),
    clock,
    botDelayScale: 0,
    handIntervalMs: null,
    deliver: (_userId, message) => sent.push(message),
  })
  return { host, clock, sent }
}

describe('disconnect handling', () => {
  test('hands the seat to a bot after the grace period, keeping the stack', () => {
    const { host, clock } = harness()
    host.join({ userId: 'human', name: 'You' })
    host.receive('human', { type: 'sit', seat: 0, buyIn: 5_000 })
    host.receive('human', { type: 'add-bot', seat: 1, difficulty: 'easy' })
    host.receive('human', { type: 'start' })

    host.disconnect('human')
    expect(host.tableState.seats[0]?.connected).toBe(false)
    expect(host.tableState.seats[0]?.controller).toBe('human')
    expect(host.tableState.status).toBe('dormant')

    clock.advance(DISCONNECT_GRACE_MS + 1)
    expect(host.tableState.seats[0]?.controller).toBe('bot')
    expect(host.tableState.seats[0]?.stack).toBeGreaterThan(0)
  })

  test('returns control at the hand boundary when the human reconnects', () => {
    const { host, clock } = harness()
    host.join({ userId: 'human', name: 'You' })
    host.receive('human', { type: 'sit', seat: 0, buyIn: 5_000 })
    host.receive('human', { type: 'add-bot', seat: 1, difficulty: 'easy' })
    host.receive('human', { type: 'start' })
    host.disconnect('human')
    clock.advance(DISCONNECT_GRACE_MS + 1)
    expect(host.tableState.seats[0]?.controller).toBe('bot')

    // Rejoin mid-hand — still a bot until the hand ends.
    host.join({ userId: 'human', name: 'You' })
    expect(host.tableState.seats[0]?.controller).toBe('bot')
    expect(host.tableState.status).not.toBe('dormant')

    // Drive the hand to completion with zero bot delay.
    for (let step = 0; step < 200; step++) {
      if (host.tableState.hand?.complete) break
      if (!clock.runNext()) break
    }
    expect(host.tableState.hand?.complete).toBe(true)
    expect(host.tableState.seats[0]?.controller).toBe('human')
  })

  test('releases the seat after the hold expires', () => {
    const { host, clock } = harness()
    host.join({ userId: 'human', name: 'You' })
    host.receive('human', { type: 'sit', seat: 0, buyIn: 5_000 })
    host.disconnect('human')

    clock.advance(SEAT_HOLD_MS + 1)
    expect(host.tableState.seats[0]?.occupant).toBeNull()
  })

  test('freezes the hand while dormant so bots do not play alone', () => {
    const { host, clock } = harness()
    host.join({ userId: 'human', name: 'You' })
    host.receive('human', { type: 'sit', seat: 0, buyIn: 5_000 })
    host.receive('human', { type: 'add-bot', seat: 1, difficulty: 'easy' })
    host.receive('human', { type: 'start' })
    const handNumber = host.tableState.handNumber
    const actorBefore = host.tableState.hand?.actorSeat

    host.disconnect('human')
    expect(host.tableState.status).toBe('dormant')
    clock.advance(60_000)
    expect(host.tableState.handNumber).toBe(handNumber)
    expect(host.tableState.hand?.actorSeat).toBe(actorBefore)
  })
})
