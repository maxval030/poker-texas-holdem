import { describe, expect, test } from 'bun:test'
import { parseCards } from '../src/cards.ts'
import { madeHand } from '../src/madeHand.ts'

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
})
