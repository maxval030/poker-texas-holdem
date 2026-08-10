import type { Card } from './cards.ts'
import { rankOf } from './cards.ts'
import type { HandCategory } from './handrank.ts'
import { categoryFromRank5Score, combinationsNChoose5, rank5 } from './reference.ts'

export type MadeHand = {
  category: HandCategory
  holeContributing: Card[]
  boardContributing: Card[]
}

export function madeHand(hole: readonly Card[], board: readonly Card[]): MadeHand | null {
  if (hole.length !== 2) return null

  if (board.length === 0) {
    const category: HandCategory =
      rankOf(hole[0] as Card) === rankOf(hole[1] as Card) ? 'one-pair' : 'high-card'
    return {
      category,
      holeContributing: [...hole],
      boardContributing: [],
    }
  }

  const cards = [...hole, ...board]
  if (cards.length < 5) return null

  const hand: Card[] = [0, 0, 0, 0, 0]
  let best = Number.POSITIVE_INFINITY
  let bestCombo: readonly number[] | null = null

  for (const combo of combinationsNChoose5(cards.length)) {
    for (let i = 0; i < 5; i++) hand[i] = cards[combo[i] as number] as Card
    const value = rank5(hand)
    if (value < best) {
      best = value
      bestCombo = combo
    }
  }

  if (bestCombo === null) return null

  const holeSet = new Set(hole)
  const holeContributing: Card[] = []
  const boardContributing: Card[] = []
  for (const index of bestCombo) {
    const card = cards[index] as Card
    if (holeSet.has(card)) holeContributing.push(card)
    else boardContributing.push(card)
  }

  return {
    category: categoryFromRank5Score(best),
    holeContributing,
    boardContributing,
  }
}
