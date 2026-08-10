import { SUIT_BLACK, SUIT_RED } from './geometry.ts'

/** Suit glyphs are drawn inside a 100 by 100 box so callers only deal in scale. */
export const SUIT_BOX = 100

const HEART = 'M50 92C10 62 4 38 18 25c12-11 27-5 32 8 5-13 20-19 32-8 14 13 8 37-32 67Z'

const DIAMOND = 'M50 4 90 50 50 96 10 50Z'

/**
 * Three lobes leave a curved hole where they meet, so the triangle joining their
 * centres is filled too. The stem then hangs below it.
 */
const CLUB = [
  '<circle cx="50" cy="28" r="22"/>',
  '<circle cx="24" cy="63" r="22"/>',
  '<circle cx="76" cy="63" r="22"/>',
  '<path d="M50 28 24 63h52Z"/>',
  '<path d="M40 55c2 17-2 31-12 41h44c-10-10-14-24-12-41Z"/>',
].join('')

const SPADE =
  'M50 6C46 20 28 38 16 50 4 62 8 82 26 84c10 1 17-4 20-12 0 10-6 19-16 24h40c-10-5-16-14-16-24 3 8 10 13 20 12 18-2 22-22 10-34C72 38 54 20 50 6Z'

/** Index order matches the engine: clubs, diamonds, hearts, spades. */
export const SUIT_COLORS = [SUIT_BLACK, SUIT_RED, SUIT_RED, SUIT_BLACK] as const
export const SUIT_IS_RED = [false, true, true, false] as const

function suitBody(suit: number): string {
  switch (suit) {
    case 0:
      return CLUB
    case 1:
      return `<path d="${DIAMOND}"/>`
    case 2:
      return `<path d="${HEART}"/>`
    default:
      return `<path d="${SPADE}"/>`
  }
}

/** Suit glyph centred on `x`, `y`, scaled so its box is `size` across. */
export function suitGlyph(
  suit: number,
  x: number,
  y: number,
  size: number,
  rotated = false,
): string {
  const scale = round(size / SUIT_BOX)
  const spin = rotated ? ' rotate(180)' : ''
  const transform = `translate(${round(x)} ${round(y)})${spin} scale(${scale}) translate(-50 -50)`
  return `<g transform="${transform}" fill="${SUIT_COLORS[suit]}">${suitBody(suit)}</g>`
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
