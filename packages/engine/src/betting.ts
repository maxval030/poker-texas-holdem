import type { HandPlayer, HandState, LegalActions, TableState } from './types.ts'

export function findPlayer(hand: HandState, seat: number): HandPlayer | undefined {
  return hand.players.find((p) => p.seat === seat)
}

export function activePlayers(hand: HandState): HandPlayer[] {
  return hand.players.filter((p) => p.status === 'active')
}

export function contestingPlayers(hand: HandState): HandPlayer[] {
  return hand.players.filter((p) => p.status !== 'folded')
}

export function potTotal(hand: HandState): number {
  let total = 0
  for (const player of hand.players) total += player.totalCommitted
  return total
}

export function legalActionsFor(state: TableState, seat: number): LegalActions | null {
  const hand = state.hand
  if (!hand) return null
  const player = findPlayer(hand, seat)
  const chair = state.seats[seat]
  if (!player || !chair || player.status !== 'active') return null

  const stack = chair.stack
  const toCall = Math.min(hand.betToCall - player.committed, stack)
  const maxTo = player.committed + stack

  let raise: LegalActions['raise'] = null
  if (player.mayRaise && maxTo > hand.betToCall) {
    const fullRaiseTo = hand.betToCall + hand.lastFullRaiseSize
    raise = {
      min: Math.min(fullRaiseTo, maxTo),
      max: maxTo,
      isOpeningBet: hand.betToCall === 0,
    }
  }

  return {
    seat,
    canFold: true,
    canCheck: hand.betToCall === player.committed,
    call: toCall > 0 ? { amount: toCall, allIn: toCall === stack } : null,
    raise,
  }
}

export function isBettingRoundComplete(hand: HandState): boolean {
  const active = activePlayers(hand)
  if (active.length === 0) return true
  // With one player left able to act, everyone else is all-in and there is no
  // future betting to protect, so matching the outstanding bet ends the round.
  if (active.length === 1) return (active[0] as HandPlayer).committed >= hand.betToCall
  return active.every((p) => p.hasActedThisRound && p.committed === hand.betToCall)
}

export function nextActorSeat(hand: HandState, fromSeat: number, maxSeats: number): number | null {
  for (let offset = 1; offset <= maxSeats; offset++) {
    const seat = (fromSeat + offset) % maxSeats
    const player = findPlayer(hand, seat)
    if (player?.status !== 'active') continue
    if (!player.hasActedThisRound || player.committed < hand.betToCall) return seat
  }
  return null
}

/**
 * The chips a single player bet that nobody could match. Returned before pots are
 * built so the displayed pot is the amount actually contested.
 */
export function uncalledExcess(hand: HandState): { seat: number; amount: number } | null {
  let highest = 0
  let second = 0
  let highestSeat = -1
  let highestCount = 0

  for (const player of hand.players) {
    if (player.committed > highest) {
      second = highest
      highest = player.committed
      highestSeat = player.seat
      highestCount = 1
    } else if (player.committed === highest) {
      highestCount += 1
    } else if (player.committed > second) {
      second = player.committed
    }
  }

  if (highestCount !== 1 || highest <= second || highestSeat < 0) return null
  return { seat: highestSeat, amount: highest - second }
}
