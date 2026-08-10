import { MAX_SEATS } from '@holdem/engine'

/**
 * Everything on the table is laid out in fixed units and the whole stage is
 * scaled by one transform to fit the viewport. Positions therefore never depend
 * on the screen and a resize costs one style write rather than a full layout.
 *
 * The units are deliberately much larger than the CSS pixels they end up as. A
 * phone in portrait scales the portrait stage down by roughly 0.39, so anything
 * meant to read at 14px has to be drawn at about 36 units.
 *
 * There are two stages rather than one. A single oval cannot serve both a phone
 * held upright and an iPad on its side: fitting a tall stage into a wide screen
 * wastes the width and shrinks every label to the point of being unreadable.
 */
export interface Point {
  x: number
  y: number
}

interface LayoutSpec {
  width: number
  height: number
  felt: { cx: number; cy: number; rx: number; ry: number }
  ring: { rx: number; ry: number }
  /** How much wider the two seats flanking the viewer sit, as a factor of the ring. */
  flankSpread: number
  seatWidth: number
  seatHeight: number
  heroCardWidth: number
  seatCardWidth: number
  seatCardPeek: number
  boardCardWidth: number
  boardGap: number
  potOffset: number
  /** How far a seat's chips travel towards the pot, as a fraction of the way. */
  betReach: number
  /** How far the viewer's chips step aside to clear their open cards. */
  heroBetOffset: Point
  /** How far the dealer button sits in from the ring, towards the pot. */
  buttonInward: number
}

export interface Layout extends LayoutSpec {
  railWidth: number
  seats: readonly Point[]
  bets: readonly Point[]
  buttons: readonly Point[]
  board: { cx: number; cy: number; cardWidth: number; gap: number }
  pot: Point
}

const RAIL_WIDTH = 30
export const BUTTON_SIZE = 46

function build(spec: LayoutSpec): Layout {
  const { felt, ring } = spec

  // Position 0 is the bottom of the screen and positions run clockwise, matching
  // the direction the action moves, so the next player to act is always the next
  // badge to the left.
  const seats = Array.from({ length: MAX_SEATS }, (_, position): Point => {
    const angle = Math.PI / 2 + (position * 2 * Math.PI) / MAX_SEATS
    // The viewer is the one player whose cards are dealt into the open, so the
    // seats either side of them are pushed out to clear those cards.
    const flank = position === 1 || position === MAX_SEATS - 1 ? spec.flankSpread : 1
    return {
      x: felt.cx + ring.rx * flank * Math.cos(angle),
      y: felt.cy + ring.ry * Math.sin(angle),
    }
  })

  const bets = seats.map((seat, position): Point => {
    const point = {
      x: seat.x + (felt.cx - seat.x) * spec.betReach,
      y: seat.y + (felt.cy - seat.y) * spec.betReach,
    }
    return position === 0
      ? { x: point.x + spec.heroBetOffset.x, y: point.y + spec.heroBetOffset.y }
      : point
  })

  // The dealer button sits beside the badge rather than between it and the pot,
  // where the chips already are. Clearing half the badge plus the button's own
  // radius is what keeps it off the badge on every seat.
  const along = spec.seatWidth / 2 + BUTTON_SIZE * 1.3
  const buttons = seats.map((seat): Point => {
    const inward = { x: felt.cx - seat.x, y: felt.cy - seat.y }
    const length = Math.hypot(inward.x, inward.y) || 1
    const unit = { x: inward.x / length, y: inward.y / length }
    return {
      x: seat.x + unit.x * spec.buttonInward - unit.y * along,
      y: seat.y + unit.y * spec.buttonInward + unit.x * along,
    }
  })

  return {
    ...spec,
    railWidth: RAIL_WIDTH,
    seats,
    bets,
    buttons,
    board: { cx: felt.cx, cy: felt.cy, cardWidth: spec.boardCardWidth, gap: spec.boardGap },
    pot: { x: felt.cx, y: felt.cy - spec.potOffset },
  }
}

/**
 * The phone-in-hand case. The oval is stretched down the screen, which both
 * fills the space and buys the ring circumference that nine badges need.
 */
export const PORTRAIT = build({
  width: 1000,
  height: 1600,
  felt: { cx: 500, cy: 820, rx: 332, ry: 470 },
  ring: { rx: 360, ry: 640 },
  flankSpread: 1.12,
  seatWidth: 220,
  seatHeight: 110,
  heroCardWidth: 138,
  seatCardWidth: 80,
  seatCardPeek: 50,
  boardCardWidth: 104,
  boardGap: 11,
  potOffset: 190,
  betReach: 0.42,
  heroBetOffset: { x: 128, y: -30 },
  buttonInward: 30,
})

/**
 * The tablet-on-its-side case. A wide screen has room for a wide oval, so the
 * ring spreads out and everything on it can be drawn smaller in stage units,
 * which means larger on screen once the stage is scaled up to fill the width.
 */
export const LANDSCAPE = build({
  width: 1560,
  height: 1000,
  felt: { cx: 780, cy: 500, rx: 520, ry: 296 },
  ring: { rx: 620, ry: 402 },
  flankSpread: 1.05,
  seatWidth: 200,
  seatHeight: 100,
  heroCardWidth: 126,
  seatCardWidth: 74,
  seatCardPeek: 46,
  boardCardWidth: 108,
  boardGap: 12,
  potOffset: 150,
  betReach: 0.36,
  heroBetOffset: { x: 150, y: -22 },
  buttonInward: 26,
})

/**
 * Rotates the table so the viewer is always at the bottom. Spectators and
 * players waiting for a seat keep the natural order with seat 0 at the bottom.
 */
export function positionOfSeat(seat: number, viewerSeat: number | null): number {
  if (viewerSeat === null) return seat
  return (seat - viewerSeat + MAX_SEATS) % MAX_SEATS
}
