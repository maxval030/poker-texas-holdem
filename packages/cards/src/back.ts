import { CARD_HEIGHT, CARD_WIDTH, cardFrame } from './geometry.ts'

const INSET = 26
const PANEL_WIDTH = CARD_WIDTH - INSET * 2
const PANEL_HEIGHT = CARD_HEIGHT - INSET * 2
const PANEL_RADIUS = 8
const BORDER_WIDTH = 12

const BASE = '#0b5132'
const GREEN_LINE = '#15794a'
const RED_LINE = '#8c1c2b'
const CREAM_LINE = '#e8e0c8'

const SPACING = 28

/**
 * Each diagonal is trimmed to the panel as it is generated rather than drawn
 * long and clipped, because a nested `<svg>` viewport does not reliably clip
 * paint in every browser and a `clipPath` would need an id that collides once
 * several cards are inlined into one document.
 */
function diagonals(direction: 1 | -1, colour: string, width: number, offset: number): string {
  const parts: string[] = []
  for (let i = -PANEL_HEIGHT; i < PANEL_WIDTH + PANEL_HEIGHT; i += SPACING) {
    const start = i + offset
    const from = direction === 1 ? Math.max(0, -start) : Math.max(0, start - PANEL_WIDTH)
    const to =
      direction === 1 ? Math.min(PANEL_HEIGHT, PANEL_WIDTH - start) : Math.min(PANEL_HEIGHT, start)
    if (to - from < 1) continue
    const x1 = INSET + start + direction * from
    const x2 = INSET + start + direction * to
    parts.push(`M${round(x1)} ${round(INSET + from)}L${round(x2)} ${round(INSET + to)}`)
  }
  return `<path d="${parts.join('')}" stroke="${colour}" stroke-width="${width}" fill="none"/>`
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Drawn rather than downloaded so it shares the deck's frame exactly. The
 * reference artwork is 2:3, the same as the court cards, so no rescaling is
 * involved and a card keeps its shape through a flip.
 */
export function cardBackSvgBody(): string {
  const panel = [
    `<rect x="${INSET}" y="${INSET}" width="${PANEL_WIDTH}" height="${PANEL_HEIGHT}" rx="${PANEL_RADIUS}" fill="${BASE}"/>`,
    diagonals(1, RED_LINE, 10, 0),
    diagonals(-1, GREEN_LINE, 10, 0),
    diagonals(1, CREAM_LINE, 2, SPACING / 2),
    diagonals(-1, CREAM_LINE, 2, SPACING / 2),
  ].join('')

  // The band is stroked over the panel edge so the blunt ends of the diagonals
  // sit under it, which is what stops the pattern looking torn.
  const edge = BORDER_WIDTH / 2
  const band = `<rect x="${INSET}" y="${INSET}" width="${PANEL_WIDTH}" height="${PANEL_HEIGHT}" rx="${PANEL_RADIUS}" fill="none" stroke="${CREAM_LINE}" stroke-width="${BORDER_WIDTH}"/>`
  const outline = `<rect x="${INSET - edge}" y="${INSET - edge}" width="${PANEL_WIDTH + BORDER_WIDTH}" height="${PANEL_HEIGHT + BORDER_WIDTH}" rx="${PANEL_RADIUS + edge}" fill="none" stroke="${BASE}" stroke-width="2"/>`

  return cardFrame() + panel + band + outline
}
