import type { GameEvent, HandPlayerView, Seat, TableStateView } from '@holdem/engine'
import type {
  ClientMessage,
  ConnectionStatus,
  Emote,
  SelfInfo,
  Transport,
  TransportEvent,
} from '@holdem/protocol'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

export interface SeatEmote {
  emote: Emote
  /** Distinguishes repeats of the same emote so the animation restarts. */
  nonce: number
}

interface TableStore {
  status: ConnectionStatus
  view: TableStateView | null
  self: SelfInfo | null
  seq: number
  /** Server clock minus device clock, so a deadline can be trusted on any device. */
  clockSkewMs: number
  emotes: Record<number, SeatEmote>
  /** Latest batch of animation events; `eventNonce` changes when they arrive. */
  events: GameEvent[]
  eventNonce: number
  rejection: string | null
  transport: Transport | null

  attach(transport: Transport): () => void
  send(message: ClientMessage): void
  dismissRejection(): void
}

let emoteNonce = 0
let eventNonce = 0

export const useTableStore = create<TableStore>((set, get) => ({
  status: 'connecting',
  view: null,
  self: null,
  seq: 0,
  clockSkewMs: 0,
  emotes: {},
  events: [],
  eventNonce: 0,
  rejection: null,
  transport: null,

  attach(transport) {
    set({
      transport,
      status: 'connecting',
      view: null,
      self: null,
      seq: 0,
      emotes: {},
      events: [],
      eventNonce: 0,
      rejection: null,
    })

    const unsubscribe = transport.subscribe((event: TransportEvent) => {
      if (event.kind === 'status') {
        set({ status: event.status })
        return
      }

      const message = event.message
      switch (message.type) {
        case 'welcome':
          set({ self: message.self, rejection: null })
          return
        case 'update': {
          eventNonce += 1
          set({
            view: message.update.view,
            self: message.self,
            seq: message.update.seq,
            clockSkewMs: message.update.serverTime - Date.now(),
            events: message.update.events,
            eventNonce,
          })
          return
        }
        case 'emote':
          emoteNonce += 1
          set((state) => ({
            emotes: {
              ...state.emotes,
              [message.seat]: { emote: message.emote, nonce: emoteNonce },
            },
          }))
          return
        case 'rejected':
          set({ rejection: message.reason })
          return
        case 'closed':
          set({ status: 'closed', rejection: message.reason })
          return
        default:
          return
      }
    })

    return () => {
      unsubscribe()
      if (get().transport === transport) set({ transport: null, status: 'closed' })
    }
  },

  send(message) {
    get().transport?.send(message)
  },

  dismissRejection() {
    set({ rejection: null })
  },
}))

export interface SeatSlice {
  seat: Seat | null
  player: HandPlayerView | null
  isActor: boolean
  isButton: boolean
  isViewer: boolean
  deadline: number | null
  actionClockMs: number
  handComplete: boolean
}

export function useSeatSlice(index: number): SeatSlice {
  return useTableStore(
    useShallow((state): SeatSlice => {
      const view = state.view
      if (!view) {
        return {
          seat: null,
          player: null,
          isActor: false,
          isButton: false,
          isViewer: false,
          deadline: null,
          actionClockMs: 0,
          handComplete: false,
        }
      }
      const hand = view.hand
      return {
        seat: view.seats[index] ?? null,
        player: hand?.players.find((player) => player.seat === index) ?? null,
        isActor: hand?.actorSeat === index,
        isButton: (hand?.buttonSeat ?? view.buttonSeat) === index,
        isViewer: view.viewerSeat === index,
        deadline: hand?.actorSeat === index ? hand.deadline : null,
        actionClockMs: view.config.actionClockMs,
        handComplete: hand?.complete ?? false,
      }
    }),
  )
}

export function useSeatEmote(index: number): SeatEmote | null {
  return useTableStore((state) => state.emotes[index] ?? null)
}

const NO_CARDS: number[] = []

export function useBoard(): { cards: number[]; potTotal: number; street: string | null } {
  return useTableStore(
    useShallow((state) => ({
      cards: state.view?.hand?.board ?? NO_CARDS,
      potTotal: state.view?.hand?.potTotal ?? 0,
      street: state.view?.hand?.street ?? null,
    })),
  )
}
