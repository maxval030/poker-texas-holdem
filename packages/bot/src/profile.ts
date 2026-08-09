import type { BotDifficulty, Rng } from '@holdem/engine'

export interface BotProfile {
  difficulty: BotDifficulty
  /** 0 plays almost anything, 1 waits for premium holdings. */
  tightness: number
  /** 0 checks and calls, 1 bets and raises. */
  aggression: number
  /** Iterations the equity estimate is allowed, before the time budget bites. */
  maxIterations: number
  timeBudgetMs: number
  /** Random error added to the equity estimate, which is what makes a bot beatable. */
  noise: number
  /** Whether the bot adjusts for how many players act after it. */
  usesPosition: boolean
}

const DIFFICULTY_BASE: Record<
  BotDifficulty,
  Pick<BotProfile, 'maxIterations' | 'timeBudgetMs' | 'noise' | 'usesPosition'>
> = {
  easy: { maxIterations: 2_000, timeBudgetMs: 12, noise: 0.14, usesPosition: false },
  normal: { maxIterations: 12_000, timeBudgetMs: 25, noise: 0.05, usesPosition: true },
  hard: { maxIterations: 40_000, timeBudgetMs: 30, noise: 0.015, usesPosition: true },
}

/**
 * Personality is two axes drawn from the seat's seed, so a given bot plays the
 * same way for as long as it sits at the table.
 */
export function profileFor(difficulty: BotDifficulty, personalitySeed: number): BotProfile {
  const base = DIFFICULTY_BASE[difficulty]
  const mixed = Math.imul(personalitySeed ^ 0x9e3779b9, 0x85ebca6b) >>> 0
  const tightness = 0.25 + ((mixed & 0xffff) / 0xffff) * 0.55
  const aggression = 0.2 + ((mixed >>> 16) / 0xffff) * 0.65

  return {
    difficulty,
    tightness: Math.round(tightness * 100) / 100,
    aggression: Math.round(aggression * 100) / 100,
    ...base,
  }
}

export function describeProfile(profile: BotProfile): string {
  const style = profile.tightness > 0.55 ? 'tight' : 'loose'
  const temper = profile.aggression > 0.5 ? 'aggressive' : 'passive'
  return `${style}-${temper}`
}

/** Uniform float in `[0, 1)` built from the same integer source the engine uses. */
export function nextFloat(rng: Rng): number {
  return rng.nextInt(0x10_0000) / 0x10_0000
}
