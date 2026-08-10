import type {
  BotDifficulty,
  GameEvent,
  LegalActions,
  PlayerAction,
  TableConfig,
  TableStateView,
} from '@holdem/engine'

/** Bumped whenever the message shapes change, so a stale tab is told to reload. */
export const PROTOCOL_VERSION = 2

export const EMOTES = ['nice-hand', 'thanks', 'wow', 'thinking', 'chips', 'oops'] as const
export type Emote = (typeof EMOTES)[number]

export type ClientMessage =
  | { type: 'ping'; at: number }
  /** Asks for a fresh snapshot after a gap in sequence numbers. */
  | { type: 'resync' }
  | { type: 'sit'; seat: number; buyIn: number }
  | { type: 'leave' }
  | { type: 'rebuy'; amount: number }
  | { type: 'sit-out'; sittingOut: boolean }
  | { type: 'act'; action: PlayerAction }
  | { type: 'add-bot'; seat: number; difficulty: BotDifficulty; buyIn?: number }
  | { type: 'remove-bot'; seat: number }
  | { type: 'start' }
  | { type: 'emote'; emote: Emote }
  | { type: 'show' }
  | { type: 'muck' }

/**
 * Every update carries the whole view rather than only a patch. A hand generates
 * a handful of events per second, so the bandwidth is irrelevant, and it removes
 * the possibility of a client reducer drifting from the server's authority. The
 * events ride alongside purely to drive animation.
 */
export interface TableUpdate {
  seq: number
  view: TableStateView
  events: GameEvent[]
  /** Server clock at send time, so the client can correct for a skewed device clock. */
  serverTime: number
}

export interface SelfInfo {
  userId: string
  name: string
  seat: number | null
  /** Absent unless it is the viewer's turn. */
  legal: LegalActions | null
}

export type ServerMessage =
  | { type: 'pong'; at: number; serverTime: number }
  | { type: 'welcome'; protocol: number; roomId: string; config: TableConfig; self: SelfInfo }
  | { type: 'update'; update: TableUpdate; self: SelfInfo }
  | { type: 'emote'; seat: number; emote: Emote }
  | { type: 'rejected'; reason: string }
  | { type: 'closed'; reason: string }

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

export type TransportEvent =
  | { kind: 'status'; status: ConnectionStatus }
  | { kind: 'message'; message: ServerMessage }

/**
 * The single seam between the UI and wherever the game is actually running. A
 * Web Worker and a WebSocket both satisfy it, which is what lets single player
 * and online share every component above this line.
 */
export interface Transport {
  send(message: ClientMessage): void
  subscribe(listener: (event: TransportEvent) => void): () => void
  close(): void
}
