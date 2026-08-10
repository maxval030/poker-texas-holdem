import { type Card, RANK_CHARS, rankOf, suitOf } from '@holdem/engine'
import { CARD_HEIGHT, CARD_WIDTH, cardFrame } from './geometry.ts'
import { SUIT_COLORS, suitGlyph } from './suits.ts'

const PIP_SIZE = 74
const ACE_PIP_SIZE = 168

const COLUMN = { left: 0.3, centre: 0.5, right: 0.7 } as const

/** Seven evenly spaced rows, the grid every English pattern pip card sits on. */
function rowY(row: number): number {
  return (0.13 + (row / 6) * 0.74) * CARD_HEIGHT
}

interface Pip {
  x: number
  y: number
}

function column(which: keyof typeof COLUMN): number {
  return COLUMN[which] * CARD_WIDTH
}

function mirrored(rows: number[], side: 'left' | 'right'): Pip[] {
  return rows.map((row) => ({ x: column(side), y: rowY(row) }))
}

function centred(rows: number[]): Pip[] {
  return rows.map((row) => ({ x: column('centre'), y: rowY(row) }))
}

/** Rank index 0 is a deuce and 12 is an ace, matching the engine's encoding. */
const PIP_LAYOUTS: Record<number, Pip[]> = {
  0: [...centred([0, 6])],
  1: [...centred([0, 3, 6])],
  2: [...mirrored([0, 6], 'left'), ...mirrored([0, 6], 'right')],
  3: [...mirrored([0, 6], 'left'), ...mirrored([0, 6], 'right'), ...centred([3])],
  4: [...mirrored([0, 3, 6], 'left'), ...mirrored([0, 3, 6], 'right')],
  5: [...mirrored([0, 3, 6], 'left'), ...mirrored([0, 3, 6], 'right'), ...centred([1.5])],
  6: [...mirrored([0, 3, 6], 'left'), ...mirrored([0, 3, 6], 'right'), ...centred([1.5, 4.5])],
  7: [...mirrored([0, 2, 4, 6], 'left'), ...mirrored([0, 2, 4, 6], 'right'), ...centred([3])],
  8: [...mirrored([0, 2, 4, 6], 'left'), ...mirrored([0, 2, 4, 6], 'right'), ...centred([1, 5])],
}

const INDEX_X = 34
const INDEX_RANK_Y = 62
const INDEX_SUIT_Y = 108
const INDEX_SUIT_SIZE = 40

function cornerIndex(rank: number, suit: number, rotated: boolean): string {
  const label = RANK_CHARS[rank] as string
  const x = rotated ? CARD_WIDTH - INDEX_X : INDEX_X
  const rankY = rotated ? CARD_HEIGHT - INDEX_RANK_Y : INDEX_RANK_Y
  const suitY = rotated ? CARD_HEIGHT - INDEX_SUIT_Y : INDEX_SUIT_Y
  const spin = rotated ? ` transform="rotate(180 ${x} ${rankY})"` : ''
  const text = `<text x="${x}" y="${rankY}" fill="${SUIT_COLORS[suit]}" font-family="Georgia,'Times New Roman',serif" font-size="66" font-weight="700" text-anchor="middle" dominant-baseline="alphabetic"${spin}>${label}</text>`
  return text + suitGlyph(suit, x, suitY, INDEX_SUIT_SIZE, rotated)
}

/**
 * Pips below the middle of the card are turned over, which is what makes a real
 * card readable from either end.
 */
function pipMarkup(suit: number, pips: Pip[]): string {
  const middle = CARD_HEIGHT / 2
  return pips.map((pip) => suitGlyph(suit, pip.x, pip.y, PIP_SIZE, pip.y > middle + 1)).join('')
}

export function isPipCard(card: Card): boolean {
  return rankOf(card) <= 8 || rankOf(card) === 12
}

export function pipCardSvgBody(card: Card): string {
  const rank = rankOf(card)
  const suit = suitOf(card)

  const centre =
    rank === 12
      ? suitGlyph(suit, CARD_WIDTH / 2, CARD_HEIGHT / 2, ACE_PIP_SIZE)
      : pipMarkup(suit, PIP_LAYOUTS[rank] ?? [])

  return cardFrame() + centre + cornerIndex(rank, suit, false) + cornerIndex(rank, suit, true)
}
