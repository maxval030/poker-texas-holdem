import { describe, expect, test } from 'bun:test'
import {
  type Card,
  type Command,
  createTable,
  cryptoRng,
  type EngineContext,
  parseCards,
  reduce,
  seededRng,
  type TableConfig,
  type TableState,
} from '@holdem/engine'
import { createEquityEstimator, evaluate7 } from '@holdem/evaluator'
import { decide, decideForSeat, makeBotOccupant, profileFor, situationFor } from '../src/index.ts'

const config: TableConfig = {
  format: 'cash',
  maxSeats: 9,
  smallBlind: 5,
  bigBlind: 10,
  ante: 0,
  minBuyIn: 100,
  maxBuyIn: 100_000,
  actionClockMs: 20_000,
  rebuy: { kind: 'none' },
}

function botTable(seats: number, stack = 1_000): TableState {
  let state = createTable({ ...config, maxSeats: seats })
  const ctx: EngineContext = { now: 0, rng: seededRng(1), evaluate7 }
  for (let seat = 0; seat < seats; seat++) {
    state = reduce(
      state,
      {
        type: 'sit',
        seat,
        occupant: makeBotOccupant(seat, 'normal', seat * 977 + 13),
        buyIn: stack,
      },
      ctx,
    ).state
  }
  return state
}

function rig(state: TableState, hole: Record<number, string>, board: string): void {
  const hand = state.hand
  if (!hand) throw new Error('no hand')
  for (const player of hand.players) {
    const cards = parseCards(hole[player.seat] as string)
    player.holeCards = [cards[0] as Card, cards[1] as Card]
  }
  hand.deck = parseCards(board).reverse()
}

describe('a bot facing a clear decision', () => {
  const estimator = createEquityEstimator()

  test('raises with aces before the flop', () => {
    let state = botTable(3)
    state = reduce(state, { type: 'start-hand' }, { now: 0, rng: seededRng(2), evaluate7 }).state
    rig(state, { 0: 'Ah As', 1: '7c 2d', 2: '9h 4s' }, '2c 7d 9h Jd 4s')
    const decision = decideForSeat(state, 0, estimator, seededRng(5))
    expect(decision?.action.type).toBe('raise')
    expect(decision?.equity).toBeGreaterThan(0.6)
  })

  test('folds the worst hand in poker to a large bet', () => {
    let state = botTable(3)
    state = reduce(state, { type: 'start-hand' }, { now: 0, rng: seededRng(2), evaluate7 }).state
    rig(state, { 0: '7c 2d', 1: 'Ah As', 2: '9h 4s' }, 'Ac Kd Qh Jd Ts')
    state = reduce(
      state,
      { type: 'act', seat: 0, action: { type: 'raise', to: 40 } },
      { now: 0, rng: seededRng(2), evaluate7 },
    ).state
    state = reduce(
      state,
      { type: 'act', seat: 1, action: { type: 'raise', to: 400 } },
      { now: 0, rng: seededRng(2), evaluate7 },
    ).state
    const decision = decideForSeat(state, 2, estimator, seededRng(9))
    expect(decision?.action.type).toBe('fold')
  })

  test('calls when the pot is laying it a price it can beat', () => {
    let state = botTable(2, 5_000)
    state = reduce(state, { type: 'start-hand' }, { now: 0, rng: seededRng(4), evaluate7 }).state
    rig(state, { 0: 'Kh Kd', 1: 'Ah As' }, '2c 7d 9h Jd 4s')
    state = reduce(
      state,
      { type: 'act', seat: 0, action: { type: 'raise', to: 30 } },
      { now: 0, rng: seededRng(4), evaluate7 },
    ).state
    const decision = decideForSeat(state, 1, estimator, seededRng(6))
    expect(['call', 'raise']).toContain(decision?.action.type)
  })
})

describe('personality', () => {
  test('splits into four quadrants across seeds', () => {
    const styles = new Set<string>()
    for (let seed = 0; seed < 200; seed++) {
      const profile = profileFor('normal', seed * 7919 + 1)
      styles.add(
        `${profile.tightness > 0.55 ? 'tight' : 'loose'}-${profile.aggression > 0.5 ? 'aggressive' : 'passive'}`,
      )
    }
    expect(styles.size).toBe(4)
  })

  test('is stable for a given seed', () => {
    expect(profileFor('hard', 12345)).toEqual(profileFor('hard', 12345))
  })

  test('gives harder bots more simulations and less noise', () => {
    const easy = profileFor('easy', 1)
    const hard = profileFor('hard', 1)
    expect(hard.maxIterations).toBeGreaterThan(easy.maxIterations)
    expect(hard.noise).toBeLessThan(easy.noise)
  })
})

describe('timing', () => {
  const estimator = createEquityEstimator()

  test('stays inside its budget even at a full table', () => {
    let state = botTable(9)
    state = reduce(state, { type: 'start-hand' }, { now: 0, rng: cryptoRng(), evaluate7 }).state
    const seat = state.hand?.actorSeat as number
    const started = performance.now()
    const decision = decideForSeat(state, seat, estimator, seededRng(3), profileFor('hard', 1))
    const elapsed = performance.now() - started
    expect(decision).not.toBeNull()
    expect(elapsed).toBeLessThan(120)
  })

  test('asks to be delayed like a person would be', () => {
    let state = botTable(4)
    state = reduce(state, { type: 'start-hand' }, { now: 0, rng: seededRng(8), evaluate7 }).state
    for (let seed = 0; seed < 40; seed++) {
      const seat = state.hand?.actorSeat as number
      const decision = decideForSeat(state, seat, estimator, seededRng(seed + 1))
      expect(decision?.delayMs).toBeGreaterThanOrEqual(800)
      expect(decision?.delayMs).toBeLessThanOrEqual(2_500)
    }
  })
})

describe('determinism', () => {
  const estimator = createEquityEstimator()

  test('the same seed produces the same decision', () => {
    let state = botTable(5)
    state = reduce(state, { type: 'start-hand' }, { now: 0, rng: seededRng(11), evaluate7 }).state
    const seat = state.hand?.actorSeat as number
    const situation = situationFor(state, seat)
    if (!situation) throw new Error('expected a situation')
    const profile = profileFor('normal', 42)
    const first = decide({ situation, profile, estimator, rng: seededRng(77) })
    const second = decide({ situation, profile, estimator, rng: seededRng(77) })
    expect(second).toEqual(first)
  })
})

describe('bots playing each other', () => {
  test('finish two hundred hands without ever making an illegal move', () => {
    const estimator = createEquityEstimator()
    const rng = seededRng(2026)
    let state = botTable(9, 2_000)
    const expected = state.seats.reduce((sum, seat) => sum + seat.stack, 0)
    const reasons = new Set<string>()
    let handsPlayed = 0
    let decisions = 0

    for (let hand = 0; hand < 200; hand++) {
      const funded = state.seats.filter((s) => s.stack > 0 && s.status === 'waiting')
      if (funded.length < 2) break

      const ctx: EngineContext = { now: hand * 60_000, rng, evaluate7 }
      const started = reduce(state, { type: 'start-hand' }, ctx)
      expect(started.events.find((e) => e.type === 'error')).toBeUndefined()
      state = started.state
      handsPlayed += 1

      let guard = 0
      while (state.hand && !state.hand.complete) {
        if (guard++ > 400) throw new Error('hand failed to terminate')
        const seat = state.hand.actorSeat
        if (seat === null) throw new Error('no actor while the hand is live')
        const decision = decideForSeat(state, seat, estimator, rng)
        if (!decision) throw new Error(`seat ${seat} produced no decision`)
        reasons.add(decision.reason)
        decisions += 1

        const command: Command = { type: 'act', seat, action: decision.action }
        const result = reduce(state, command, ctx)
        const error = result.events.find((e) => e.type === 'error')
        if (error) {
          throw new Error(`illegal bot action ${JSON.stringify(decision.action)}: ${error.message}`)
        }
        state = result.state
      }

      expect(state.seats.reduce((sum, seat) => sum + seat.stack, 0)).toBe(expected)
    }

    expect(handsPlayed).toBeGreaterThan(20)
    expect(decisions).toBeGreaterThan(200)
    expect(reasons.has('value-raise')).toBe(true)
    expect(reasons.has('fold-no-odds')).toBe(true)
    expect(reasons.has('call-getting-odds')).toBe(true)
  }, 60_000)
})
