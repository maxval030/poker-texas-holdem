import { describe, expect, test } from 'bun:test'
import { legalActionsFor } from '../src/betting.ts'
import type { TableState } from '../src/types.ts'
import { apply, seatPlayers, testConfig } from './helpers.ts'

function actor(state: TableState): number {
  const seat = state.hand?.actorSeat
  if (seat === null || seat === undefined) throw new Error('nobody is due to act')
  return seat
}

describe('blind positions', () => {
  test('three-handed puts the blinds left of the button', () => {
    const state = apply(seatPlayers([100, 100, 100]), { type: 'start-hand' })
    const hand = state.hand
    expect(hand?.buttonSeat).toBe(0)
    expect(hand?.smallBlindSeat).toBe(1)
    expect(hand?.bigBlindSeat).toBe(2)
    expect(actor(state)).toBe(0)
  })

  test('heads-up makes the button the small blind and first to act preflop', () => {
    const state = apply(seatPlayers([100, 100]), { type: 'start-hand' })
    const hand = state.hand
    expect(hand?.buttonSeat).toBe(0)
    expect(hand?.smallBlindSeat).toBe(0)
    expect(hand?.bigBlindSeat).toBe(1)
    expect(actor(state)).toBe(0)
  })

  test('heads-up gives the non-button player the first move after the flop', () => {
    let state = apply(seatPlayers([100, 100]), { type: 'start-hand' })
    state = apply(state, { type: 'act', seat: 0, action: { type: 'call' } })
    state = apply(state, { type: 'act', seat: 1, action: { type: 'check' } })
    expect(state.hand?.street).toBe('flop')
    expect(actor(state)).toBe(1)
  })
})

describe('big blind option', () => {
  test('the big blind still acts after everyone limps', () => {
    let state = apply(seatPlayers([100, 100, 100]), { type: 'start-hand' })
    state = apply(state, { type: 'act', seat: 0, action: { type: 'call' } })
    state = apply(state, { type: 'act', seat: 1, action: { type: 'call' } })
    expect(actor(state)).toBe(2)
    expect(legalActionsFor(state, 2)?.canCheck).toBe(true)
    expect(legalActionsFor(state, 2)?.raise?.min).toBe(4)
  })
})

describe('minimum raise sizing', () => {
  test('the first preflop raise must double the big blind', () => {
    const state = apply(seatPlayers([100, 100, 100]), { type: 'start-hand' })
    expect(legalActionsFor(state, 0)?.raise).toEqual({ min: 4, max: 100, isOpeningBet: false })
  })

  test('a re-raise must match the size of the previous raise', () => {
    let state = apply(seatPlayers([100, 100, 100]), { type: 'start-hand' })
    state = apply(state, { type: 'act', seat: 0, action: { type: 'raise', to: 10 } })
    expect(legalActionsFor(state, 1)?.raise?.min).toBe(18)
  })

  test('an undersized raise is rejected and leaves the table untouched', () => {
    const state = apply(seatPlayers([100, 100, 100]), { type: 'start-hand' })
    const result = { state, error: '' }
    try {
      apply(state, { type: 'act', seat: 0, action: { type: 'raise', to: 3 } })
    } catch (error) {
      result.error = (error as Error).message
    }
    expect(result.error).toContain('at least 4')
    expect(state.hand?.actorSeat).toBe(0)
  })

  test('the minimum bet after the flop is one big blind', () => {
    let state = apply(seatPlayers([100, 100, 100]), { type: 'start-hand' })
    state = apply(state, { type: 'act', seat: 0, action: { type: 'call' } })
    state = apply(state, { type: 'act', seat: 1, action: { type: 'call' } })
    state = apply(state, { type: 'act', seat: 2, action: { type: 'check' } })
    expect(state.hand?.street).toBe('flop')
    expect(legalActionsFor(state, 1)?.raise).toEqual({ min: 2, max: 98, isOpeningBet: true })
  })
})

describe('an all-in short of a full raise', () => {
  // Seat 3 raises to 10, seat 0 is all-in for 13. That 3 chip bump is short of the
  // 8 chip raise it would take to reopen the betting.
  function shortAllInSpot() {
    let state = apply(seatPlayers([13, 200, 200, 200], testConfig({ maxSeats: 4 })), {
      type: 'start-hand',
    })
    state = apply(state, { type: 'act', seat: 3, action: { type: 'raise', to: 10 } })
    state = apply(state, { type: 'act', seat: 0, action: { type: 'all-in' } })
    return state
  }

  test('raises the amount to call without changing the minimum raise size', () => {
    const state = shortAllInSpot()
    expect(state.hand?.betToCall).toBe(13)
    expect(state.hand?.lastFullRaiseSize).toBe(8)
  })

  test('does not let a player who already acted raise again', () => {
    let state = shortAllInSpot()
    state = apply(state, { type: 'act', seat: 1, action: { type: 'call' } })
    state = apply(state, { type: 'act', seat: 2, action: { type: 'call' } })
    expect(actor(state)).toBe(3)
    const legal = legalActionsFor(state, 3)
    expect(legal?.raise).toBeNull()
    expect(legal?.call).toEqual({ amount: 3, allIn: false })
  })

  test('still lets a player who has not acted raise, priced off the last full raise', () => {
    const state = shortAllInSpot()
    expect(actor(state)).toBe(1)
    expect(legalActionsFor(state, 1)?.raise?.min).toBe(21)
  })

  test('rejects a raise attempt from a player whose betting was not reopened', () => {
    let state = shortAllInSpot()
    state = apply(state, { type: 'act', seat: 1, action: { type: 'call' } })
    state = apply(state, { type: 'act', seat: 2, action: { type: 'call' } })
    expect(() => apply(state, { type: 'act', seat: 3, action: { type: 'raise', to: 30 } })).toThrow(
      /raising is not available/,
    )
  })
})

describe('an all-in that is a full raise', () => {
  test('reopens the betting for everyone', () => {
    let state = apply(seatPlayers([30, 200, 200, 200], testConfig({ maxSeats: 4 })), {
      type: 'start-hand',
    })
    state = apply(state, { type: 'act', seat: 3, action: { type: 'raise', to: 10 } })
    state = apply(state, { type: 'act', seat: 0, action: { type: 'all-in' } })
    expect(state.hand?.betToCall).toBe(30)
    expect(state.hand?.lastFullRaiseSize).toBe(20)
    state = apply(state, { type: 'act', seat: 1, action: { type: 'call' } })
    state = apply(state, { type: 'act', seat: 2, action: { type: 'call' } })
    expect(actor(state)).toBe(3)
    expect(legalActionsFor(state, 3)?.raise?.min).toBe(50)
  })
})

describe('the action clock', () => {
  test('checks for free when nothing is owed', () => {
    let state = apply(seatPlayers([100, 100, 100]), { type: 'start-hand' })
    state = apply(state, { type: 'act', seat: 0, action: { type: 'call' } })
    state = apply(state, { type: 'act', seat: 1, action: { type: 'call' } })
    state = apply(state, { type: 'timeout', seat: 2 })
    expect(state.hand?.street).toBe('flop')
    expect(state.hand?.players.every((p) => p.status === 'active')).toBe(true)
  })

  test('folds rather than paying to stay in', () => {
    const state = apply(apply(seatPlayers([100, 100, 100]), { type: 'start-hand' }), {
      type: 'timeout',
      seat: 0,
    })
    expect(state.hand?.players.find((p) => p.seat === 0)?.status).toBe('folded')
  })

  test('publishes a deadline derived from the injected clock', () => {
    const state = apply(seatPlayers([100, 100, 100]), { type: 'start-hand' })
    expect(state.hand?.deadline).toBe(21_000)
  })
})

describe('uncalled bets', () => {
  test('are returned instead of being contested', () => {
    let state = apply(seatPlayers([200, 40, 200], testConfig({ maxSeats: 3 })), {
      type: 'start-hand',
    })
    state = apply(state, { type: 'act', seat: 0, action: { type: 'raise', to: 100 } })
    state = apply(state, { type: 'act', seat: 1, action: { type: 'all-in' } })
    state = apply(state, { type: 'act', seat: 2, action: { type: 'fold' } })
    const seat0 = state.seats[0]
    expect(seat0?.stack).toBeGreaterThanOrEqual(100)
    expect(state.hand?.players.find((p) => p.seat === 0)?.totalCommitted).toBe(40)
  })
})
