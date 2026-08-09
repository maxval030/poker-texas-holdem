import { describe, expect, test } from 'bun:test'
import { buildPots, orderFromButton, settlePots } from '../src/pots.ts'
import type { HandPlayer } from '../src/types.ts'

function player(seat: number, totalCommitted: number, status: HandPlayer['status']): HandPlayer {
  return {
    seat,
    holeCards: [0, 1],
    status,
    committed: 0,
    totalCommitted,
    hasActedThisRound: true,
    mayRaise: false,
  }
}

describe('buildPots', () => {
  test('a single pot when everyone committed the same', () => {
    const pots = buildPots([
      player(0, 100, 'active'),
      player(1, 100, 'active'),
      player(2, 100, 'folded'),
    ])
    expect(pots).toEqual([{ amount: 300, eligibleSeats: [0, 1] }])
  })

  test('one side pot when a short stack is all-in', () => {
    const pots = buildPots([
      player(0, 100, 'all-in'),
      player(1, 50, 'all-in'),
      player(2, 100, 'active'),
    ])
    expect(pots).toEqual([
      { amount: 150, eligibleSeats: [0, 1, 2] },
      { amount: 100, eligibleSeats: [0, 2] },
    ])
  })

  test('a folded partial contribution funds the main pot without earning a share', () => {
    const pots = buildPots([
      player(0, 20, 'folded'),
      player(1, 40, 'all-in'),
      player(2, 100, 'all-in'),
      player(3, 100, 'active'),
    ])
    expect(pots).toEqual([
      { amount: 140, eligibleSeats: [1, 2, 3] },
      { amount: 120, eligibleSeats: [2, 3] },
    ])
    expect(pots.reduce((s, p) => s + p.amount, 0)).toBe(260)
  })

  test('four stack depths produce three side pots', () => {
    const pots = buildPots([
      player(0, 10, 'all-in'),
      player(1, 25, 'all-in'),
      player(2, 60, 'all-in'),
      player(3, 200, 'all-in'),
      player(4, 200, 'active'),
    ])
    expect(pots).toEqual([
      { amount: 50, eligibleSeats: [0, 1, 2, 3, 4] },
      { amount: 60, eligibleSeats: [1, 2, 3, 4] },
      { amount: 105, eligibleSeats: [2, 3, 4] },
      { amount: 280, eligibleSeats: [3, 4] },
    ])
    expect(pots.reduce((s, p) => s + p.amount, 0)).toBe(495)
  })

  test('chips are never stranded when every contributor at a level folded', () => {
    const pots = buildPots([player(0, 100, 'folded'), player(1, 50, 'active')])
    expect(pots.reduce((s, p) => s + p.amount, 0)).toBe(150)
    expect(pots.every((p) => p.eligibleSeats.length > 0)).toBe(true)
  })
})

describe('settlePots', () => {
  test('splits a pot evenly and gives the odd chip to the seat left of the button', () => {
    const pots = [{ amount: 101, eligibleSeats: [0, 3] }]
    const awards = settlePots(
      pots,
      [
        { seat: 0, score: 500 },
        { seat: 3, score: 500 },
      ],
      2,
      9,
    )
    expect(awards).toEqual([
      { potIndex: 0, seat: 3, amount: 51 },
      { potIndex: 0, seat: 0, amount: 50 },
    ])
  })

  test('a short stack can only win the pot it was eligible for', () => {
    const pots = [
      { amount: 150, eligibleSeats: [0, 1, 2] },
      { amount: 100, eligibleSeats: [0, 2] },
    ]
    const awards = settlePots(
      pots,
      [
        { seat: 0, score: 4000 },
        { seat: 1, score: 100 },
        { seat: 2, score: 2000 },
      ],
      0,
      9,
    )
    expect(awards).toEqual([
      { potIndex: 0, seat: 1, amount: 150 },
      { potIndex: 1, seat: 2, amount: 100 },
    ])
  })

  test('a three-way split distributes both odd chips by position', () => {
    const pots = [{ amount: 302, eligibleSeats: [1, 4, 7] }]
    const awards = settlePots(
      pots,
      [
        { seat: 1, score: 10 },
        { seat: 4, score: 10 },
        { seat: 7, score: 10 },
      ],
      8,
      9,
    )
    expect(awards).toEqual([
      { potIndex: 0, seat: 1, amount: 101 },
      { potIndex: 0, seat: 4, amount: 101 },
      { potIndex: 0, seat: 7, amount: 100 },
    ])
  })
})

describe('orderFromButton', () => {
  test('starts immediately left of the button and wraps', () => {
    expect(orderFromButton(7, 9)).toEqual([8, 0, 1, 2, 3, 4, 5, 6, 7])
  })
})
