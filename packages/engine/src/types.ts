import type { Card } from './cards.ts'
import type { Rng } from './rng.ts'

export const MAX_SEATS = 9

export type TableFormat = 'cash' | 'sng'

export type RebuyPolicy =
  | { kind: 'unlimited' }
  | { kind: 'limited'; maxRebuys: number }
  | { kind: 'none' }

export interface TableConfig {
  format: TableFormat
  maxSeats: number
  smallBlind: number
  bigBlind: number
  ante: number
  minBuyIn: number
  maxBuyIn: number
  actionClockMs: number
  rebuy: RebuyPolicy
}

export type OccupantKind = 'human' | 'bot'
export type Controller = 'human' | 'bot'
export type BotDifficulty = 'easy' | 'normal' | 'hard'

export interface Occupant {
  id: string
  name: string
  kind: OccupantKind
  difficulty?: BotDifficulty
  /** Personality seed so a given bot plays consistently across hands. */
  personalitySeed?: number
}

export type SeatStatus = 'empty' | 'waiting' | 'busted' | 'sitting-out'

export interface Seat {
  index: number
  occupant: Occupant | null
  /** May be `bot` while the occupant is human, after a disconnect takeover. */
  controller: Controller
  stack: number
  status: SeatStatus
  rebuysUsed: number
  connected: boolean
  /** Wall clock at which an absent human loses the seat entirely. */
  seatHeldUntil: number | null
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

export type HandPlayerStatus = 'active' | 'folded' | 'all-in'

export interface HandPlayer {
  seat: number
  holeCards: [Card, Card]
  status: HandPlayerStatus
  /** Chips committed during the current betting round. */
  committed: number
  /** Chips committed across the whole hand, which is what side pots are built from. */
  totalCommitted: number
  hasActedThisRound: boolean
  /**
   * Cleared when an all-in raise smaller than a full raise arrives after this
   * player has already acted, which does not reopen the betting for them.
   */
  mayRaise: boolean
}

export interface Pot {
  amount: number
  eligibleSeats: number[]
}

export type RevealChoice = 'pending' | 'shown' | 'mucked'

export interface RevealAward {
  seat: number
  amount: number
  potIndex: number
}

export interface RevealState {
  deadline: number | null
  settled: boolean
  choices: { seat: number; choice: RevealChoice }[]
  awards: RevealAward[]
}

export interface HandState {
  handNumber: number
  buttonSeat: number
  deck: Card[]
  board: Card[]
  street: Street
  players: HandPlayer[]
  actorSeat: number | null
  /** Seat the search for the next actor starts from, so turn order survives cloning. */
  actionAnchor: number
  smallBlindSeat: number
  bigBlindSeat: number
  /** Highest `committed` in the current round. */
  betToCall: number
  /** Size of the last full raise, which sets the minimum for the next one. */
  lastFullRaiseSize: number
  /** Chips already collected from finished betting rounds. */
  collected: number
  deadline: number | null
  complete: boolean
  /** Null while the hand is in progress; populated when the hand ends. */
  reveal: RevealState | null
}

export type TableStatus = 'waiting' | 'running' | 'dormant'

export interface TableState {
  config: TableConfig
  seats: Seat[]
  buttonSeat: number
  handNumber: number
  hand: HandState | null
  status: TableStatus
}

export type PlayerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  /** `to` is the player's total contribution for the current round, not the increment. */
  | { type: 'bet'; to: number }
  | { type: 'raise'; to: number }
  | { type: 'all-in' }

export type PlayerActionType = PlayerAction['type']

export interface LegalActions {
  seat: number
  canFold: boolean
  canCheck: boolean
  /** `null` when there is nothing to call. `amount` is the extra chips required. */
  call: { amount: number; allIn: boolean } | null
  /** `min` and `max` are round totals, matching the `to` field of bet and raise. */
  raise: { min: number; max: number; isOpeningBet: boolean } | null
}

export type Command =
  | { type: 'sit'; seat: number; occupant: Occupant; buyIn: number }
  | { type: 'leave'; seat: number }
  | { type: 'rebuy'; seat: number; amount: number }
  | { type: 'set-connected'; seat: number; connected: boolean }
  | { type: 'set-controller'; seat: number; controller: Controller }
  | { type: 'sit-out'; seat: number; sittingOut: boolean }
  | { type: 'start-hand' }
  | { type: 'act'; seat: number; action: PlayerAction }
  | { type: 'timeout'; seat: number }
  | { type: 'release-seat'; seat: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'show'; seat: number }
  | { type: 'muck'; seat: number }
  | { type: 'timeout-reveal' }

export interface HandResultEntry {
  seat: number
  amount: number
  potIndex: number
}

/** Engine-side hand result row; `name` is filled in by the view layer. */
export interface HandResultEntryView {
  seat: number
  name?: never
  delta: number
  awarded: number
  committed: number
}

export interface ShowdownReveal {
  seat: number
  cards: [Card, Card]
  score: number
  best: Card[]
}

export type GameEvent =
  | { type: 'seat-updated'; seat: Seat }
  | { type: 'table-status'; status: TableStatus }
  | { type: 'hand-started'; handNumber: number; buttonSeat: number; seats: number[] }
  | { type: 'blinds-posted'; posts: { seat: number; amount: number; kind: 'sb' | 'bb' | 'ante' }[] }
  /** Carries every seat's cards. Redacted per recipient before leaving the process. */
  | { type: 'hole-cards-dealt'; deals: { seat: number; cards: [Card, Card] }[] }
  | { type: 'action-requested'; seat: number; deadline: number | null; legal: LegalActions }
  | {
      type: 'player-acted'
      seat: number
      action: PlayerAction
      paid: number
      stackAfter: number
      committedAfter: number
      allIn: boolean
    }
  | { type: 'street-dealt'; street: Street; cards: Card[] }
  | { type: 'uncalled-returned'; seat: number; amount: number }
  | { type: 'pots-formed'; pots: Pot[] }
  | { type: 'showdown'; reveals: ShowdownReveal[] }
  | { type: 'pot-awarded'; seat: number; amount: number; potIndex: number }
  | { type: 'hand-ended'; stacks: { seat: number; stack: number }[] }
  | { type: 'reveal-started'; deadline: number | null; seats: number[] }
  | { type: 'player-shown'; seat: number }
  | { type: 'player-mucked'; seat: number }
  | { type: 'reveal-settled' }
  | { type: 'error'; message: string }

export type Evaluate7 = (cards: readonly Card[]) => number

export interface EngineContext {
  now: number
  rng: Rng
  /** Lower is better, on the Cactus Kev 1 to 7462 scale. */
  evaluate7: Evaluate7
}

export interface ReduceResult {
  state: TableState
  events: GameEvent[]
}
