import type { Card } from './cards.ts'
import { handCategory, type HandCategory } from './handrank.ts'
import { buildPots } from './pots.ts'
import { chipDeltas } from './result.ts'
import type { GameEvent, HandPlayer, HandState, Pot, Seat, TableState } from './types.ts'

export interface HandPlayerView extends Omit<HandPlayer, 'holeCards'> {
  holeCards: [Card, Card] | null
  hasCards: boolean
}

export interface HandStateView extends Omit<HandState, 'players' | 'deck'> {
  players: HandPlayerView[]
  pots: Pot[]
  potTotal: number
}

export interface HandResultView {
  winners: number[]
  deltas: { seat: number; delta: number; awarded: number; committed: number }[]
  categories: { seat: number; category: HandCategory }[]
  revealDeadline: number | null
  canShow: boolean
  settled: boolean
}

export interface TableStateView extends Omit<TableState, 'hand'> {
  hand: HandStateView | null
  viewerSeat: number | null
  result: HandResultView | null
}

/**
 * The only state a client is allowed to hold. Hole cards belonging to anyone but
 * the viewer are stripped here, before the state ever reaches a socket.
 */
export function viewFor(state: TableState, viewerSeat: number | null): TableStateView {
  const seats: Seat[] = state.seats.map((seat) => ({ ...seat }))
  if (!state.hand) {
    return { ...state, seats, hand: null, viewerSeat, result: null }
  }

  const hand = state.hand
  const shown = new Set(
    hand.reveal?.choices.filter((c) => c.choice === 'shown').map((c) => c.seat) ?? [],
  )
  const players: HandPlayerView[] = hand.players.map((player) => {
    const visible = player.seat === viewerSeat || shown.has(player.seat)
    return {
      seat: player.seat,
      status: player.status,
      committed: player.committed,
      totalCommitted: player.totalCommitted,
      hasActedThisRound: player.hasActedThisRound,
      mayRaise: player.mayRaise,
      holeCards: visible ? ([...player.holeCards] as [Card, Card]) : null,
      hasCards: true,
    }
  })

  const pots = buildPots(hand.players)
  let potTotal = 0
  for (const player of hand.players) potTotal += player.totalCommitted

  return {
    ...state,
    seats,
    viewerSeat,
    result: buildResult(hand, viewerSeat),
    hand: {
      handNumber: hand.handNumber,
      buttonSeat: hand.buttonSeat,
      board: [...hand.board],
      street: hand.street,
      players,
      actorSeat: hand.actorSeat,
      actionAnchor: hand.actionAnchor,
      smallBlindSeat: hand.smallBlindSeat,
      bigBlindSeat: hand.bigBlindSeat,
      betToCall: hand.betToCall,
      lastFullRaiseSize: hand.lastFullRaiseSize,
      collected: hand.collected,
      deadline: hand.deadline,
      complete: hand.complete,
      reveal: hand.reveal,
      pots,
      potTotal,
    },
  }
}

function buildResult(hand: HandState, viewerSeat: number | null): HandResultView | null {
  if (!hand.complete || !hand.reveal) return null

  const reveal = hand.reveal
  const awardedBySeat = new Map<number, number>()
  for (const award of reveal.awards) {
    awardedBySeat.set(award.seat, (awardedBySeat.get(award.seat) ?? 0) + award.amount)
  }
  const winners = [...awardedBySeat.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([seat]) => seat)

  const winnerSet = new Set(winners)
  const categories: { seat: number; category: HandCategory }[] = []
  for (const entry of reveal.choices) {
    if (entry.choice !== 'shown' || entry.score === undefined) continue
    if (!winnerSet.has(entry.seat)) continue
    categories.push({ seat: entry.seat, category: handCategory(entry.score) })
  }

  return {
    winners,
    deltas: chipDeltas(reveal.awards, hand.players),
    categories,
    revealDeadline: reveal.deadline,
    canShow: reveal.choices.some((c) => c.seat === viewerSeat && c.choice === 'pending'),
    settled: reveal.settled,
  }
}

/**
 * Events are published between instances with every hole card intact, because a
 * new table owner has to be able to rebuild the hand. This runs at the edge, once
 * per recipient, and is the last thing between a private card and a socket.
 */
export function redactEvent(event: GameEvent, viewerSeat: number | null): GameEvent | null {
  if (event.type !== 'hole-cards-dealt') return event
  const deals = event.deals.filter((deal) => deal.seat === viewerSeat)
  if (deals.length === 0) return null
  return { type: 'hole-cards-dealt', deals }
}
