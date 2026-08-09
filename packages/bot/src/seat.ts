import type { BotDifficulty, Occupant, Rng, TableState } from '@holdem/engine'
import type { EquityEstimator } from '@holdem/evaluator'
import { type BotDecision, decide } from './decide.ts'
import { type BotProfile, profileFor } from './profile.ts'
import { situationFor } from './situation.ts'

const BOT_NAMES = [
  'Ada',
  'Boris',
  'Chai',
  'Dara',
  'Eiko',
  'Farid',
  'Gita',
  'Hugo',
  'Imani',
  'Jarno',
  'Kanya',
  'Luca',
] as const

export function makeBotOccupant(
  seat: number,
  difficulty: BotDifficulty,
  personalitySeed: number,
): Occupant {
  return {
    id: `bot:${seat}:${personalitySeed >>> 0}`,
    name: BOT_NAMES[personalitySeed % BOT_NAMES.length] as string,
    kind: 'bot',
    difficulty,
    personalitySeed,
  }
}

export function profileForSeat(occupant: Occupant): BotProfile {
  return profileFor(occupant.difficulty ?? 'normal', occupant.personalitySeed ?? 1)
}

/**
 * Convenience wrapper for the two callers that already hold a whole table: the
 * single-player Worker and the server's bot scheduler. Returns `null` when the
 * seat is not actually facing a decision.
 */
export function decideForSeat(
  state: TableState,
  seat: number,
  estimator: EquityEstimator,
  rng: Rng,
  profileOverride?: BotProfile,
): BotDecision | null {
  const chair = state.seats[seat]
  if (!chair?.occupant) return null
  const situation = situationFor(state, seat)
  if (!situation) return null
  const profile = profileOverride ?? profileForSeat(chair.occupant)
  return decide({ situation, profile, estimator, rng })
}
