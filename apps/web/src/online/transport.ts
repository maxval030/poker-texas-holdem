import type { ClientMessage, ServerMessage, Transport, TransportEvent } from '@holdem/protocol'
import { issueWsTicket } from '../api/rooms.ts'

const wsBase = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001'

/**
 * Online half of the transport seam. Mints a short-lived ticket over HTTP, then
 * upgrades to the table socket. Sequence gaps ask the server for a fresh
 * snapshot rather than trying to invent the missing events.
 */
export function createOnlineTransport(roomId: string): Transport {
  const listeners = new Set<(event: TransportEvent) => void>()
  let backlog: TransportEvent[] = []
  let socket: WebSocket | null = null
  let closed = false
  let lastSeq = 0
  const queued: ClientMessage[] = []

  const emit = (event: TransportEvent) => {
    if (listeners.size === 0) {
      backlog.push(event)
      return
    }
    for (const listener of listeners) listener(event)
  }

  const send = (message: ClientMessage) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      queued.push(message)
      return
    }
    socket.send(JSON.stringify(message))
  }

  const onServerMessage = (message: ServerMessage) => {
    if (message.type === 'update') {
      if (lastSeq > 0 && message.update.seq > lastSeq + 1) {
        send({ type: 'resync' })
      }
      lastSeq = message.update.seq
    }
    emit({ kind: 'message', message })
  }

  emit({ kind: 'status', status: 'connecting' })

  void (async () => {
    try {
      const { ticket } = await issueWsTicket(roomId)
      if (closed) return
      const url = `${wsBase}/table/${encodeURIComponent(roomId)}?ticket=${encodeURIComponent(ticket)}`
      socket = new WebSocket(url)

      socket.addEventListener('open', () => {
        emit({ kind: 'status', status: 'open' })
        for (const message of queued.splice(0)) {
          socket?.send(JSON.stringify(message))
        }
      })

      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(String(event.data)) as ServerMessage
          onServerMessage(message)
        } catch {
          // Ignore non-JSON frames; the protocol is JSON only.
        }
      })

      socket.addEventListener('close', () => {
        emit({ kind: 'status', status: 'closed' })
      })

      socket.addEventListener('error', () => {
        emit({ kind: 'status', status: 'closed' })
      })
    } catch (error) {
      console.error('online transport failed', error)
      emit({ kind: 'status', status: 'closed' })
    }
  })()

  return {
    send,
    subscribe(listener) {
      listeners.add(listener)
      const held = backlog
      backlog = []
      for (const event of held) listener(event)
      return () => listeners.delete(listener)
    },
    close() {
      closed = true
      socket?.close()
      socket = null
      backlog = []
      for (const listener of listeners) listener({ kind: 'status', status: 'closed' })
      listeners.clear()
    },
  }
}
