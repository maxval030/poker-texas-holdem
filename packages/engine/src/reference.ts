import type { Card } from './cards.ts'
import { rankOf, suitOf } from './cards.ts'

/**
 * A slow but obviously correct hand ranker, kept as the yardstick the fast
 * evaluator is tested against and as a fallback when no evaluator is injected.
 * Scores are ordered lowest-is-best but are not on the Cactus Kev scale.
 */

const TUPLE_BASE = 13
const TUPLE_SPAN = TUPLE_BASE ** 5

function tupleValue(parts: readonly number[]): number {
  let value = 0
  for (let i = 0; i < 5; i++) value = value * TUPLE_BASE + (parts[i] ?? 0)
  return value
}

function score(category: number, parts: readonly number[]): number {
  return category * TUPLE_SPAN + (TUPLE_SPAN - 1 - tupleValue(parts))
}

export function rank5(cards: readonly Card[]): number {
  const ranks = cards.map(rankOf).sort((a, b) => b - a)
  const firstSuit = suitOf(cards[0] as Card)
  const isFlush = cards.every((c) => suitOf(c) === firstSuit)

  const counts = new Map<number, number>()
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])

  const unique = [...counts.keys()].sort((a, b) => b - a)
  let straightHigh = -1
  if (unique.length === 5) {
    if ((unique[0] as number) - (unique[4] as number) === 4) straightHigh = unique[0] as number
    else if (unique[0] === 12 && unique[1] === 3 && unique[4] === 0) straightHigh = 3
  }

  if (isFlush && straightHigh >= 0) return score(0, [straightHigh])
  if (groups[0]?.[1] === 4) return score(1, [groups[0][0], groups[1]?.[0] ?? 0])
  if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) return score(2, [groups[0][0], groups[1][0]])
  if (isFlush) return score(3, ranks)
  if (straightHigh >= 0) return score(4, [straightHigh])
  if (groups[0]?.[1] === 3) {
    return score(5, [groups[0][0], groups[1]?.[0] ?? 0, groups[2]?.[0] ?? 0])
  }
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) {
    return score(6, [groups[0][0], groups[1][0], groups[2]?.[0] ?? 0])
  }
  if (groups[0]?.[1] === 2) {
    return score(7, [groups[0][0], groups[1]?.[0] ?? 0, groups[2]?.[0] ?? 0, groups[3]?.[0] ?? 0])
  }
  return score(8, ranks)
}

const COMBINATIONS_7_CHOOSE_5: readonly (readonly number[])[] = (() => {
  const out: number[][] = []
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++)
      for (let c = b + 1; c < 7; c++)
        for (let d = c + 1; d < 7; d++) for (let e = d + 1; e < 7; e++) out.push([a, b, c, d, e])
  return out
})()

export function referenceEvaluate7(cards: readonly Card[]): number {
  if (cards.length !== 7) throw new Error(`expected 7 cards, got ${cards.length}`)
  const hand: Card[] = [0, 0, 0, 0, 0]
  let best = Number.POSITIVE_INFINITY
  for (const combo of COMBINATIONS_7_CHOOSE_5) {
    for (let i = 0; i < 5; i++) hand[i] = cards[combo[i] as number] as Card
    const value = rank5(hand)
    if (value < best) best = value
  }
  return best
}
