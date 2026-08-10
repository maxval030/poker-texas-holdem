import type { TableConfig } from '@holdem/engine'
import type { ClientMessage } from '@holdem/protocol'
import { eq } from 'drizzle-orm'
import { Elysia, t } from 'elysia'
import { db } from '../db/client.ts'
import { user } from '../db/schema.ts'
import { findOpenRoomById, RoomError } from '../rooms/service.ts'
import { consumeWsTicket } from '../valkey.ts'
import { roomRegistry, type SocketSink } from './registry.ts'

interface Attachment {
  userId: string
  roomId: string
  name: string
  config: TableConfig
  sink: SocketSink
}

function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ClientMessage
    } catch {
      return null
    }
  }
  if (raw && typeof raw === 'object' && 'type' in raw) {
    return raw as ClientMessage
  }
  return null
}

/**
 * Ticket-authenticated table socket. Cookies never reach this path; the HTTP
 * `/ws-ticket` endpoint is what proves the session, and the ticket is burned
 * atomically as the socket opens.
 */
export const tableWs = new Elysia().ws('/table/:roomId', {
  query: t.Object({
    ticket: t.String({ minLength: 8 }),
  }),
  params: t.Object({
    roomId: t.String({ minLength: 8 }),
  }),
  async open(ws) {
    const ticket = ws.data.query.ticket
    const roomId = ws.data.params.roomId

    const claims = await consumeWsTicket(ticket)
    if (!claims || claims.roomId !== roomId) {
      ws.send({ type: 'closed', reason: 'invalid or expired ticket' })
      ws.close(4401, 'invalid ticket')
      return
    }

    const openRoom = await findOpenRoomById(roomId).catch((error: unknown) => {
      const reason = error instanceof RoomError ? error.message : 'room unavailable'
      ws.send({ type: 'closed', reason })
      ws.close(4404, reason)
      return null
    })
    if (!openRoom) return

    const [account] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, claims.userId))
      .limit(1)

    if (!account) {
      ws.send({ type: 'closed', reason: 'unknown user' })
      ws.close(4401, 'unknown user')
      return
    }

    const sink: SocketSink = {
      send(message) {
        // 1 is WebSocket.OPEN; the constant is not always in scope under Bun.
        if (ws.raw.readyState === 1) ws.send(message)
      },
      close(code, reason) {
        ws.close(code, reason)
      },
    }

    const attachment: Attachment = {
      userId: claims.userId,
      roomId: openRoom.id,
      name: account.name,
      config: openRoom.config,
      sink,
    }
    ;(ws.data as { attachment?: Attachment }).attachment = attachment

    try {
      await roomRegistry.attach({
        roomId: attachment.roomId,
        userId: attachment.userId,
        name: attachment.name,
        config: attachment.config,
        socket: sink,
      })
    } catch (error) {
      console.error('failed to attach table socket', error)
      ws.send({ type: 'closed', reason: 'could not join table' })
      ws.close(1011, 'attach failed')
    }
  },
  message(ws, message) {
    const attachment = (ws.data as { attachment?: Attachment }).attachment
    if (!attachment) return
    const parsed = parseClientMessage(message)
    if (!parsed) {
      ws.send({ type: 'rejected', reason: 'malformed message' })
      return
    }
    roomRegistry.receive(attachment.roomId, attachment.userId, parsed)
  },
  close(ws) {
    const attachment = (ws.data as { attachment?: Attachment }).attachment
    if (!attachment) return
    roomRegistry.detach(attachment.roomId, attachment.userId, attachment.sink)
  },
})
