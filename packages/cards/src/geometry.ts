/**
 * Every card in the deck, generated or imported, is drawn on this box. The
 * numbers come from the CC0 English pattern deck whose court cards are used for
 * J, Q and K, so a generated pip card and an imported court card sit in exactly
 * the same frame and a flip animation never changes shape.
 */
export const CARD_WIDTH = 360
export const CARD_HEIGHT = 540
export const CARD_RADIUS = 30
export const CARD_ASPECT = CARD_WIDTH / CARD_HEIGHT
export const CARD_VIEW_BOX = `0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`

export const CARD_BORDER = '#000000'
export const CARD_FACE = '#ffffff'
export const SUIT_RED = '#d40000'
export const SUIT_BLACK = '#000000'

export function cardFrame(fill = CARD_FACE): string {
  return `<rect x=".5" y=".5" width="${CARD_WIDTH - 1}" height="${CARD_HEIGHT - 1}" rx="${CARD_RADIUS - 0.1}" ry="${CARD_RADIUS - 0.1}" fill="${fill}" stroke="${CARD_BORDER}" stroke-width="1"/>`
}
