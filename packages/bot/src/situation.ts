import type { Card, LegalActions, Street, TableState } from '@holdem/engine'
import { findPlayer, legalActionsFor } from '@holdem/engine'

/**
 * Everything a bot is allowed to know. Built by a single function that reads the
 * full table, so no other part of the bot can reach an opponent's hole cards
 * even by accident.
 */
export interface BotSituation {
  seat: number
  hole: [Card, Card]
  board: Card[]
  street: Street
  /** Opponents who can still win the pot. */
  opponents: number
  /** Chips already committed by everyone, this round included. */
  pot: number
  /** Extra chips needed to call. */
  toCall: number
  stack: number
  committed: number
  bigBlind: number
  legal: LegalActions
  /** 0 when acting first, 1 when acting last among the players still in. */
  position: number
}

export function situationFor(state: TableState, seat: number): BotSituation | null {
  const hand = state.hand
  if (!hand || hand.complete) return null
  const player = findPlayer(hand, seat)
  const chair = state.seats[seat]
  const legal = legalActionsFor(state, seat)
  if (!player || !chair || !legal) return null

  let pot = 0
  let opponents = 0
  for (const other of hand.players) {
    pot += other.totalCommitted
    if (other.seat !== seat && other.status !== 'folded') opponents += 1
  }

  const stillToAct = hand.players.filter((p) => p.status === 'active')
  const seatOrder = stillToAct.map((p) => p.seat).sort((a, b) => a - b)
  const index = seatOrder.indexOf(seat)
  const position = seatOrder.length <= 1 ? 1 : index / (seatOrder.length - 1)

  return {
    seat,
    hole: [...player.holeCards] as [Card, Card],
    board: [...hand.board],
    street: hand.street,
    opponents: Math.max(1, Math.min(8, opponents)),
    pot,
    toCall: legal.call?.amount ?? 0,
    stack: chair.stack,
    committed: player.committed,
    bigBlind: state.config.bigBlind,
    legal,
    position,
  }
}
