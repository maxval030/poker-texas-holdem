import {
  cryptoRng,
  type GameEvent,
  legalActionsFor,
  redactEvent,
  referenceEvaluate7,
  type TableConfig,
  type TableState,
  viewFor,
} from '@holdem/engine'
import { createEquityEstimator } from '@holdem/evaluator'
import { TableHost } from '@holdem/host'
import {
  type ClientMessage,
  PROTOCOL_VERSION,
  type SelfInfo,
  type ServerMessage,
} from '@holdem/protocol'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { room } from '../db/schema.ts'
import {
  type BusMessage,
  deleteRoomKeys,
  getInstanceId,
  getOwner,
  loadSnapshot,
  publish,
  refreshOwnership,
  releaseOwnership,
  saveSnapshot,
  subscribeRoom,
  tryAcquireOwnership,
} from './bus.ts'

export interface SocketSink {
  send(message: ServerMessage): void
  close(code?: number, reason?: string): void
}

interface MemberConnection {
  userId: string
  name: string
  sockets: Set<SocketSink>
}

interface LiveRoom {
  id: string
  config: TableConfig
  host: TableHost | null
  owning: boolean
  members: Map<string, MemberConnection>
  /** Latest state observed, used by non-owners to answer resync/welcome. */
  mirror: { state: TableState; seq: number } | null
  unsubscribe: (() => Promise<void>) | null
  heartbeat: ReturnType<typeof setInterval> | null
}

/**
 * Per-process room directory. At most one instance owns the TableHost for a
 * room; everyone else forwards commands over Valkey and fans events from it.
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, LiveRoom>()
  private readonly estimator = createEquityEstimator()
  private readonly instanceId: string

  constructor(instanceId = getInstanceId()) {
    this.instanceId = instanceId
  }

  async attach(params: {
    roomId: string
    userId: string
    name: string
    config: TableConfig
    socket: SocketSink
  }): Promise<LiveRoom> {
    let live = this.rooms.get(params.roomId)
    if (!live) {
      live = await this.openRoom(params.roomId, params.config)
      this.rooms.set(params.roomId, live)
    }

    let member = live.members.get(params.userId)
    if (!member) {
      member = { userId: params.userId, name: params.name, sockets: new Set() }
      live.members.set(params.userId, member)
    } else {
      member.name = params.name
    }
    member.sockets.add(params.socket)

    if (live.owning && live.host) {
      live.host.join({ userId: params.userId, name: params.name })
    } else {
      this.welcomeFromMirror(live, params.userId, params.name)
    }

    await markRoomActive(params.roomId)
    return live
  }

  receive(roomId: string, userId: string, message: ClientMessage): void {
    const live = this.rooms.get(roomId)
    if (!live) return
    const member = live.members.get(userId)
    if (!member) return

    void this.handleReceive(live, member, message)
  }

  private async handleReceive(
    live: LiveRoom,
    member: MemberConnection,
    message: ClientMessage,
  ): Promise<void> {
    if (!live.owning || !live.host) {
      await this.maybeTakeover(live)
    }

    if (live.owning && live.host) {
      live.host.ensureMember({ userId: member.userId, name: member.name })
      live.host.receive(member.userId, message)
      return
    }

    // Local-only helpers that a non-owner can answer without the engine.
    if (message.type === 'ping') {
      this.sendToUser(live, member.userId, {
        type: 'pong',
        at: message.at,
        serverTime: Date.now(),
      })
      return
    }
    if (message.type === 'resync') {
      this.welcomeFromMirror(live, member.userId, member.name, true)
      return
    }

    await publish(live.id, {
      kind: 'command',
      originId: this.instanceId,
      roomId: live.id,
      userId: member.userId,
      name: member.name,
      message,
    })
  }

  detach(roomId: string, userId: string, socket: SocketSink): void {
    const live = this.rooms.get(roomId)
    if (!live) return
    const member = live.members.get(userId)
    if (!member) return

    member.sockets.delete(socket)
    if (member.sockets.size > 0) return

    live.members.delete(userId)
    if (live.owning && live.host) live.host.disconnect(userId)

    if (live.members.size === 0) {
      void markRoomDormant(roomId)
      if (!live.owning) void this.closeLocal(roomId)
    }
  }

  get(roomId: string): LiveRoom | undefined {
    return this.rooms.get(roomId)
  }

  async dispose(roomId: string): Promise<void> {
    const live = this.rooms.get(roomId)
    if (!live) return
    for (const member of live.members.values()) {
      for (const socket of member.sockets) socket.close(1001, 'room closed')
    }
    await this.closeLocal(roomId)
    await deleteRoomKeys(roomId)
  }

  /**
   * Simulates a hard crash of the owning process: the instance vanishes, the
   * lock is dropped, and this registry will not try to take the room back.
   */
  async crashOwner(roomId: string): Promise<void> {
    const live = this.rooms.get(roomId)
    if (!live) return
    if (live.heartbeat) clearInterval(live.heartbeat)
    if (live.unsubscribe) await live.unsubscribe()
    live.host?.dispose()
    if (live.owning) await releaseOwnership(roomId, this.instanceId)
    this.rooms.delete(roomId)
  }

  private async openRoom(roomId: string, config: TableConfig): Promise<LiveRoom> {
    const live: LiveRoom = {
      id: roomId,
      config,
      host: null,
      owning: false,
      members: new Map(),
      mirror: await loadSnapshot(roomId),
      unsubscribe: null,
      heartbeat: null,
    }

    live.unsubscribe = await subscribeRoom(roomId, (message) => {
      void this.onBusMessage(live, message)
    })

    const acquired = await tryAcquireOwnership(roomId, this.instanceId)
    if (acquired) {
      await this.becomeOwner(live)
    } else {
      // Another instance holds the lock. If it dies, the TTL expires and the
      // next command or attach attempt on any instance can steal it.
      live.heartbeat = setInterval(() => {
        void this.maybeTakeover(live)
      }, 5_000)
    }

    return live
  }

  private async becomeOwner(live: LiveRoom): Promise<void> {
    live.owning = true
    live.host = this.spawnHost(live)
    if (live.mirror) live.host.hydrate(live.mirror.state, live.mirror.seq)

    if (live.heartbeat) clearInterval(live.heartbeat)
    live.heartbeat = setInterval(() => {
      void refreshOwnership(live.id, this.instanceId).then((ok) => {
        if (!ok) void this.loseOwnership(live)
      })
    }, 5_000)
  }

  private async loseOwnership(live: LiveRoom): Promise<void> {
    live.owning = false
    live.host?.dispose()
    live.host = null
    if (live.heartbeat) clearInterval(live.heartbeat)
    live.heartbeat = setInterval(() => {
      void this.maybeTakeover(live)
    }, 5_000)
  }

  private async maybeTakeover(live: LiveRoom): Promise<void> {
    if (live.owning) return
    const owner = await getOwner(live.id)
    if (owner) return
    const acquired = await tryAcquireOwnership(live.id, this.instanceId)
    if (!acquired) return
    live.mirror = (await loadSnapshot(live.id)) ?? live.mirror
    await this.becomeOwner(live)
  }

  private spawnHost(live: LiveRoom): TableHost {
    return new TableHost({
      roomId: live.id,
      config: live.config,
      rng: cryptoRng(),
      evaluate7: referenceEvaluate7,
      estimator: this.estimator,
      handIntervalMs: 3_500,
      deliver: (userId, message) => {
        if (userId === null) {
          for (const id of live.members.keys()) this.sendToUser(live, id, message)
          return
        }
        this.sendToUser(live, userId, message)
      },
      onCommit: (state, seq, events) => {
        live.mirror = { state, seq }
        void saveSnapshot(live.id, state, seq)
        void publish(live.id, {
          kind: 'event',
          originId: this.instanceId,
          roomId: live.id,
          seq,
          state,
          events,
          serverTime: Date.now(),
        })
      },
    })
  }

  private async onBusMessage(live: LiveRoom, message: BusMessage): Promise<void> {
    if (message.kind === 'command') {
      if (!live.owning || !live.host) {
        // Owner might have died; try to take over before dropping the command.
        await this.maybeTakeover(live)
      }
      if (!live.owning || !live.host) return
      if (message.originId === this.instanceId) return
      live.host.ensureMember({ userId: message.userId, name: message.name })
      live.host.receive(message.userId, message.message)
      return
    }

    // Events from ourselves were already delivered through the local host.
    if (message.originId === this.instanceId) return

    live.mirror = { state: message.state, seq: message.seq }
    for (const member of live.members.values()) {
      this.sendUpdateFromState(
        live,
        member.userId,
        message.state,
        message.seq,
        message.serverTime,
        message.events ?? [],
      )
    }
  }

  private welcomeFromMirror(
    live: LiveRoom,
    userId: string,
    name: string,
    updateOnly = false,
  ): void {
    const state = live.mirror?.state ?? createEmptyState(live.config)
    const seq = live.mirror?.seq ?? 0
    if (!updateOnly) {
      this.sendToUser(live, userId, {
        type: 'welcome',
        protocol: PROTOCOL_VERSION,
        roomId: live.id,
        config: state.config,
        self: selfFor(state, userId, name),
      })
    }
    this.sendUpdateFromState(live, userId, state, seq, Date.now(), [])
  }

  private sendUpdateFromState(
    live: LiveRoom,
    userId: string,
    state: TableState,
    seq: number,
    serverTime: number,
    events: GameEvent[],
  ): void {
    const seat = seatOf(state, userId)
    const visible: GameEvent[] = []
    for (const event of events) {
      const redacted = redactEvent(event, seat)
      if (redacted) visible.push(redacted)
    }
    this.sendToUser(live, userId, {
      type: 'update',
      update: {
        seq,
        view: viewFor(state, seat),
        events: visible,
        serverTime,
      },
      self: selfFor(state, userId, live.members.get(userId)?.name ?? 'Player'),
    })
  }

  private sendToUser(live: LiveRoom, userId: string, message: ServerMessage): void {
    const member = live.members.get(userId)
    if (!member) return
    for (const socket of member.sockets) socket.send(message)
  }

  private async closeLocal(roomId: string): Promise<void> {
    const live = this.rooms.get(roomId)
    if (!live) return
    if (live.heartbeat) clearInterval(live.heartbeat)
    if (live.unsubscribe) await live.unsubscribe()
    if (live.owning) {
      live.host?.dispose()
      await releaseOwnership(roomId, this.instanceId)
    }
    this.rooms.delete(roomId)
  }
}

export const roomRegistry = new RoomRegistry()

function seatOf(state: TableState, userId: string): number | null {
  for (const chair of state.seats) {
    if (chair.occupant?.id === userId) return chair.index
  }
  return null
}

function selfFor(state: TableState, userId: string, name: string): SelfInfo {
  const seat = seatOf(state, userId)
  const isActor = seat !== null && state.hand?.actorSeat === seat
  return {
    userId,
    name,
    seat,
    legal: isActor && seat !== null ? legalActionsFor(state, seat) : null,
  }
}

function createEmptyState(config: TableConfig): TableState {
  return {
    config,
    seats: Array.from({ length: config.maxSeats }, (_, index) => ({
      index,
      occupant: null,
      controller: 'human' as const,
      stack: 0,
      status: 'empty' as const,
      rebuysUsed: 0,
      connected: false,
      seatHeldUntil: null,
    })),
    buttonSeat: 0,
    handNumber: 0,
    hand: null,
    status: 'waiting',
  }
}

async function markRoomActive(roomId: string): Promise<void> {
  await db
    .update(room)
    .set({
      status: 'active',
      lastHumanAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(room.id, roomId))
}

async function markRoomDormant(roomId: string): Promise<void> {
  await db
    .update(room)
    .set({
      status: 'dormant',
      lastHumanAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(room.id, roomId), ne(room.status, 'closed')))
}
