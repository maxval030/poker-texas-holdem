export type Card = number

export const RANK_CHARS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const
export const SUIT_CHARS = ['c', 'd', 'h', 's'] as const

export type RankIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
export type SuitIndex = 0 | 1 | 2 | 3

export const DECK_SIZE = 52

export function rankOf(card: Card): number {
  return card >> 2
}

export function suitOf(card: Card): number {
  return card & 3
}

export function makeCard(rank: number, suit: number): Card {
  return (rank << 2) | suit
}

export function cardToString(card: Card): string {
  return `${RANK_CHARS[rankOf(card)]}${SUIT_CHARS[suitOf(card)]}`
}

export function parseCard(text: string): Card {
  const rank = RANK_CHARS.indexOf(text[0]?.toUpperCase() as (typeof RANK_CHARS)[number])
  const suit = SUIT_CHARS.indexOf(text[1]?.toLowerCase() as (typeof SUIT_CHARS)[number])
  if (rank < 0 || suit < 0) throw new Error(`invalid card: ${text}`)
  return makeCard(rank, suit)
}

export function parseCards(text: string): Card[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map(parseCard)
}

export function freshDeck(): Card[] {
  const deck = new Array<Card>(DECK_SIZE)
  for (let i = 0; i < DECK_SIZE; i++) deck[i] = i
  return deck
}
