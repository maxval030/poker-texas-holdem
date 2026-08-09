import type { Card } from './cards.ts'
import type { Evaluate7, HandPlayer, Pot } from './types.ts'

function sameSeats(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * Splits the hand's committed chips into a main pot and however many side pots
 * the all-in stack depths require. Folded players still contribute money but are
 * never eligible to win it back.
 */
export function buildPots(players: readonly HandPlayer[]): Pot[] {
  const contributors = players.filter((p) => p.totalCommitted > 0)
  if (contributors.length === 0) return []

  const levels = [...new Set(contributors.map((p) => p.totalCommitted))].sort((a, b) => a - b)
  const layers: Pot[] = []
  let previousLevel = 0

  for (const level of levels) {
    let amount = 0
    const eligibleSeats: number[] = []
    for (const player of contributors) {
      const upper = Math.min(player.totalCommitted, level)
      const lower = Math.min(player.totalCommitted, previousLevel)
      amount += upper - lower
      if (player.totalCommitted >= level && player.status !== 'folded') {
        eligibleSeats.push(player.seat)
      }
    }
    if (amount > 0) layers.push({ amount, eligibleSeats })
    previousLevel = level
  }

  const merged: Pot[] = []
  for (const layer of layers) {
    const previous = merged[merged.length - 1]
    // A layer nobody is eligible for happens only when every contributor at that
    // depth folded. Folding it back keeps chips conserved rather than stranded.
    if (
      previous &&
      (layer.eligibleSeats.length === 0 || sameSeats(previous.eligibleSeats, layer.eligibleSeats))
    ) {
      previous.amount += layer.amount
      continue
    }
    merged.push({ amount: layer.amount, eligibleSeats: [...layer.eligibleSeats] })
  }

  return merged
}

/** Seat indices ordered clockwise starting immediately left of the button. */
export function orderFromButton(buttonSeat: number, maxSeats: number): number[] {
  const order: number[] = []
  for (let offset = 1; offset <= maxSeats; offset++) {
    order.push((buttonSeat + offset) % maxSeats)
  }
  return order
}

export interface PotAward {
  potIndex: number
  seat: number
  amount: number
}

export interface ShowdownScore {
  seat: number
  score: number
}

export function scoreShowdown(
  players: readonly HandPlayer[],
  board: readonly Card[],
  evaluate7: Evaluate7,
): ShowdownScore[] {
  const scores: ShowdownScore[] = []
  for (const player of players) {
    if (player.status === 'folded') continue
    scores.push({
      seat: player.seat,
      score: evaluate7([player.holeCards[0], player.holeCards[1], ...board]),
    })
  }
  return scores
}

/**
 * Awards each pot to the best eligible hand, splitting ties evenly. Odd chips go
 * to the winner nearest the left of the button, which is the standard rule.
 */
export function settlePots(
  pots: readonly Pot[],
  scores: readonly ShowdownScore[],
  buttonSeat: number,
  maxSeats: number,
): PotAward[] {
  const scoreBySeat = new Map(scores.map((s) => [s.seat, s.score]))
  const positionOrder = orderFromButton(buttonSeat, maxSeats)
  const awards: PotAward[] = []

  pots.forEach((pot, potIndex) => {
    const contenders = pot.eligibleSeats.filter((seat) => scoreBySeat.has(seat))
    if (contenders.length === 0) return

    let bestScore = Number.POSITIVE_INFINITY
    for (const seat of contenders) {
      const score = scoreBySeat.get(seat) as number
      if (score < bestScore) bestScore = score
    }
    const winners = contenders
      .filter((seat) => scoreBySeat.get(seat) === bestScore)
      .sort((a, b) => positionOrder.indexOf(a) - positionOrder.indexOf(b))

    const share = Math.floor(pot.amount / winners.length)
    let remainder = pot.amount - share * winners.length

    for (const seat of winners) {
      let amount = share
      if (remainder > 0) {
        amount += 1
        remainder -= 1
      }
      if (amount > 0) awards.push({ potIndex, seat, amount })
    }
  })

  return awards
}
