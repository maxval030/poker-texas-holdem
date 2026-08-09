import { describe, expect, test } from 'bun:test'
import {
  type Card,
  cardToString,
  DECK_SIZE,
  handCategory,
  parseCards,
  referenceEvaluate7,
  seededRng,
} from '@holdem/engine'
import { createEquityEstimator, evaluate7, toCode } from '../src/index.ts'

describe('card code translation', () => {
  test('agrees with the library on every card in the deck', async () => {
    const { stringifyCardCode } = await import('@pokertools/evaluator')
    for (let card = 0; card < DECK_SIZE; card++) {
      expect(stringifyCardCode(toCode(card))).toBe(cardToString(card))
    }
  })
})

describe('evaluate7', () => {
  test('puts a royal flush at the top of the scale', () => {
    expect(evaluate7(parseCards('As Ks Qs Js Ts 2c 3d'))).toBe(1)
  })

  test('puts the worst possible hand at the bottom of the scale', () => {
    expect(evaluate7(parseCards('7h 5s 4d 3c 2h 8s 9d'))).toBeLessThanOrEqual(7462)
    expect(evaluate7(parseCards('2c 3d 4h 5s 7c 8d 9h'))).toBeGreaterThan(6000)
  })

  test('reads the wheel as the weakest straight', () => {
    const wheel = evaluate7(parseCards('Ac 5d 4h 3s 2c Kd Qh'))
    const sixHigh = evaluate7(parseCards('6c 5d 4h 3s 2c Kd Qh'))
    expect(handCategory(wheel)).toBe('straight')
    expect(wheel).toBeGreaterThan(sixHigh)
  })

  test('scores identical hands identically regardless of card order', () => {
    expect(evaluate7(parseCards('Ac Kd Qh Js Tc 2d 3h'))).toBe(
      evaluate7(parseCards('3h 2d Tc Js Qh Kd Ac')),
    )
  })
})

describe('agreement with the reference ranker', () => {
  test('orders fifty thousand random pairs of hands the same way', () => {
    const rng = seededRng(4242)
    const deck: Card[] = Array.from({ length: DECK_SIZE }, (_, i) => i)

    const drawSeven = (): Card[] => {
      for (let i = 0; i < 7; i++) {
        const j = i + rng.nextInt(DECK_SIZE - i)
        const tmp = deck[i] as Card
        deck[i] = deck[j] as Card
        deck[j] = tmp
      }
      return deck.slice(0, 7)
    }

    let compared = 0
    for (let i = 0; i < 50_000; i++) {
      const left = drawSeven()
      const right = drawSeven()
      const fastOrder = Math.sign(evaluate7(left) - evaluate7(right))
      const slowOrder = Math.sign(referenceEvaluate7(left) - referenceEvaluate7(right))
      if (fastOrder !== slowOrder) {
        throw new Error(
          `disagreement on ${left.map(cardToString).join(' ')} vs ${right.map(cardToString).join(' ')}`,
        )
      }
      compared++
    }
    expect(compared).toBe(50_000)
  })

  test('assigns equal scores to hands the reference calls equal', () => {
    const rng = seededRng(777)
    const deck: Card[] = Array.from({ length: DECK_SIZE }, (_, i) => i)
    const seen = new Map<number, number>()

    for (let i = 0; i < 20_000; i++) {
      for (let k = 0; k < 7; k++) {
        const j = k + rng.nextInt(DECK_SIZE - k)
        const tmp = deck[k] as Card
        deck[k] = deck[j] as Card
        deck[j] = tmp
      }
      const hand = deck.slice(0, 7)
      const fast = evaluate7(hand)
      const slow = referenceEvaluate7(hand)
      const previous = seen.get(slow)
      if (previous === undefined) seen.set(slow, fast)
      else expect(fast).toBe(previous)
    }
  })
})

describe('equity estimation', () => {
  test('gives pocket aces a large edge over pocket deuces heads-up', () => {
    const estimate = createEquityEstimator()
    const result = estimate({
      hole: parseCards('Ah As') as [Card, Card],
      board: [],
      opponents: 1,
      rng: seededRng(1),
      timeBudgetMs: 1_000,
      maxIterations: 20_000,
    })
    expect(result.iterations).toBeGreaterThan(1_000)
    expect(result.equity).toBeGreaterThan(0.8)
    expect(result.equity).toBeLessThan(0.88)
  })

  test('scores a made nut flush near certainty on the river', () => {
    const estimate = createEquityEstimator()
    const result = estimate({
      hole: parseCards('As Ks') as [Card, Card],
      board: parseCards('Qs Js Ts 3h 4d'),
      opponents: 3,
      rng: seededRng(2),
      timeBudgetMs: 1_000,
      maxIterations: 5_000,
    })
    expect(result.equity).toBe(1)
  })

  test('halves the equity of a board that plays itself', () => {
    const estimate = createEquityEstimator()
    const result = estimate({
      hole: parseCards('2c 3d') as [Card, Card],
      board: parseCards('As Ks Qs Js Ts'),
      opponents: 1,
      rng: seededRng(3),
      timeBudgetMs: 1_000,
      maxIterations: 3_000,
    })
    expect(result.equity).toBeCloseTo(0.5, 2)
  })

  test('loses equity as opponents are added', () => {
    const estimate = createEquityEstimator()
    const run = (opponents: number) =>
      estimate({
        hole: parseCards('Ah As') as [Card, Card],
        board: [],
        opponents,
        rng: seededRng(9),
        timeBudgetMs: 2_000,
        maxIterations: 15_000,
      }).equity

    const heads = run(1)
    const five = run(5)
    const eight = run(8)
    expect(heads).toBeGreaterThan(five)
    expect(five).toBeGreaterThan(eight)
    expect(eight).toBeGreaterThan(0.25)
  })

  test('stops at the time budget rather than the iteration cap', () => {
    const estimate = createEquityEstimator()
    const result = estimate({
      hole: parseCards('Ah As') as [Card, Card],
      board: [],
      opponents: 8,
      rng: seededRng(5),
      timeBudgetMs: 20,
      maxIterations: 10_000_000,
    })
    expect(result.iterations).toBeLessThan(10_000_000)
    expect(result.elapsedMs).toBeLessThan(200)
  })

  test('two estimators do not disturb each other', () => {
    const a = createEquityEstimator()
    const b = createEquityEstimator()
    const request = {
      hole: parseCards('Ah As') as [Card, Card],
      board: [],
      opponents: 2,
      timeBudgetMs: 1_000,
      maxIterations: 4_000,
    }
    const first = a({ ...request, rng: seededRng(11) })
    b({ ...request, rng: seededRng(22) })
    const second = a({ ...request, rng: seededRng(11) })
    expect(second.equity).toBe(first.equity)
  })
})
