import { decideForSeat, makeBotOccupant } from '@holdem/bot'
import {
  type Command,
  createTable,
  type EngineContext,
  type Evaluate7,
  type GameEvent,
  legalActionsFor,
  type Occupant,
  type Rng,
  redactEvent,
  reduce,
  type TableConfig,
  type TableState,
  viewFor,
} from '@holdem/engine'
import type { EquityEstimator } from '@holdem/evaluator'
import {
  type ClientMessage,
  PROTOCOL_VERSION,
  type SelfInfo,
  type ServerMessage,
} from '@holdem/protocol'
import { type HostClock, systemClock } from './clock.ts'

export const DISCONNECT_GRACE_MS = 30_000

export interface HostMember {
  userId: string
  name: string
}

export interface TableHostOptions {
  roomId: string
  config: TableConfig
  rng: Rng
  evaluate7: Evaluate7
  estimator: EquityEstimator
  clock?: HostClock
  /**
   * Gap between one hand ending and the next beginning, which is the time the
   * table spends showing who won. Setting it to `null` requires an explicit
   * `start` from a player for every hand.
   */
  handIntervalMs?: number | null
  /** Scales the bot's human-like pause. Tests set it to 0. */
  botDelayScale?: number
  /**
   * Delivers a message to one member, or to everyone when `userId` is null.
   * Keeping this a callback is what lets the same host sit behind a Web Worker
   * in single player and behind a WebSocket online.
   */
  deliver(userId: string | null, message: ServerMessage): void
  /**
   * Fired after the authoritative state advances. Multi-instance ownership uses
   * this to snapshot into Valkey and fan the update out over pub/sub.
   */
  onCommit?(state: TableState, seq: number, events: GameEvent[]): void
}

/**
 * Owns one table: the state, the members watching it, and every timer that
 * moves the game forward on its own. The engine underneath stays pure, so
 * everything here is about deciding *when* to call it and *who* may.
 */
export class TableHost {
  private readonly options: TableHostOptions
  private readonly clock: HostClock
  private readonly members = new Map<string, HostMember>()
  private state: TableState
  private seq = 0
  private cancelPending: (() => void) | null = null
  private readonly graceCancels = new Map<number, () => void>()
  private readonly releaseCancels = new Map<number, () => void>()
  /** Humans who reconnected while a bot still held their seat mid-hand. */
  private readonly pendingReclaims = new Set<number>()
  private disposed = false

  constructor(options: TableHostOptions) {
    this.options = options
    this.clock = options.clock ?? systemClock
    this.state = createTable(options.config)
  }

  get tableState(): TableState {
    return this.state
  }

  get sequence(): number {
    return this.seq
  }

  /** Rebuild after taking ownership from a snapshot written by the previous owner. */
  hydrate(state: TableState, seq: number): void {
    this.state = state
    this.seq = seq
  }

  /** Ensures a forwarded command has a member record even when the socket is remote. */
  ensureMember(member: HostMember): void {
    this.members.set(member.userId, member)
  }

  join(member: HostMember): void {
    this.members.set(member.userId, member)
    const seat = this.seatOf(member.userId)
    if (seat !== null) {
      this.cancelGrace(seat)
      this.cancelRelease(seat)
      this.dispatch(member.userId, { type: 'set-connected', seat, connected: true })
      const chair = this.state.seats[seat]
      // Never yank control mid-hand; the bot finishes the street and the human
      // sits back down when the pots are awarded.
      if (chair?.controller === 'bot') {
        if (this.state.hand && !this.state.hand.complete) this.pendingReclaims.add(seat)
        else this.dispatch(null, { type: 'set-controller', seat, controller: 'human' })
      }
    }

    if (this.state.status === 'dormant') {
      this.dispatch(null, { type: 'resume' })
      this.settle()
    }

    this.options.deliver(member.userId, {
      type: 'welcome',
      protocol: PROTOCOL_VERSION,
      roomId: this.options.roomId,
      config: this.state.config,
      self: this.selfFor(member.userId),
    })
    this.sendUpdate(member.userId, [])
  }

  /** The member is gone but their seat is held, which is what a refresh looks like. */
  disconnect(userId: string): void {
    const seat = this.seatOf(userId)
    this.members.delete(userId)
    if (seat !== null) {
      this.muckIfPendingReveal(seat)
      this.dispatch(userId, { type: 'set-connected', seat, connected: false })
      this.scheduleGrace(seat)
      const chair = this.state.seats[seat]
      if (chair?.seatHeldUntil !== null && chair?.seatHeldUntil !== undefined) {
        this.scheduleRelease(seat, chair.seatHeldUntil)
      }
    }

    if (!this.hasConnectedHuman()) {
      // Freeze the hand rather than letting bots play to an empty room.
      if (this.state.status !== 'dormant') this.dispatch(null, { type: 'pause' })
      this.cancelPending?.()
      this.cancelPending = null
    }
  }

  receive(userId: string, message: ClientMessage): void {
    if (this.disposed) return
    const member = this.members.get(userId)
    if (!member) return

    switch (message.type) {
      case 'ping':
        this.options.deliver(userId, {
          type: 'pong',
          at: message.at,
          serverTime: this.clock.now(),
        })
        return

      case 'resync':
        this.sendUpdate(userId, [])
        return

      case 'emote': {
        const seat = this.seatOf(userId)
        if (seat === null) return
        this.options.deliver(null, { type: 'emote', seat, emote: message.emote })
        return
      }

      case 'sit': {
        if (this.seatOf(userId) !== null) {
          this.reject(userId, 'you are already seated')
          return
        }
        const occupant: Occupant = { id: userId, name: member.name, kind: 'human' }
        this.dispatch(userId, {
          type: 'sit',
          seat: message.seat,
          occupant,
          buyIn: message.buyIn,
        })
        return
      }

      case 'leave': {
        const seat = this.requireSeat(userId)
        if (seat === null) return
        this.muckIfPendingReveal(seat)
        this.dispatch(userId, { type: 'leave', seat })
        return
      }

      case 'show': {
        const seat = this.requireSeat(userId)
        if (seat === null) return
        this.dispatch(userId, { type: 'show', seat })
        return
      }

      case 'muck': {
        const seat = this.requireSeat(userId)
        if (seat === null) return
        this.dispatch(userId, { type: 'muck', seat })
        return
      }

      case 'rebuy': {
        const seat = this.requireSeat(userId)
        if (seat === null) return
        this.dispatch(userId, { type: 'rebuy', seat, amount: message.amount })
        return
      }

      case 'sit-out': {
        const seat = this.requireSeat(userId)
        if (seat === null) return
        this.dispatch(userId, { type: 'sit-out', seat, sittingOut: message.sittingOut })
        return
      }

      case 'act': {
        const seat = this.requireSeat(userId)
        if (seat === null) return
        this.dispatch(userId, { type: 'act', seat, action: message.action })
        return
      }

      case 'add-bot': {
        const occupant = makeBotOccupant(
          message.seat,
          message.difficulty,
          this.options.rng.nextInt(0x7fffffff),
        )
        this.dispatch(userId, {
          type: 'sit',
          seat: message.seat,
          occupant,
          buyIn: this.state.config.maxBuyIn,
        })
        return
      }

      case 'remove-bot': {
        const chair = this.state.seats[message.seat]
        if (chair?.occupant?.kind !== 'bot') {
          this.reject(userId, 'that seat is not a bot')
          return
        }
        this.dispatch(userId, { type: 'leave', seat: message.seat })
        return
      }

      case 'start':
        this.dispatch(userId, { type: 'start-hand' })
        return
    }
  }

  dispose(): void {
    this.disposed = true
    this.cancelPending?.()
    this.cancelPending = null
    for (const cancel of this.graceCancels.values()) cancel()
    this.graceCancels.clear()
    for (const cancel of this.releaseCancels.values()) cancel()
    this.releaseCancels.clear()
    this.pendingReclaims.clear()
    this.members.clear()
  }

  private hasConnectedHuman(): boolean {
    for (const chair of this.state.seats) {
      if (chair.occupant?.kind === 'human' && chair.connected) return true
    }
    return false
  }

  private scheduleGrace(seat: number): void {
    this.cancelGrace(seat)
    this.graceCancels.set(
      seat,
      this.clock.schedule(() => {
        this.graceCancels.delete(seat)
        if (this.disposed) return
        const chair = this.state.seats[seat]
        if (!chair?.occupant || chair.connected || chair.occupant.kind !== 'human') return
        this.dispatch(null, { type: 'set-controller', seat, controller: 'bot' })
        this.settle()
      }, DISCONNECT_GRACE_MS),
    )
  }

  private cancelGrace(seat: number): void {
    this.graceCancels.get(seat)?.()
    this.graceCancels.delete(seat)
  }

  private scheduleRelease(seat: number, until: number): void {
    this.cancelRelease(seat)
    this.releaseCancels.set(
      seat,
      this.clock.schedule(
        () => {
          this.releaseCancels.delete(seat)
          if (this.disposed) return
          const chair = this.state.seats[seat]
          if (!chair?.occupant || chair.connected) return
          if (chair.seatHeldUntil !== null && this.clock.now() < chair.seatHeldUntil) {
            this.scheduleRelease(seat, chair.seatHeldUntil)
            return
          }
          this.dispatch(null, { type: 'release-seat', seat })
        },
        Math.max(0, until - this.clock.now()),
      ),
    )
  }

  private cancelRelease(seat: number): void {
    this.releaseCancels.get(seat)?.()
    this.releaseCancels.delete(seat)
  }

  private reclaimSeats(): void {
    for (const seat of [...this.pendingReclaims]) {
      const chair = this.state.seats[seat]
      if (chair.occupant?.kind !== 'human') {
        this.pendingReclaims.delete(seat)
        continue
      }
      if (!chair.connected) continue
      this.pendingReclaims.delete(seat)
      if (chair.controller !== 'human') {
        this.dispatch(null, { type: 'set-controller', seat, controller: 'human' })
      }
    }
  }

  private requireSeat(userId: string): number | null {
    const seat = this.seatOf(userId)
    if (seat === null) this.reject(userId, 'you are not seated')
    return seat
  }

  private seatOf(userId: string): number | null {
    for (const chair of this.state.seats) {
      if (chair.occupant?.id === userId) return chair.index
    }
    return null
  }

  private context(): EngineContext {
    return {
      now: this.clock.now(),
      rng: this.options.rng,
      evaluate7: this.options.evaluate7,
    }
  }

  /**
   * The one path into the engine. A rejected command leaves the state untouched
   * and tells only the member who sent it, so a mistyped raise never disturbs
   * anyone else's table.
   */
  private dispatch(origin: string | null, command: Command): boolean {
    if (this.disposed) return false
    const result = reduce(this.state, command, this.context())
    const failure = result.events.find((event) => event.type === 'error')
    if (failure) {
      if (origin) this.reject(origin, failure.message)
      return false
    }

    this.state = result.state
    this.broadcast(result.events)
    this.settle()
    return true
  }

  private reject(userId: string, reason: string): void {
    this.options.deliver(userId, { type: 'rejected', reason })
  }

  private broadcast(events: GameEvent[]): void {
    this.seq += 1
    for (const userId of this.members.keys()) this.sendUpdate(userId, events)
    this.options.onCommit?.(this.state, this.seq, events)
  }

  private sendUpdate(userId: string, events: GameEvent[]): void {
    const seat = this.seatOf(userId)
    const visible: GameEvent[] = []
    for (const event of events) {
      const redacted = redactEvent(event, seat)
      if (redacted) visible.push(redacted)
    }

    this.options.deliver(userId, {
      type: 'update',
      update: {
        seq: this.seq,
        view: viewFor(this.state, seat),
        events: visible,
        serverTime: this.clock.now(),
      },
      self: this.selfFor(userId),
    })
  }

  private selfFor(userId: string): SelfInfo {
    const member = this.members.get(userId)
    const seat = this.seatOf(userId)
    const isActor = seat !== null && this.state.hand?.actorSeat === seat
    return {
      userId,
      name: member?.name ?? 'Player',
      seat,
      legal: isActor ? legalActionsFor(this.state, seat) : null,
    }
  }

  /**
   * Decides what the table does next on its own: let a bot think, run down a
   * human's clock, or deal the following hand.
   */
  private settle(): void {
    this.cancelPending?.()
    this.cancelPending = null
    if (this.disposed || this.state.status === 'dormant') return

    const hand = this.state.hand
    if (!hand || hand.complete) {
      this.reclaimSeats()
      if (hand?.reveal && !hand.reveal.settled) {
        if (hand.reveal.deadline !== null) {
          const handNumber = hand.handNumber
          this.cancelPending = this.clock.schedule(() => {
            this.cancelPending = null
            const current = this.state.hand
            if (current?.handNumber !== handNumber) return
            if (!current.reveal || current.reveal.settled) return
            this.dispatch(null, { type: 'timeout-reveal' })
          }, hand.reveal.deadline - this.clock.now())
        }
        return
      }
      this.scheduleNextHand()
      return
    }

    const actor = hand.actorSeat
    if (actor === null) return

    const chair = this.state.seats[actor]
    if (chair?.controller === 'bot') {
      this.scheduleBot(actor)
      return
    }

    if (hand.deadline !== null) {
      const handNumber = hand.handNumber
      this.cancelPending = this.clock.schedule(() => {
        this.cancelPending = null
        const current = this.state.hand
        if (current?.handNumber !== handNumber || current.actorSeat !== actor) return
        this.dispatch(null, { type: 'timeout', seat: actor })
      }, hand.deadline - this.clock.now())
    }
  }

  private scheduleBot(seat: number): void {
    const hand = this.state.hand
    if (!hand) return

    // Decided now but submitted later, so the pause the player sees is the bot
    // pretending to think rather than the machine actually thinking.
    const decision = decideForSeat(this.state, seat, this.options.estimator, this.options.rng)
    if (!decision) return

    const handNumber = hand.handNumber
    const scale = this.options.botDelayScale ?? 1
    this.cancelPending = this.clock.schedule(() => {
      this.cancelPending = null
      const current = this.state.hand
      if (current?.handNumber !== handNumber || current.actorSeat !== seat) return
      this.dispatch(null, { type: 'act', seat, action: decision.action })
    }, decision.delayMs * scale)
  }

  private scheduleNextHand(): void {
    if (this.state.hand?.reveal && !this.state.hand.reveal.settled) return
    const interval = this.options.handIntervalMs
    if (interval === null || interval === undefined) return
    if (this.eligibleCount() < 2) return

    const handNumber = this.state.handNumber
    this.cancelPending = this.clock.schedule(() => {
      this.cancelPending = null
      if (this.state.handNumber !== handNumber) return
      if (this.state.hand && !this.state.hand.complete) return
      if (this.state.hand?.reveal && !this.state.hand.reveal.settled) return
      if (this.eligibleCount() < 2) return
      this.dispatch(null, { type: 'start-hand' })
    }, interval)
  }

  private muckIfPendingReveal(seat: number): void {
    const reveal = this.state.hand?.reveal
    if (!reveal || reveal.settled) return
    const entry = reveal.choices.find((choice) => choice.seat === seat)
    if (entry?.choice !== 'pending') return
    this.dispatch(null, { type: 'muck', seat })
  }

  private eligibleCount(): number {
    let count = 0
    for (const chair of this.state.seats) {
      if (chair.occupant && chair.stack > 0 && chair.status === 'waiting') count += 1
    }
    return count
  }
}
