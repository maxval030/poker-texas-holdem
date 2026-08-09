export type HandCategory =
  | 'straight-flush'
  | 'four-of-a-kind'
  | 'full-house'
  | 'flush'
  | 'straight'
  | 'three-of-a-kind'
  | 'two-pair'
  | 'one-pair'
  | 'high-card'

/** Upper bound of each category on the Cactus Kev scale, where 1 is a royal flush. */
const CATEGORY_BOUNDS: { max: number; category: HandCategory }[] = [
  { max: 10, category: 'straight-flush' },
  { max: 166, category: 'four-of-a-kind' },
  { max: 322, category: 'full-house' },
  { max: 1599, category: 'flush' },
  { max: 1609, category: 'straight' },
  { max: 2467, category: 'three-of-a-kind' },
  { max: 3325, category: 'two-pair' },
  { max: 6185, category: 'one-pair' },
  { max: 7462, category: 'high-card' },
]

export function handCategory(score: number): HandCategory {
  for (const bound of CATEGORY_BOUNDS) {
    if (score <= bound.max) return bound.category
  }
  return 'high-card'
}

export function isRoyalFlush(score: number): boolean {
  return score === 1
}
