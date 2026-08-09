import type { PlayerAction, Rng } from '@holdem/engine'
import type { EquityEstimator } from '@holdem/evaluator'
import { type BotProfile, nextFloat } from './profile.ts'
import type { BotSituation } from './situation.ts'

export interface BotDecision {
  action: PlayerAction
  /** How long the caller should wait before submitting, so play feels human. */
  delayMs: number
  equity: number
  potOdds: number
  iterations: number
  reason: DecisionReason
}

export type DecisionReason =
  | 'value-raise'
  | 'semi-bluff'
  | 'call-getting-odds'
  | 'check-behind'
  | 'fold-no-odds'
  | 'forced-all-in'

export interface DecideRequest {
  situation: BotSituation
  profile: BotProfile
  estimator: EquityEstimator
  rng: Rng
}

const MIN_DELAY_MS = 800
const MAX_DELAY_MS = 2_500

export function decide(request: DecideRequest): BotDecision {
  const { situation, profile, estimator, rng } = request
  const { toCall, pot } = situation

  const sample = estimator({
    hole: situation.hole,
    board: situation.board,
    opponents: situation.opponents,
    rng,
    timeBudgetMs: profile.timeBudgetMs,
    maxIterations: profile.maxIterations,
  })

  const noise = (nextFloat(rng) - 0.5) * 2 * profile.noise
  const equity = clamp(sample.equity + noise, 0, 1)
  const potOdds = toCall === 0 ? 0 : toCall / (pot + toCall)

  const fairShare = 1 / (situation.opponents + 1)
  const positionBonus = profile.usesPosition ? (situation.position - 0.5) * 0.05 : 0
  const valueEdge = 0.12 + 0.16 * profile.tightness - 0.08 * profile.aggression - positionBonus
  const raiseThreshold = Math.min(0.9, fairShare + valueEdge)
  const callSlack = 0.06 * (1 - profile.tightness)

  const decision = choose({
    equity,
    potOdds,
    raiseThreshold,
    callSlack,
    situation,
    profile,
    rng,
  })

  return {
    ...decision,
    delayMs: humanDelay(equity, potOdds, toCall > 0, rng),
    equity,
    potOdds,
    iterations: sample.iterations,
  }

  function clamp(value: number, low: number, high: number): number {
    return value < low ? low : value > high ? high : value
  }

  function humanDelay(eq: number, odds: number, facingBet: boolean, source: Rng): number {
    // Close decisions take longer, which is both realistic and free.
    const closeness = 1 - Math.min(1, Math.abs(eq - (facingBet ? odds : 0.5)) * 3)
    const span = MAX_DELAY_MS - MIN_DELAY_MS
    const thinking = closeness * span * 0.6
    const jitter = nextFloat(source) * span * 0.4
    return Math.round(MIN_DELAY_MS + thinking + jitter)
  }
}

interface ChoiceInput {
  equity: number
  potOdds: number
  raiseThreshold: number
  callSlack: number
  situation: BotSituation
  profile: BotProfile
  rng: Rng
}

function choose(input: ChoiceInput): Pick<BotDecision, 'action' | 'reason'> {
  const { equity, potOdds, raiseThreshold, callSlack, situation } = input
  const { legal, toCall } = situation

  const canRaise = legal.raise !== null
  const wantsValue = equity >= raiseThreshold

  if (toCall === 0) {
    if (canRaise && wantsValue) {
      return { action: sizedRaise(input), reason: 'value-raise' }
    }
    if (canRaise && shouldBluff(input)) {
      return { action: sizedRaise(input), reason: 'semi-bluff' }
    }
    return legal.canCheck
      ? { action: { type: 'check' }, reason: 'check-behind' }
      : { action: { type: 'fold' }, reason: 'fold-no-odds' }
  }

  if (!legal.call) {
    return { action: { type: 'fold' }, reason: 'fold-no-odds' }
  }

  // Calling all-in for the last chips is the whole decision when there is nothing
  // left to raise with.
  if (legal.call.allIn && !canRaise) {
    return equity + callSlack >= potOdds
      ? { action: { type: 'call' }, reason: 'forced-all-in' }
      : { action: { type: 'fold' }, reason: 'fold-no-odds' }
  }

  if (canRaise && wantsValue) {
    return { action: sizedRaise(input), reason: 'value-raise' }
  }

  if (equity + callSlack < potOdds) {
    if (canRaise && shouldBluff(input)) {
      return { action: sizedRaise(input), reason: 'semi-bluff' }
    }
    return { action: { type: 'fold' }, reason: 'fold-no-odds' }
  }

  return { action: { type: 'call' }, reason: 'call-getting-odds' }
}

function shouldBluff(input: ChoiceInput): boolean {
  const { equity, situation, profile, rng } = input
  // Only semi-bluff: some chance to improve, a price worth risking, and never
  // into a crowd, where somebody always has something.
  if (equity < 0.22 || situation.opponents > 3) return false
  const priceIsRight = situation.toCall <= situation.pot * 0.4
  if (!priceIsRight) return false
  const frequency = (0.05 + 0.25 * profile.aggression) / situation.opponents
  return nextFloat(rng) < frequency
}

function sizedRaise(input: ChoiceInput): PlayerAction {
  const { equity, raiseThreshold, situation, profile, rng } = input
  const raise = situation.legal.raise
  if (!raise) return { type: 'call' }

  const potAfterCall = situation.pot + situation.toCall
  const edge = Math.max(0, equity - raiseThreshold)
  const fraction = 0.45 + 0.45 * profile.aggression + 1.2 * edge
  const jitter = 0.85 + nextFloat(rng) * 0.3

  const target =
    situation.committed + situation.toCall + Math.round(potAfterCall * fraction * jitter)
  const clamped = Math.max(raise.min, Math.min(raise.max, target))

  // Leaving a token amount behind after a big raise is worse than committing it,
  // and so is nursing a short stack when the pot already dwarfs it.
  const wouldLeaveCrumbs = raise.max - clamped < situation.bigBlind * 2
  const stackToPot = raise.max / Math.max(1, potAfterCall)
  const potCommitted = equity > 0.85 && stackToPot < 2.5
  const to = wouldLeaveCrumbs || potCommitted ? raise.max : clamped

  return { type: raise.isOpeningBet ? 'bet' : 'raise', to }
}
