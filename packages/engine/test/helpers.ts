import { parseCards } from '../src/cards.ts'
import { createTable, reduce } from '../src/engine.ts'
import { referenceEvaluate7 } from '../src/reference.ts'
import type { Rng } from '../src/rng.ts'
import type {
  Command,
  EngineContext,
  GameEvent,
  Occupant,
  TableConfig,
  TableState,
} from '../src/types.ts'

/** Leaves `shuffleInPlace` a no-op so tests can reason about a known deck order. */
export const identityRng: Rng = { nextInt: (maxExclusive) => Math.max(0, maxExclusive - 1) }

export function testConfig(overrides: Partial<TableConfig> = {}): TableConfig {
  return {
    format: 'cash',
    maxSeats: 9,
    smallBlind: 1,
    bigBlind: 2,
    ante: 0,
    minBuyIn: 1,
    maxBuyIn: 1_000_000,
    actionClockMs: 20_000,
    rebuy: { kind: 'unlimited' },
    ...overrides,
  }
}

export function testContext(overrides: Partial<EngineContext> = {}): EngineContext {
  return { now: 1_000, rng: identityRng, evaluate7: referenceEvaluate7, ...overrides }
}

function human(index: number): Occupant {
  return { id: `p${index}`, name: `Player ${index}`, kind: 'human' }
}

/** Seats one player per entry of `stacks`, skipping `null` for an empty chair. */
export function seatPlayers(stacks: (number | null)[], config = testConfig()): TableState {
  let state = createTable({ ...config, maxSeats: stacks.length })
  stacks.forEach((stack, index) => {
    if (stack === null) return
    state = apply(state, { type: 'sit', seat: index, occupant: human(index), buyIn: stack })
  })
  return state
}

export function apply(
  state: TableState,
  command: Command,
  ctx: EngineContext = testContext(),
): TableState {
  const result = reduce(state, command, ctx)
  const error = result.events.find((event) => event.type === 'error')
  if (error) throw new Error(`command ${command.type} rejected: ${error.message}`)
  return result.state
}

export function applyWithEvents(
  state: TableState,
  command: Command,
  ctx: EngineContext = testContext(),
): { state: TableState; events: GameEvent[] } {
  return reduce(state, command, ctx)
}

/**
 * Replaces the shuffled deck with a scripted one so a scenario can name the exact
 * hole cards and board it needs. Mutates in place, which only tests may do.
 */
export function rigHand(state: TableState, holeCards: Record<number, string>, board: string): void {
  const hand = state.hand
  if (!hand) throw new Error('no hand in progress')
  for (const player of hand.players) {
    const text = holeCards[player.seat]
    if (!text) throw new Error(`no hole cards scripted for seat ${player.seat}`)
    const cards = parseCards(text)
    if (cards.length !== 2) throw new Error(`seat ${player.seat} needs exactly 2 cards`)
    player.holeCards = [cards[0] as number, cards[1] as number]
  }
  const boardCards = parseCards(board)
  if (boardCards.length !== 5) throw new Error('board must contain exactly 5 cards')
  hand.deck = boardCards.reverse()
}

export function stackTotal(state: TableState): number {
  return state.seats.reduce((sum, seat) => sum + seat.stack, 0)
}
