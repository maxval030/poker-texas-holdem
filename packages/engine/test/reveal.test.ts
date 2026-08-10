import { describe, expect, test } from 'bun:test'
import { createTable, reduce } from '../src/engine.ts'
import { allRevealDecided, chipDeltas, REVEAL_WINDOW_MS } from '../src/result.ts'
import type { Command, GameEvent, Occupant, TableState } from '../src/types.ts'
import { redactEvent, viewFor } from '../src/view.ts'
import {
  apply,
  applyWithEvents,
  rigHand,
  seatPlayers,
  testConfig,
  testContext,
} from './helpers.ts'

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

/** Heads-up: human folds preflop; bot wins with no human eligible for reveal. */
function foldWinBotVsHuman(): { state: TableState; events: ReturnType<typeof reduce>['events'] } {
  let state = createTable(testConfig({ maxSeats: 2 }))
  state = apply(state, { type: 'sit', seat: 0, occupant: human(0), buyIn: 100 })
  state = apply(state, { type: 'sit', seat: 1, occupant: bot(1), buyIn: 100 })
  state = apply(state, { type: 'start-hand' })
  // Heads-up: seat 0 acts first and folds — bot takes the pot.
  return applyWithEvents(state, { type: 'act', seat: 0, action: { type: 'fold' } })
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

  test('bot fold-win settles immediately with no human eligible', () => {
    const { state, events } = foldWinBotVsHuman()
    const ctx = testContext()

    expect(state.hand?.complete).toBe(true)
    expect(state.hand?.reveal).not.toBeNull()
    expect(state.hand?.reveal?.deadline).toBeNull()
    expect(state.hand?.reveal?.settled).toBe(true)
    expect(state.hand?.reveal?.choices).toEqual([])
    expect(events.some((e) => e.type === 'reveal-started')).toBe(true)
    expect(events.some((e) => e.type === 'reveal-settled')).toBe(true)
    const started = events.find((e) => e.type === 'reveal-started')
    expect(started).toEqual({
      type: 'reveal-started',
      deadline: null,
      seats: [],
    })

    // Next hand can start without timeout-reveal.
    const next = reduce(state, { type: 'start-hand' }, ctx)
    expect(next.events.some((e) => e.type === 'error')).toBe(false)
    expect(next.state.hand?.complete).toBe(false)
  })
})

/** Heads-up all-in to showdown with both humans still contesting. */
function headsUpShowdown(): { state: TableState; events: GameEvent[] } {
  let state = apply(seatPlayers([100, 100], testConfig({ maxSeats: 2 })), { type: 'start-hand' })
  rigHand(state, { 0: 'As Ks', 1: '2c 7d' }, 'Ah Kd Qs 3h 4d')

  const script: Command[] = [
    { type: 'act', seat: 0, action: { type: 'all-in' } },
    { type: 'act', seat: 1, action: { type: 'call' } },
  ]
  let events: GameEvent[] = []
  for (const command of script) {
    const result = reduce(state, command, testContext())
    state = result.state
    events = result.events
  }
  return { state, events }
}

describe('viewFor reveal redaction + result', () => {
  test('complete hand does not expose mucked opponent cards', () => {
    let { state } = foldWinHumanVsBot()
    const winner = 0
    state = apply(state, { type: 'muck', seat: winner })

    const view = viewFor(state, null)
    const opp = view.hand?.players.find((p) => p.seat === winner)
    expect(opp?.holeCards).toBeNull()
    expect(view.result).not.toBeNull()
    expect(view.result?.winners).toEqual([winner])
    expect(view.result?.categories).toEqual([])
    expect(view.result?.settled).toBe(true)
    expect(view.result?.canShow).toBe(false)
  })

  test('shown winner exposes cards and category on result', () => {
    let { state } = foldWinHumanVsBot()
    const winnerSeat = 0
    const otherSeat = 1
    expect(state.hand?.board.length).toBe(0)

    state = apply(state, { type: 'show', seat: winnerSeat })

    expect(state.hand?.board.length).toBe(5)
    const choice = state.hand?.reveal?.choices.find((c) => c.seat === winnerSeat)
    expect(choice?.choice).toBe('shown')
    expect(typeof choice?.score).toBe('number')

    const showerView = viewFor(state, winnerSeat)
    expect(showerView.result?.categories.some((c) => c.seat === winnerSeat)).toBe(true)
    expect(showerView.hand?.players.find((p) => p.seat === winnerSeat)?.holeCards).not.toBeNull()
    expect(showerView.hand?.board.length).toBe(5)
    expect(showerView.result?.canShow).toBe(false)
    expect(showerView.result?.settled).toBe(true)

    // Opponents and spectators must see Shown cards, not only the shower.
    for (const viewer of [otherSeat, null] as const) {
      const view = viewFor(state, viewer)
      expect(view.hand?.players.find((p) => p.seat === winnerSeat)?.holeCards).not.toBeNull()
      expect(view.result?.categories.some((c) => c.seat === winnerSeat)).toBe(true)
    }
  })

  test('showdown keeps hole cards private until Show; muck stays hidden', () => {
    let { state, events } = headsUpShowdown()
    expect(state.hand?.complete).toBe(true)
    expect(events.some((e) => e.type === 'showdown')).toBe(true)
    expect(state.hand?.reveal?.settled).toBe(false)
    expect(state.hand?.reveal?.choices.map((c) => c.seat).sort()).toEqual([0, 1])

    const rawShowdown = events.find((e) => e.type === 'showdown')
    expect(rawShowdown?.type).toBe('showdown')
    if (rawShowdown?.type !== 'showdown') throw new Error('expected showdown event')
    expect(rawShowdown.reveals.length).toBe(2)
    expect(rawShowdown.reveals.every((r) => r.cards.length === 2 && typeof r.score === 'number')).toBe(
      true,
    )

    // Client-bound events strip all showdown reveals (scores/cards/best).
    for (const viewer of [0, 1, null] as const) {
      const redacted = redactEvent(rawShowdown, viewer)
      expect(redacted).toEqual({ type: 'showdown', reveals: [] })
    }

    // Before any Show, neither seat's cards leak through the view to the other.
    const before0 = viewFor(state, 0)
    const before1 = viewFor(state, 1)
    expect(before0.hand?.players.find((p) => p.seat === 0)?.holeCards).not.toBeNull()
    expect(before0.hand?.players.find((p) => p.seat === 1)?.holeCards).toBeNull()
    expect(before1.hand?.players.find((p) => p.seat === 1)?.holeCards).not.toBeNull()
    expect(before1.hand?.players.find((p) => p.seat === 0)?.holeCards).toBeNull()
    expect(viewFor(state, null).hand?.players.every((p) => p.holeCards === null)).toBe(true)

    state = apply(state, { type: 'show', seat: 0 })
    // Opponent (and spectators) see Shown cards; seat 1 still sees only own + Shown.
    expect(viewFor(state, 1).hand?.players.find((p) => p.seat === 0)?.holeCards).not.toBeNull()
    expect(viewFor(state, null).hand?.players.find((p) => p.seat === 0)?.holeCards).not.toBeNull()
    expect(viewFor(state, null).hand?.players.find((p) => p.seat === 1)?.holeCards).toBeNull()

    state = apply(state, { type: 'muck', seat: 1 })
    expect(viewFor(state, 0).hand?.players.find((p) => p.seat === 1)?.holeCards).toBeNull()
    expect(viewFor(state, null).hand?.players.find((p) => p.seat === 1)?.holeCards).toBeNull()
    expect(state.hand?.reveal?.settled).toBe(true)
  })
})
