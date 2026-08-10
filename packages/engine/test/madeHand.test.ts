import { describe, expect, test } from 'bun:test'
import type { Card } from '../src/cards.ts'
import { parseCards } from '../src/cards.ts'
import { madeHand } from '../src/madeHand.ts'
import { combinationsNChoose5, rank5 } from '../src/reference.ts'

describe('madeHand', () => {
  test('null when hole is not two cards', () => {
    expect(madeHand([], [])).toBeNull()
    expect(madeHand(parseCards('As'), [])).toBeNull()
  })

  test('preflop pair', () => {
    const hole = parseCards('As Ad')
    const result = madeHand(hole, [])
    expect(result?.category).toBe('one-pair')
    expect(result?.holeContributing).toEqual(hole)
    expect(result?.boardContributing).toEqual([])
  })

  test('preflop high card highlights both holes', () => {
    const hole = parseCards('As Kd')
    const result = madeHand(hole, [])
    expect(result?.category).toBe('high-card')
    expect(result?.holeContributing).toEqual(hole)
  })

  test('playing the board uses no hole cards', () => {
    // Board straight (mixed suits); holes do not improve
    const hole = parseCards('2c 7d')
    const board = parseCards('9c Ts Jd Qh Ks')
    const result = madeHand(hole, board)
    expect(result?.category).toBe('straight')
    expect(result?.holeContributing).toEqual([])
    expect(result?.boardContributing).toEqual(board)
  })

  test('flush can use one hole card', () => {
    const hole = parseCards('As 2d')
    const board = parseCards('Ks 9s 4s 3s 7h')
    const result = madeHand(hole, board)
    expect(result?.category).toBe('flush')
    expect(result?.holeContributing).toEqual(parseCards('As'))
    expect(new Set(result?.boardContributing)).toEqual(new Set(parseCards('Ks 9s 4s 3s')))
  })

  test('equal rank5 scores keep first combo in enumeration order', () => {
    const hole = parseCards('As Ah')
    const board = parseCards('Kc Kd Qs Qh Jc')
    const cards = [...hole, ...board]

    const hand: Card[] = [0, 0, 0, 0, 0]
    let best = Number.POSITIVE_INFINITY
    const tiedCombos: readonly number[][] = []
    for (const combo of combinationsNChoose5(cards.length)) {
      for (let i = 0; i < 5; i++) hand[i] = cards[combo[i] as number] as Card
      const value = rank5(hand)
      if (value < best) {
        best = value
        tiedCombos.length = 0
        tiedCombos.push([...combo])
      } else if (value === best) {
        tiedCombos.push([...combo])
      }
    }

    expect(tiedCombos.length).toBeGreaterThan(1)
    const firstCombo = tiedCombos[0] as readonly number[]
    const secondCombo = tiedCombos[1] as readonly number[]
    expect(firstCombo).toEqual([0, 1, 2, 3, 4])
    expect(secondCombo).toEqual([0, 1, 2, 3, 5])

    const result = madeHand(hole, board)
    expect(result?.category).toBe('two-pair')
    expect(result?.holeContributing).toEqual(hole)
    expect(result?.boardContributing).toEqual(parseCards('Kc Kd Qs'))
  })
})
