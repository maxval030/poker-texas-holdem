import type { RevealAward, RevealState, TableState } from './types.ts'

export const REVEAL_WINDOW_MS = 8_000

export function chipDeltas(
  awards: RevealAward[],
  players: { seat: number; totalCommitted: number }[],
): { seat: number; awarded: number; committed: number; delta: number }[] {
  return players.map((player) => {
    const awarded = awards
      .filter((award) => award.seat === player.seat)
      .reduce((sum, award) => sum + award.amount, 0)
    const committed = player.totalCommitted
    return { seat: player.seat, awarded, committed, delta: awarded - committed }
  })
}

export function allRevealDecided(reveal: RevealState): boolean {
  return reveal.choices.every((entry) => entry.choice !== 'pending')
}

function isEligibleHumanSeat(state: TableState, seat: number): boolean {
  const chair = state.seats[seat]
  if (!chair) return false
  return chair.occupant?.kind === 'human' && chair.controller === 'human'
}

export function eligibleRevealSeats(state: TableState): number[] {
  const hand = state.hand
  if (!hand) return []

  const contesting = hand.players.filter((player) => player.status !== 'folded')

  if (contesting.length === 1) {
    const seat = contesting[0]!.seat
    return isEligibleHumanSeat(state, seat) ? [seat] : []
  }

  return contesting
    .map((player) => player.seat)
    .filter((seat) => isEligibleHumanSeat(state, seat))
}
