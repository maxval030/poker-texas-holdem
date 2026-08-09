import type { Card, Rng } from '@holdem/engine'
import { DECK_SIZE } from '@holdem/engine'
import { evaluate } from '@pokertools/evaluator'

export interface EquityRequest {
  hole: readonly [Card, Card]
  /** Zero, three, four or five community cards already dealt. */
  board: readonly Card[]
  opponents: number
  /** Seed a deterministic source to make a run reproducible. */
  rng: Rng
  /** Wall clock ceiling. Reached first on slow devices and crowded tables. */
  timeBudgetMs: number
  maxIterations: number
}

export interface EquityResult {
  /** Share of the pot expected, counting split pots as fractions. */
  equity: number
  wins: number
  ties: number
  iterations: number
  elapsedMs: number
}

export type EquityEstimator = (request: EquityRequest) => EquityResult

const TIME_CHECK_INTERVAL = 128
const MAX_OPPONENTS = 8

/**
 * Builds an estimator that owns its scratch buffers, so repeated calls allocate
 * nothing and two estimators never share mutable state.
 *
 * Only the cards a simulation actually consumes are drawn. Shuffling the whole
 * deck through `radashi.shuffle` instead measured ten times slower with the same
 * random source, and allocates a fresh array on every one of the tens of
 * thousands of iterations a single decision runs.
 */
export function createEquityEstimator(): EquityEstimator {
  const unknown = new Int32Array(DECK_SIZE)
  const inUse = new Uint8Array(DECK_SIZE)
  const hand: number[] = [0, 0, 0, 0, 0, 0, 0]
  const community: number[] = [0, 0, 0, 0, 0]
  const opponentHole = new Int32Array(MAX_OPPONENTS * 2)

  return function estimate(request: EquityRequest): EquityResult {
    const { hole, board, opponents, rng, timeBudgetMs, maxIterations } = request
    if (opponents < 1 || opponents > MAX_OPPONENTS) {
      throw new Error(`opponents must be between 1 and ${MAX_OPPONENTS}`)
    }
    if (board.length !== 0 && board.length !== 3 && board.length !== 4 && board.length !== 5) {
      throw new Error(`a board holds 0, 3, 4 or 5 cards, not ${board.length}`)
    }

    inUse.fill(0)
    inUse[hole[0]] = 1
    inUse[hole[1]] = 1
    for (const card of board) inUse[card] = 1

    let unknownCount = 0
    for (let card = 0; card < DECK_SIZE; card++) {
      if (inUse[card] === 0) unknown[unknownCount++] = card ^ 3
    }

    const known = board.length
    for (let i = 0; i < known; i++) community[i] = (board[i] as number) ^ 3

    const communityNeeded = 5 - known
    const drawCount = communityNeeded + opponents * 2
    if (drawCount > unknownCount) throw new Error('not enough unseen cards for this simulation')

    const heroCode0 = hole[0] ^ 3
    const heroCode1 = hole[1] ^ 3
    const opponentCards = opponents * 2

    const started = performance.now()
    const deadline = started + timeBudgetMs
    let wins = 0
    let ties = 0
    let equitySum = 0
    let iterations = 0

    while (iterations < maxIterations) {
      if (
        iterations > 0 &&
        iterations % TIME_CHECK_INTERVAL === 0 &&
        performance.now() >= deadline
      ) {
        break
      }

      // Partial Fisher-Yates. The array is left permuted rather than restored,
      // which keeps every iteration uniform without any reset cost.
      for (let i = 0; i < drawCount; i++) {
        const j = i + rng.nextInt(unknownCount - i)
        const tmp = unknown[i] as number
        unknown[i] = unknown[j] as number
        unknown[j] = tmp
      }

      let cursor = 0
      for (let i = 0; i < communityNeeded; i++) community[known + i] = unknown[cursor++] as number
      for (let i = 0; i < opponentCards; i++) opponentHole[i] = unknown[cursor++] as number

      hand[0] = heroCode0
      hand[1] = heroCode1
      for (let i = 0; i < 5; i++) hand[2 + i] = community[i] as number
      const heroScore = evaluate(hand)

      let bestOpponent = Number.POSITIVE_INFINITY
      let tiedOpponents = 0
      for (let o = 0; o < opponents; o++) {
        hand[0] = opponentHole[o * 2] as number
        hand[1] = opponentHole[o * 2 + 1] as number
        const score = evaluate(hand)
        if (score < bestOpponent) {
          bestOpponent = score
          tiedOpponents = 1
        } else if (score === bestOpponent) {
          tiedOpponents += 1
        }
      }

      if (heroScore < bestOpponent) {
        wins += 1
        equitySum += 1
      } else if (heroScore === bestOpponent) {
        ties += 1
        equitySum += 1 / (tiedOpponents + 1)
      }
      iterations += 1
    }

    return {
      equity: iterations === 0 ? 0 : equitySum / iterations,
      wins,
      ties,
      iterations,
      elapsedMs: performance.now() - started,
    }
  }
}

const sharedEstimator = createEquityEstimator()

export function estimateEquity(request: EquityRequest): EquityResult {
  return sharedEstimator(request)
}
