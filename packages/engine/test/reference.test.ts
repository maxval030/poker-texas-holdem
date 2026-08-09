import { describe, expect, test } from 'bun:test'
import { parseCards } from '../src/cards.ts'
import { referenceEvaluate7 } from '../src/reference.ts'

const better = (a: string, b: string) =>
  referenceEvaluate7(parseCards(a)) < referenceEvaluate7(parseCards(b))

describe('referenceEvaluate7', () => {
  test('orders the hand categories correctly', () => {
    const ladder = [
      'As Ks Qs Js Ts 2c 3d', // royal flush
      '9h 8h 7h 6h 5h 2c 3d', // straight flush
      'Ac Ad Ah As Kc 2d 3h', // quads
      'Kc Kd Kh 9s 9c 2d 3h', // full house
      'Ac Jc 8c 5c 2c 3d 4h', // flush
      'Ac Kd Qh Js Tc 2d 3h', // straight
      'Qc Qd Qh 8s 5c 2d 3h', // trips
      'Jc Jd 8h 8s 5c 2d 3h', // two pair
      'Tc Td 8h 6s 4c 2d 3h', // pair
      'Ac Jd 9h 6s 4c 2d 3h', // high card
    ]
    for (let i = 0; i < ladder.length - 1; i++) {
      expect(better(ladder[i] as string, ladder[i + 1] as string)).toBe(true)
    }
  })

  test('reads the wheel as a five-high straight, not an ace-high one', () => {
    expect(better('6c 5d 4h 3s 2c Kd Qh', 'Ac 5d 4h 3s 2c Kd Qh')).toBe(true)
    expect(better('Ac 5d 4h 3s 2c Kd Qh', 'Ac Kd Qh 9s 7c 5d 3h')).toBe(true)
  })

  test('separates hands of the same category by kicker', () => {
    expect(better('Ac Ad Kh 7s 4c 2d 3h', 'Ac Ad Qh 7s 4c 2d 3h')).toBe(true)
    expect(better('Ac Kc 9c 5c 3c 2d 4h', 'Qc Kc 9c 5c 3c 2d 4h')).toBe(true)
  })

  test('finds the best five of seven rather than using the first five', () => {
    const score = referenceEvaluate7(parseCards('2c 3d As Ks Qs Js Ts'))
    expect(score).toBe(referenceEvaluate7(parseCards('As Ks Qs Js Ts 7h 4d')))
  })

  test('gives identical hands identical scores regardless of card order', () => {
    expect(referenceEvaluate7(parseCards('Ac Kd Qh Js Tc 2d 3h'))).toBe(
      referenceEvaluate7(parseCards('3h 2d Tc Js Qh Kd Ac')),
    )
  })
})
