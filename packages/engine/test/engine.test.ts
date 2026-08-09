import { describe, expect, test } from 'bun:test'
import { legalActionsFor } from '../src/betting.ts'
import { cardToString } from '../src/cards.ts'
import { chipsOnTable, reduce } from '../src/engine.ts'
import { type Rng, seededRng } from '../src/rng.ts'
import type { Command, GameEvent, LegalActions, PlayerAction, TableState } from '../src/types.ts'
import { apply, rigHand, seatPlayers, stackTotal, testConfig, testContext } from './helpers.ts'

function playToShowdown(state: TableState, script: Command[]): TableState {
  let next = state
  for (const command of script) next = apply(next, command)
  return next
}

describe('a complete hand', () => {
  test('awards the whole pot to the best hand', () => {
    let state = apply(seatPlayers([100, 100, 100], testConfig({ maxSeats: 3 })), {
      type: 'start-hand',
    })
    rigHand(state, { 0: 'As Ks', 1: 'Ah Kh', 2: '2c 7d' }, 'Qs Js Ts 3h 4d')

    state = playToShowdown(state, [
      { type: 'act', seat: 0, action: { type: 'call' } },
      { type: 'act', seat: 1, action: { type: 'call' } },
      { type: 'act', seat: 2, action: { type: 'check' } },
      { type: 'act', seat: 1, action: { type: 'check' } },
      { type: 'act', seat: 2, action: { type: 'check' } },
      { type: 'act', seat: 0, action: { type: 'check' } },
      { type: 'act', seat: 1, action: { type: 'check' } },
      { type: 'act', seat: 2, action: { type: 'check' } },
      { type: 'act', seat: 0, action: { type: 'check' } },
      { type: 'act', seat: 1, action: { type: 'check' } },
      { type: 'act', seat: 2, action: { type: 'check' } },
      { type: 'act', seat: 0, action: { type: 'check' } },
    ])

    expect(state.hand?.complete).toBe(true)
    expect(state.hand?.board.map(cardToString)).toEqual(['Qs', 'Js', 'Ts', '3h', '4d'])
    expect(state.seats.map((s) => s.stack)).toEqual([104, 98, 98])
    expect(stackTotal(state)).toBe(300)
  })

  test('splits evenly when two players hold the same straight', () => {
    let state = apply(seatPlayers([100, 100, 100], testConfig({ maxSeats: 3 })), {
      type: 'start-hand',
    })
    rigHand(state, { 0: 'As Kd', 1: 'Ah Kc', 2: '2c 7d' }, 'Qs Js Ts 3h 4d')

    state = playToShowdown(state, [
      { type: 'act', seat: 0, action: { type: 'call' } },
      { type: 'act', seat: 1, action: { type: 'call' } },
      { type: 'act', seat: 2, action: { type: 'check' } },
      { type: 'act', seat: 1, action: { type: 'check' } },
      { type: 'act', seat: 2, action: { type: 'check' } },
      { type: 'act', seat: 0, action: { type: 'check' } },
      { type: 'act', seat: 1, action: { type: 'check' } },
      { type: 'act', seat: 2, action: { type: 'check' } },
      { type: 'act', seat: 0, action: { type: 'check' } },
      { type: 'act', seat: 1, action: { type: 'check' } },
      { type: 'act', seat: 2, action: { type: 'check' } },
      { type: 'act', seat: 0, action: { type: 'check' } },
    ])

    expect(state.seats.map((s) => s.stack)).toEqual([101, 101, 98])
    expect(stackTotal(state)).toBe(300)
  })

  test('gives the blinds to the last player standing without a showdown', () => {
    let state = apply(seatPlayers([100, 100, 100], testConfig({ maxSeats: 3 })), {
      type: 'start-hand',
    })
    const result = reduce(state, { type: 'act', seat: 0, action: { type: 'fold' } }, testContext())
    state = result.state
    state = apply(state, { type: 'act', seat: 1, action: { type: 'fold' } })

    expect(state.hand?.complete).toBe(true)
    expect(state.seats.map((s) => s.stack)).toEqual([100, 99, 101])
    expect(state.hand?.board).toEqual([])
  })
})

describe('a multi-way all-in', () => {
  test('pays the main pot and the side pot to different players', () => {
    let state = apply(seatPlayers([200, 50, 200], testConfig({ maxSeats: 3 })), {
      type: 'start-hand',
    })
    rigHand(state, { 0: 'Kh Kd', 1: 'Ah As', 2: '3c 5c' }, '2c 7d 9h Jd 4s')

    state = playToShowdown(state, [
      { type: 'act', seat: 0, action: { type: 'raise', to: 200 } },
      { type: 'act', seat: 1, action: { type: 'all-in' } },
      { type: 'act', seat: 2, action: { type: 'call' } },
    ])

    expect(state.hand?.complete).toBe(true)
    expect(state.seats.map((s) => s.stack)).toEqual([300, 150, 0])
    expect(stackTotal(state)).toBe(450)
  })

  test('reports the pots it built', () => {
    const state = apply(seatPlayers([200, 50, 200], testConfig({ maxSeats: 3 })), {
      type: 'start-hand',
    })
    rigHand(state, { 0: 'Kh Kd', 1: 'Ah As', 2: '3c 5c' }, '2c 7d 9h Jd 4s')

    let events: GameEvent[] = []
    let next = state
    for (const command of [
      { type: 'act', seat: 0, action: { type: 'raise', to: 200 } },
      { type: 'act', seat: 1, action: { type: 'all-in' } },
      { type: 'act', seat: 2, action: { type: 'call' } },
    ] as Command[]) {
      const result = reduce(next, command, testContext())
      next = result.state
      events = result.events
    }

    const pots = events.find((e) => e.type === 'pots-formed')
    expect(pots).toEqual({
      type: 'pots-formed',
      pots: [
        { amount: 150, eligibleSeats: [0, 1, 2] },
        { amount: 300, eligibleSeats: [0, 2] },
      ],
    })
  })
})

function randomAction(legal: LegalActions, rng: Rng): PlayerAction {
  const choices: PlayerAction[] = [{ type: 'fold' }]
  if (legal.canCheck) choices.push({ type: 'check' }, { type: 'check' })
  if (legal.call) choices.push({ type: 'call' }, { type: 'call' })
  if (legal.raise) {
    const span = legal.raise.max - legal.raise.min + 1
    choices.push({
      type: legal.raise.isOpeningBet ? 'bet' : 'raise',
      to: legal.raise.min + rng.nextInt(span),
    })
    choices.push({ type: 'all-in' })
  }
  return choices[rng.nextInt(choices.length)] as PlayerAction
}

describe('chip conservation', () => {
  test('holds across a thousand randomly played hands', () => {
    const rng = seededRng(20260810)
    let handsPlayed = 0
    let showdownsSeen = 0

    for (let round = 0; round < 200; round++) {
      const seatCount = 2 + rng.nextInt(8)
      const stacks = Array.from({ length: seatCount }, () => 20 + rng.nextInt(400))
      let state = seatPlayers(stacks, testConfig({ maxSeats: seatCount }))
      const expected = stackTotal(state)

      for (let hand = 0; hand < 5; hand++) {
        const funded = state.seats.filter((s) => s.stack > 0 && s.status === 'waiting')
        if (funded.length < 2) break

        const ctx = { ...testContext(), rng }
        const started = reduce(state, { type: 'start-hand' }, ctx)
        expect(started.events.find((e) => e.type === 'error')).toBeUndefined()
        state = started.state
        handsPlayed++

        let guard = 0
        while (state.hand && !state.hand.complete) {
          if (guard++ > 500) throw new Error('hand failed to terminate')
          expect(chipsOnTable(state)).toBe(expected)
          const seat = state.hand.actorSeat
          if (seat === null) throw new Error('no actor while the hand is live')
          const legal = legalActionsFor(state, seat)
          if (!legal) throw new Error(`seat ${seat} was asked to act but cannot`)
          const result = reduce(state, { type: 'act', seat, action: randomAction(legal, rng) }, ctx)
          const error = result.events.find((e) => e.type === 'error')
          if (error) throw new Error(error.message)
          if (result.events.some((e) => e.type === 'showdown')) showdownsSeen++
          state = result.state
        }

        expect(stackTotal(state)).toBe(expected)
        expect(state.seats.every((s) => s.stack >= 0)).toBe(true)
      }
    }

    expect(handsPlayed).toBeGreaterThan(500)
    expect(showdownsSeen).toBeGreaterThan(50)
  })
})

describe('replay', () => {
  test('a recorded command sequence reproduces the same table', () => {
    const commands: Command[] = [{ type: 'start-hand' }]
    const play = (seed: number) => {
      let state = seatPlayers([300, 300, 300, 300], testConfig({ maxSeats: 4 }))
      const rng = seededRng(seed)
      const ctx = { ...testContext(), rng }
      let recorded: Command[] = []
      for (const command of commands) state = reduce(state, command, ctx).state
      const actionRng = seededRng(seed ^ 0x5f5f)
      let guard = 0
      while (state.hand && !state.hand.complete && guard++ < 200) {
        const seat = state.hand.actorSeat
        if (seat === null) break
        const legal = legalActionsFor(state, seat)
        if (!legal) break
        const command: Command = { type: 'act', seat, action: randomAction(legal, actionRng) }
        recorded = [...recorded, command]
        state = reduce(state, command, ctx).state
      }
      return { state, recorded }
    }

    const first = play(99)
    const second = play(99)
    expect(second.recorded).toEqual(first.recorded)
    expect(second.state).toEqual(first.state)
  })
})
