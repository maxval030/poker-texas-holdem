import { describe, expect, test } from 'bun:test'
import { chipDeltas, allRevealDecided } from '../src/result.ts'

describe('chipDeltas', () => {
  test('awards minus committed for every contributor', () => {
    const players = [
      { seat: 0, totalCommitted: 100 },
      { seat: 1, totalCommitted: 200 },
      { seat: 2, totalCommitted: 50 },
    ]
    const awards = [
      { seat: 1, amount: 350, potIndex: 0 },
    ]
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
