import type { BotDifficulty, TableConfig } from '@holdem/engine'
import type { ClientMessage, ServerMessage } from '@holdem/protocol'

export interface SoloSetup {
  config: TableConfig
  player: { userId: string; name: string }
  seat: number
  buyIn: number
  bots: { seat: number; difficulty: BotDifficulty }[]
  /** Fixed seed for a reproducible session. Omitted means a CSPRNG shuffle. */
  seed?: number
}

/** Page to worker. */
export type SoloRequest =
  | { kind: 'boot'; setup: SoloSetup }
  | { kind: 'send'; message: ClientMessage }

/** Worker to page. */
export type SoloResponse = { kind: 'ready' } | { kind: 'message'; message: ServerMessage }
