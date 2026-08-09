import type { Card } from '@holdem/engine'
import { evaluate } from '@pokertools/evaluator'

export type { EquityEstimator, EquityRequest, EquityResult } from './equity.ts'
export { createEquityEstimator, estimateEquity } from './equity.ts'

/**
 * Both encodings are `(rank << 2) | suit` with identical rank indices, but the
 * suits run in opposite order: this package uses c d h s while the library uses
 * s h d c. Reversing two bits is an XOR with 3.
 */
export function toCode(card: Card): number {
  return card ^ 3
}

export function toCodes(cards: readonly Card[]): number[] {
  const out = new Array<number>(cards.length)
  for (let i = 0; i < cards.length; i++) out[i] = (cards[i] as number) ^ 3
  return out
}

export function fromCode(code: number): Card {
  return code ^ 3
}

/**
 * Reused so the hot path allocates nothing. Safe because JavaScript runs one
 * turn at a time within a realm and `evaluate` never calls back into this
 * module. Every Worker gets its own module instance, which is also what the
 * library requires, since it keeps module-level scratch state of its own.
 */
const scratch7: number[] = [0, 0, 0, 0, 0, 0, 0]

/** Lower is better, on the Cactus Kev scale where 1 is a royal flush. */
export function evaluate7(cards: readonly Card[]): number {
  if (cards.length !== 7) throw new Error(`expected 7 cards, got ${cards.length}`)
  for (let i = 0; i < 7; i++) scratch7[i] = (cards[i] as number) ^ 3
  return evaluate(scratch7)
}

export function evaluateCards(cards: readonly Card[]): number {
  return evaluate(toCodes(cards))
}

export const BEST_POSSIBLE_SCORE = 1
export const WORST_POSSIBLE_SCORE = 7462
