import { describe, expect, test } from 'bun:test'
import { createTable, reduce } from '../src/engine.ts'
import { chipDeltas, allRevealDecided, REVEAL_WINDOW_MS } from '../src/result.ts'
import type { Occupant, TableState } from '../src/types.ts'
import { apply, applyWithEvents, seatPlayers, testConfig, testContext } from './helpers.ts'

describe('chipDeltas', () => {
  test('awards minus committed for every contributor', () => {
    const players = [
      { seat: 0, totalCommitted: 100 },
      { seat: 1, totalCommitted: 200 },
      { seat: 2, totalCommitted: 50 },
    ]
    const awards = [{ seat: 1, amount: 350, potIndex: 0 }]
    expect(chipDeltas(awards, players)).toEqual([
      { seat: 0, awarded: 0, committed: 100, delta: -100 },
      { seat: 1, awarded: 350, committed: 200, delta: 150 },
      { seat: 2, awarded: 0, committed: 50, delta: -50 },
    ])
  })
})

describe('allRevealDecided', () => {
  test('true when no pending choices', () => {
    expect(
      allRevealDecided({
        deadline: 1,
        settled: false,
        awards: [],
        choices: [
          { seat: 0, choice: 'shown' },
          { seat: 1, choice: 'mucked' },
        ],
      }),
    ).toBe(true)
  })
})

function bot(index: number): Occupant {
  return { id: `bot${index}`, name: `Bot ${index}`, kind: 'bot' }
}

function human(index: number): Occupant {
  return { id: `p${index}`, name: `Player ${index}`, kind: 'human' }
}

/** Heads-up: human seat 0, bot seat 1; bot folds after human completes the blind. */
function foldWinHumanVsBot(): { state: TableState; events: ReturnType<typeof reduce>['events'] } {
  let state = createTable(testConfig({ maxSeats: 2 }))
  state = apply(state, { type: 'sit', seat: 0, occupant: human(0), buyIn: 100 })
  state = apply(state, { type: 'sit', seat: 1, occupant: bot(1), buyIn: 100 })
  state = apply(state, { type: 'start-hand' })
  // Heads-up: seat 0 is SB/button and acts first — call, then bot folds.
  state = apply(state, { type: 'act', seat: 0, action: { type: 'call' } })
  return applyWithEvents(state, { type: 'act', seat: 1, action: { type: 'fold' } })
}

describe('reveal window', () => {
  test('fold win starts reveal with only the human winner pending', () => {
    const { state, events } = foldWinHumanVsBot()
    const ctx = testContext()

    expect(state.hand?.complete).toBe(true)
    expect(state.hand?.reveal).not.toBeNull()
    expect(state.hand?.reveal?.choices).toEqual([{ seat: 0, choice: 'pending' }])
    expect(state.hand?.reveal?.settled).toBe(false)
    expect(state.hand?.reveal?.deadline).toBe(ctx.now + REVEAL_WINDOW_MS)
    expect(events.some((e) => e.type === 'reveal-started')).toBe(true)
    const started = events.find((e) => e.type === 'reveal-started')
    expect(started).toEqual({
      type: 'reveal-started',
      deadline: ctx.now + REVEAL_WINDOW_MS,
      seats: [0],
    })
  })

  test('show then rejects a second show', () => {
    let { state } = foldWinHumanVsBot()
    const ctx = testContext()
    const winner = 0

    const shown = reduce(state, { type: 'show', seat: winner }, ctx)
    expect(shown.events.some((e) => e.type === 'error')).toBe(false)
    expect(shown.events.some((e) => e.type === 'player-shown')).toBe(true)
    expect(shown.state.hand?.reveal?.choices.find((c) => c.seat === winner)?.choice).toBe('shown')
    expect(shown.state.hand?.reveal?.settled).toBe(true)
    expect(shown.events.some((e) => e.type === 'reveal-settled')).toBe(true)

    state = shown.state
    const again = reduce(state, { type: 'show', seat: winner }, ctx)
    expect(again.events.some((e) => e.type === 'error')).toBe(true)
  })

  test('timeout-reveal mucks pending and settles', () => {
    const { state: started } = foldWinHumanVsBot()
    const ctx = testContext()
    const { state, events } = applyWithEvents(started, { type: 'timeout-reveal' }, ctx)

    expect(state.hand?.reveal?.settled).toBe(true)
    expect(state.hand?.reveal?.choices.every((c) => c.choice !== 'pending')).toBe(true)
    expect(state.hand?.reveal?.choices.every((c) => c.choice === 'mucked')).toBe(true)
    expect(events.some((e) => e.type === 'reveal-settled')).toBe(true)
  })

  test('start-hand fails while reveal is unsettled', () => {
    const { state } = foldWinHumanVsBot()
    const again = reduce(state, { type: 'start-hand' }, testContext())
    expect(again.events.some((e) => e.type === 'error')).toBe(true)
  })

  test('all-human fold win still opens a reveal window', () => {
    let state = apply(seatPlayers([100, 100]), { type: 'start-hand' })
    state = apply(state, { type: 'act', seat: 0, action: { type: 'fold' } })
    expect(state.hand?.complete).toBe(true)
    expect(state.hand?.reveal?.choices).toEqual([{ seat: 1, choice: 'pending' }])
    expect(state.hand?.reveal?.settled).toBe(false)
  })
})
