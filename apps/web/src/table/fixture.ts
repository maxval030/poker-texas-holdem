import {
  type Command,
  createTable,
  type EngineContext,
  legalActionsFor,
  type Occupant,
  reduce,
  referenceEvaluate7,
  seededRng,
  type TableConfig,
  type TableState,
  viewFor,
} from '@holdem/engine'
import type { SelfInfo, TableUpdate } from '@holdem/protocol'

const CONFIG: TableConfig = {
  format: 'cash',
  maxSeats: 9,
  smallBlind: 25,
  bigBlind: 50,
  ante: 0,
  minBuyIn: 1_000,
  maxBuyIn: 10_000,
  actionClockMs: 25_000,
  rebuy: { kind: 'unlimited' },
}

const NAMES = [
  'You',
  'Ratchanon',
  'Mei Lin',
  'Karl',
  'Priya',
  'Diego',
  'Sofia',
  'Tomas',
  'Amara',
] as const

function occupant(index: number): Occupant {
  const bot = index !== 0
  return {
    id: `seat-${index}`,
    name: NAMES[index] as string,
    kind: bot ? 'bot' : 'human',
    ...(bot ? { difficulty: 'normal' as const, personalitySeed: index * 7919 } : {}),
  }
}

/**
 * A real hand played out by the real engine, used to develop and eyeball the
 * table without a server or a worker. Handmade state would drift from the rules
 * and quietly stop exercising the layout that actually ships.
 */
export function demoUpdate(now: number): { update: TableUpdate; self: SelfInfo } {
  const context: EngineContext = {
    now,
    rng: seededRng(20260810),
    evaluate7: referenceEvaluate7,
  }

  let state: TableState = createTable(CONFIG)
  const run = (command: Command) => {
    const result = reduce(state, command, { ...context, now })
    const failure = result.events.find((event) => event.type === 'error')
    if (failure) throw new Error(`demo hand rejected ${command.type}: ${failure.message}`)
    state = result.state
  }

  const stacks = [6_400, 9_800, 3_250, 8_100, 1_575, 9_300, 4_800, 7_050, 2_400]
  stacks.forEach((stack, index) => {
    if (index === 6) return // one empty chair, so the open seat renders too
    run({ type: 'sit', seat: index, occupant: occupant(index), buyIn: stack })
    run({ type: 'set-connected', seat: index, connected: true })
  })
  run({ type: 'set-connected', seat: 8, connected: false })
  run({ type: 'start-hand' })

  // Deal through to a flop with a bet standing and the turn back on the viewer,
  // which is the busiest state the layout has to hold.
  const viewerSeat = 0
  for (let step = 0; step < 60; step++) {
    const hand = state.hand
    if (!hand || hand.complete) break
    const actor = hand.actorSeat
    if (actor === null) break
    if (hand.board.length >= 3 && actor === viewerSeat && hand.betToCall > 0) break

    const options = legalActionsFor(state, actor)
    if (!options) break

    const opening = hand.board.length >= 3 ? options.raise : null
    if (opening?.isOpeningBet) {
      const to = Math.min(opening.max, opening.min * 3)
      run({ type: 'act', seat: actor, action: { type: 'bet', to } })
    } else if (actor % 3 === 2 && options.canFold && !options.canCheck) {
      run({ type: 'act', seat: actor, action: { type: 'fold' } })
    } else if (options.canCheck) {
      run({ type: 'act', seat: actor, action: { type: 'check' } })
    } else {
      run({ type: 'act', seat: actor, action: { type: 'call' } })
    }
  }

  const view = viewFor(state, viewerSeat)
  const legal = legalActionsFor(state, viewerSeat)

  return {
    update: { seq: 1, view, events: [], serverTime: now },
    self: { userId: 'demo', name: 'You', seat: viewerSeat, legal },
  }
}
