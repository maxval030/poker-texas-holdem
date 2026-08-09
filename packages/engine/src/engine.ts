import {
  contestingPlayers,
  findPlayer,
  isBettingRoundComplete,
  legalActionsFor,
  nextActorSeat,
  uncalledExcess,
} from './betting.ts'
import type { Card } from './cards.ts'
import { freshDeck } from './cards.ts'
import { buildPots, orderFromButton, scoreShowdown, settlePots } from './pots.ts'
import { shuffleInPlace } from './rng.ts'
import type {
  Command,
  EngineContext,
  GameEvent,
  HandPlayer,
  HandState,
  Occupant,
  PlayerAction,
  ReduceResult,
  Seat,
  ShowdownReveal,
  Street,
  TableConfig,
  TableState,
} from './types.ts'
import { MAX_SEATS } from './types.ts'

export const SEAT_HOLD_MS = 10 * 60 * 1000

class RuleError extends Error {}

function fail(message: string): never {
  throw new RuleError(message)
}

export function createTable(config: TableConfig): TableState {
  if (config.maxSeats < 2 || config.maxSeats > MAX_SEATS) {
    throw new Error(`maxSeats must be between 2 and ${MAX_SEATS}`)
  }
  const seats: Seat[] = []
  for (let index = 0; index < config.maxSeats; index++) {
    seats.push({
      index,
      occupant: null,
      controller: 'human',
      stack: 0,
      status: 'empty',
      rebuysUsed: 0,
      connected: false,
      seatHeldUntil: null,
    })
  }
  return { config, seats, buttonSeat: 0, handNumber: 0, hand: null, status: 'waiting' }
}

export function reduce(state: TableState, command: Command, ctx: EngineContext): ReduceResult {
  const draft = structuredClone(state)
  const events: GameEvent[] = []
  try {
    dispatch(draft, command, ctx, events)
  } catch (error) {
    if (error instanceof RuleError) {
      return { state, events: [{ type: 'error', message: error.message }] }
    }
    throw error
  }
  return { state: draft, events }
}

function seatAt(state: TableState, index: number): Seat {
  const seat = state.seats[index]
  if (!seat) fail(`no such seat: ${index}`)
  return seat
}

function dispatch(
  state: TableState,
  command: Command,
  ctx: EngineContext,
  events: GameEvent[],
): void {
  switch (command.type) {
    case 'sit':
      sitDown(state, command.seat, command.occupant, command.buyIn, events)
      return
    case 'leave':
      leave(state, command.seat, events)
      return
    case 'rebuy':
      rebuy(state, command.seat, command.amount, events)
      return
    case 'set-connected':
      setConnected(state, command.seat, command.connected, ctx, events)
      return
    case 'set-controller': {
      const seat = seatAt(state, command.seat)
      seat.controller = command.controller
      events.push({ type: 'seat-updated', seat: structuredClone(seat) })
      return
    }
    case 'sit-out': {
      const seat = seatAt(state, command.seat)
      if (!seat.occupant) fail('seat is empty')
      seat.status = command.sittingOut ? 'sitting-out' : seat.stack > 0 ? 'waiting' : 'busted'
      events.push({ type: 'seat-updated', seat: structuredClone(seat) })
      return
    }
    case 'release-seat':
      leave(state, command.seat, events)
      return
    case 'start-hand':
      startHand(state, ctx, events)
      return
    case 'act':
      act(state, command.seat, command.action, ctx, events)
      return
    case 'timeout':
      timeout(state, command.seat, ctx, events)
      return
    case 'pause':
      state.status = 'dormant'
      events.push({ type: 'table-status', status: state.status })
      return
    case 'resume':
      state.status = state.hand && !state.hand.complete ? 'running' : 'waiting'
      events.push({ type: 'table-status', status: state.status })
      return
  }
}

function sitDown(
  state: TableState,
  index: number,
  occupant: Occupant,
  buyIn: number,
  events: GameEvent[],
): void {
  const seat = seatAt(state, index)
  if (seat.occupant) fail('seat is taken')
  const { minBuyIn, maxBuyIn } = state.config
  if (!Number.isInteger(buyIn) || buyIn < minBuyIn || buyIn > maxBuyIn) {
    fail(`buy-in must be an integer between ${minBuyIn} and ${maxBuyIn}`)
  }
  seat.occupant = occupant
  seat.controller = occupant.kind
  seat.stack = buyIn
  seat.status = 'waiting'
  seat.rebuysUsed = 0
  seat.connected = true
  seat.seatHeldUntil = null
  events.push({ type: 'seat-updated', seat: structuredClone(seat) })
}

function leave(state: TableState, index: number, events: GameEvent[]): void {
  const seat = seatAt(state, index)
  const hand = state.hand
  if (hand && !hand.complete) {
    const player = findPlayer(hand, index)
    if (player && player.status === 'active') {
      player.status = 'folded'
      player.hasActedThisRound = true
    }
  }
  seat.occupant = null
  seat.controller = 'human'
  seat.stack = 0
  seat.status = 'empty'
  seat.rebuysUsed = 0
  seat.connected = false
  seat.seatHeldUntil = null
  events.push({ type: 'seat-updated', seat: structuredClone(seat) })
}

function rebuy(state: TableState, index: number, amount: number, events: GameEvent[]): void {
  const seat = seatAt(state, index)
  const policy = state.config.rebuy
  if (!seat.occupant) fail('seat is empty')
  if (policy.kind === 'none') fail('rebuys are disabled at this table')
  if (policy.kind === 'limited' && seat.rebuysUsed >= policy.maxRebuys) {
    fail('rebuy limit reached')
  }
  const target = seat.stack + amount
  if (!Number.isInteger(amount) || amount <= 0 || target > state.config.maxBuyIn) {
    fail(`rebuy would exceed the maximum stack of ${state.config.maxBuyIn}`)
  }
  seat.stack = target
  seat.rebuysUsed += 1
  if (seat.status === 'busted') seat.status = 'waiting'
  events.push({ type: 'seat-updated', seat: structuredClone(seat) })
}

function setConnected(
  state: TableState,
  index: number,
  connected: boolean,
  ctx: EngineContext,
  events: GameEvent[],
): void {
  const seat = seatAt(state, index)
  seat.connected = connected
  if (connected) {
    seat.seatHeldUntil = null
  } else if (seat.occupant?.kind === 'human') {
    seat.seatHeldUntil = ctx.now + SEAT_HOLD_MS
  }
  events.push({ type: 'seat-updated', seat: structuredClone(seat) })
}

function eligibleSeatsForHand(state: TableState): number[] {
  return state.seats
    .filter((seat) => seat.occupant !== null && seat.stack > 0 && seat.status === 'waiting')
    .map((seat) => seat.index)
}

function startHand(state: TableState, ctx: EngineContext, events: GameEvent[]): void {
  if (state.hand && !state.hand.complete) fail('a hand is already in progress')
  const eligible = eligibleSeatsForHand(state)
  if (eligible.length < 2) fail('need at least two funded players to start a hand')

  const buttonSeat =
    state.handNumber === 0
      ? (eligible[0] as number)
      : nextSeatFrom(state.buttonSeat, eligible, state.config.maxSeats)

  const deck = shuffleInPlace(freshDeck(), ctx.rng)
  const order = orderFromButton(buttonSeat, state.config.maxSeats).filter((s) =>
    eligible.includes(s),
  )

  const headsUp = eligible.length === 2
  const smallBlindSeat = headsUp ? buttonSeat : (order[0] as number)
  const bigBlindSeat = headsUp
    ? (order.find((s) => s !== buttonSeat) as number)
    : (order[1] as number)

  const players: HandPlayer[] = eligible
    .slice()
    .sort((a, b) => a - b)
    .map((seat) => ({
      seat,
      holeCards: [0, 0] as [Card, Card],
      status: 'active',
      committed: 0,
      totalCommitted: 0,
      hasActedThisRound: false,
      mayRaise: true,
    }))

  const hand: HandState = {
    handNumber: state.handNumber + 1,
    buttonSeat,
    deck,
    board: [],
    street: 'preflop',
    players,
    actorSeat: null,
    actionAnchor: bigBlindSeat,
    smallBlindSeat,
    bigBlindSeat,
    betToCall: 0,
    lastFullRaiseSize: state.config.bigBlind,
    collected: 0,
    deadline: null,
    complete: false,
  }

  state.hand = hand
  state.handNumber = hand.handNumber
  state.buttonSeat = buttonSeat
  state.status = 'running'

  events.push({
    type: 'hand-started',
    handNumber: hand.handNumber,
    buttonSeat,
    seats: players.map((p) => p.seat),
  })

  postAntesAndBlinds(state, events)
  dealHoleCards(state, order, events)
  progress(state, ctx, events)
}

function nextSeatFrom(from: number, candidates: number[], maxSeats: number): number {
  for (let offset = 1; offset <= maxSeats; offset++) {
    const seat = (from + offset) % maxSeats
    if (candidates.includes(seat)) return seat
  }
  return candidates[0] as number
}

function commitChips(state: TableState, player: HandPlayer, requested: number): number {
  const seat = seatAt(state, player.seat)
  const paid = Math.min(requested, seat.stack)
  seat.stack -= paid
  player.committed += paid
  player.totalCommitted += paid
  if (seat.stack === 0) player.status = 'all-in'
  return paid
}

function postAntesAndBlinds(state: TableState, events: GameEvent[]): void {
  const hand = state.hand as HandState
  const posts: { seat: number; amount: number; kind: 'sb' | 'bb' | 'ante' }[] = []

  if (state.config.ante > 0) {
    for (const player of hand.players) {
      const paid = commitChips(state, player, state.config.ante)
      if (paid > 0) posts.push({ seat: player.seat, amount: paid, kind: 'ante' })
    }
    // Antes belong to the pot rather than to the current betting round.
    for (const player of hand.players) {
      hand.collected += player.committed
      player.committed = 0
    }
  }

  const sb = findPlayer(hand, hand.smallBlindSeat)
  const bb = findPlayer(hand, hand.bigBlindSeat)
  if (sb) {
    const paid = commitChips(state, sb, state.config.smallBlind)
    if (paid > 0) posts.push({ seat: sb.seat, amount: paid, kind: 'sb' })
  }
  if (bb) {
    const paid = commitChips(state, bb, state.config.bigBlind)
    if (paid > 0) posts.push({ seat: bb.seat, amount: paid, kind: 'bb' })
  }

  hand.betToCall = Math.max(...hand.players.map((p) => p.committed), 0)
  events.push({ type: 'blinds-posted', posts })
}

function dealHoleCards(state: TableState, dealOrder: number[], events: GameEvent[]): void {
  const hand = state.hand as HandState
  for (let round = 0; round < 2; round++) {
    for (const seat of dealOrder) {
      const player = findPlayer(hand, seat)
      if (!player) continue
      player.holeCards[round as 0 | 1] = hand.deck.pop() as Card
    }
  }
  events.push({
    type: 'hole-cards-dealt',
    deals: hand.players.map((p) => ({ seat: p.seat, cards: [...p.holeCards] as [Card, Card] })),
  })
}

function act(
  state: TableState,
  seat: number,
  action: PlayerAction,
  ctx: EngineContext,
  events: GameEvent[],
): void {
  const hand = state.hand
  if (!hand || hand.complete) fail('no hand in progress')
  if (state.status === 'dormant') fail('table is paused')
  if (hand.actorSeat !== seat) fail(`it is not seat ${seat}'s turn`)
  applyAction(state, seat, action, events)
  progress(state, ctx, events)
}

function timeout(state: TableState, seat: number, ctx: EngineContext, events: GameEvent[]): void {
  const hand = state.hand
  if (!hand || hand.complete) fail('no hand in progress')
  if (hand.actorSeat !== seat) fail(`it is not seat ${seat}'s turn`)
  const legal = legalActionsFor(state, seat)
  if (!legal) fail('seat cannot act')
  applyAction(state, seat, legal.canCheck ? { type: 'check' } : { type: 'fold' }, events)
  progress(state, ctx, events)
}

function applyAction(
  state: TableState,
  seat: number,
  action: PlayerAction,
  events: GameEvent[],
): void {
  const hand = state.hand as HandState
  const player = findPlayer(hand, seat)
  const chair = seatAt(state, seat)
  const legal = legalActionsFor(state, seat)
  if (!player || !legal) fail('seat cannot act')

  let paid = 0
  let resolved: PlayerAction = action

  switch (action.type) {
    case 'fold': {
      player.status = 'folded'
      break
    }
    case 'check': {
      if (!legal.canCheck) fail('cannot check facing a bet')
      break
    }
    case 'call': {
      if (!legal.call) fail('nothing to call')
      paid = commitChips(state, player, legal.call.amount)
      break
    }
    case 'all-in': {
      const to = player.committed + chair.stack
      resolved = to > hand.betToCall ? { type: 'raise', to } : { type: 'call' }
      paid = commitChips(state, player, chair.stack)
      if (to > hand.betToCall) applyRaiseBookkeeping(hand, player, to)
      break
    }
    case 'bet':
    case 'raise': {
      if (!legal.raise) fail('raising is not available')
      const { to } = action
      if (!Number.isInteger(to)) fail('raise amount must be an integer')
      if (to > legal.raise.max) fail('raise exceeds stack')
      if (to < legal.raise.min) fail(`raise must be at least ${legal.raise.min}`)
      paid = commitChips(state, player, to - player.committed)
      applyRaiseBookkeeping(hand, player, to)
      break
    }
  }

  player.hasActedThisRound = true
  hand.actionAnchor = seat
  hand.actorSeat = null
  hand.deadline = null

  events.push({
    type: 'player-acted',
    seat,
    action: resolved,
    paid,
    stackAfter: chair.stack,
    committedAfter: player.committed,
    allIn: player.status === 'all-in',
  })
}

/**
 * A raise that is short of a full raise, which only happens when a player is
 * all-in, forces everyone to respond but does not give players who already acted
 * a fresh right to re-raise.
 */
function applyRaiseBookkeeping(hand: HandState, actor: HandPlayer, to: number): void {
  const raiseSize = to - hand.betToCall
  const isFullRaise = raiseSize >= hand.lastFullRaiseSize

  for (const other of hand.players) {
    if (other.seat === actor.seat || other.status !== 'active') continue
    if (isFullRaise) {
      other.mayRaise = true
    } else if (other.hasActedThisRound) {
      other.mayRaise = false
    }
    other.hasActedThisRound = false
  }

  if (isFullRaise) hand.lastFullRaiseSize = raiseSize
  hand.betToCall = to
}

function progress(state: TableState, ctx: EngineContext, events: GameEvent[]): void {
  const hand = state.hand
  if (!hand || hand.complete) return

  for (;;) {
    if (contestingPlayers(hand).length <= 1) {
      endHand(state, ctx, events)
      return
    }
    if (!isBettingRoundComplete(hand)) {
      requestAction(state, ctx, events)
      return
    }

    closeBettingRound(state, events)
    if (hand.street === 'river') {
      endHand(state, ctx, events)
      return
    }
    dealNextStreet(state, events)
  }
}

function requestAction(state: TableState, ctx: EngineContext, events: GameEvent[]): void {
  const hand = state.hand as HandState
  const seat = nextActorSeat(hand, hand.actionAnchor, state.config.maxSeats)
  if (seat === null) fail('betting round is complete but no actor was found')
  const legal = legalActionsFor(state, seat)
  if (!legal) fail(`seat ${seat} cannot act`)

  hand.actorSeat = seat
  hand.deadline = state.config.actionClockMs > 0 ? ctx.now + state.config.actionClockMs : null
  events.push({ type: 'action-requested', seat, deadline: hand.deadline, legal })
}

function closeBettingRound(state: TableState, events: GameEvent[]): void {
  const hand = state.hand as HandState

  const excess = uncalledExcess(hand)
  if (excess) {
    const player = findPlayer(hand, excess.seat)
    const chair = state.seats[excess.seat]
    if (player && chair) {
      player.committed -= excess.amount
      player.totalCommitted -= excess.amount
      chair.stack += excess.amount
      if (player.status === 'all-in' && chair.stack > 0) player.status = 'active'
      events.push({ type: 'uncalled-returned', seat: excess.seat, amount: excess.amount })
    }
  }

  for (const player of hand.players) {
    hand.collected += player.committed
    player.committed = 0
    player.hasActedThisRound = false
    player.mayRaise = true
  }
  hand.betToCall = 0
  hand.lastFullRaiseSize = state.config.bigBlind
  hand.actorSeat = null
  hand.deadline = null
}

const NEXT_STREET: Record<Street, Street> = {
  preflop: 'flop',
  flop: 'turn',
  turn: 'river',
  river: 'showdown',
  showdown: 'showdown',
}

function dealNextStreet(state: TableState, events: GameEvent[]): void {
  const hand = state.hand as HandState
  const street = NEXT_STREET[hand.street]
  const count = street === 'flop' ? 3 : 1
  const cards: Card[] = []
  for (let i = 0; i < count; i++) cards.push(hand.deck.pop() as Card)
  hand.board.push(...cards)
  hand.street = street
  hand.actionAnchor = hand.buttonSeat
  events.push({ type: 'street-dealt', street, cards })
}

function endHand(state: TableState, ctx: EngineContext, events: GameEvent[]): void {
  const hand = state.hand as HandState
  const pots = buildPots(hand.players)
  events.push({ type: 'pots-formed', pots })

  const contesting = contestingPlayers(hand)
  let awards: { potIndex: number; seat: number; amount: number }[]

  if (contesting.length <= 1) {
    const winner = contesting[0]
    awards = winner
      ? pots.map((pot, potIndex) => ({ potIndex, seat: winner.seat, amount: pot.amount }))
      : []
  } else {
    const scores = scoreShowdown(hand.players, hand.board, ctx.evaluate7)
    const reveals: ShowdownReveal[] = contesting.map((player) => ({
      seat: player.seat,
      cards: [...player.holeCards] as [Card, Card],
      score: scores.find((s) => s.seat === player.seat)?.score ?? Number.POSITIVE_INFINITY,
      best: [player.holeCards[0], player.holeCards[1], ...hand.board],
    }))
    events.push({ type: 'showdown', reveals })
    awards = settlePots(pots, scores, hand.buttonSeat, state.config.maxSeats)
  }

  for (const award of awards) {
    const chair = state.seats[award.seat]
    if (!chair) continue
    chair.stack += award.amount
    events.push({
      type: 'pot-awarded',
      seat: award.seat,
      amount: award.amount,
      potIndex: award.potIndex,
    })
  }

  hand.complete = true
  hand.actorSeat = null
  hand.deadline = null

  for (const seat of state.seats) {
    if (!seat.occupant) continue
    if (seat.stack === 0 && seat.status === 'waiting') seat.status = 'busted'
  }

  state.status = 'waiting'
  events.push({
    type: 'hand-ended',
    stacks: state.seats.filter((s) => s.occupant).map((s) => ({ seat: s.index, stack: s.stack })),
  })
}

export function chipsOnTable(state: TableState): number {
  let total = 0
  for (const seat of state.seats) total += seat.stack
  if (state.hand && !state.hand.complete) {
    for (const player of state.hand.players) total += player.totalCommitted
  }
  return total
}
