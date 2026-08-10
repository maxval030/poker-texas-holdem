import { Elysia, t } from 'elysia'
import { authPlugin } from '../auth-plugin.ts'
import { ACTION_CLOCK_OPTIONS_MS } from '../db/schema.ts'
import { issueWsTicket } from '../valkey.ts'
import {
  closeRoomAsHost,
  createRoom,
  findOpenRoomByCode,
  findOpenRoomById,
  publicRoom,
  RoomError,
} from './service.ts'

const rebuySchema = t.Union([
  t.Object({ kind: t.Literal('unlimited') }),
  t.Object({ kind: t.Literal('none') }),
  t.Object({ kind: t.Literal('limited'), maxRebuys: t.Integer({ minimum: 1, maximum: 50 }) }),
])

export const roomRoutes = new Elysia({ prefix: '/rooms' })
  .use(authPlugin)
  .post(
    '/',
    async ({ user, body, set }) => {
      try {
        const created = await createRoom(user.id, body, Boolean(user.isAnonymous))
        set.status = 201
        return publicRoom(created)
      } catch (error) {
        if (error instanceof RoomError) {
          set.status = error.status
          return { error: error.message }
        }
        throw error
      }
    },
    {
      auth: true,
      body: t.Object({
        smallBlind: t.Integer({ minimum: 1 }),
        bigBlind: t.Integer({ minimum: 2 }),
        ante: t.Optional(t.Integer({ minimum: 0 })),
        minBuyIn: t.Integer({ minimum: 1 }),
        maxBuyIn: t.Integer({ minimum: 1 }),
        actionClockMs: t.Union(ACTION_CLOCK_OPTIONS_MS.map((ms) => t.Literal(ms))),
        rebuy: rebuySchema,
        maxSeats: t.Optional(t.Integer({ minimum: 2, maximum: 9 })),
      }),
      detail: {
        summary: 'Create a private cash table',
        tags: ['Rooms'],
      },
    },
  )
  .get(
    '/code/:code',
    async ({ params, set }) => {
      try {
        return publicRoom(await findOpenRoomByCode(params.code))
      } catch (error) {
        if (error instanceof RoomError) {
          set.status = error.status
          return { error: error.message }
        }
        throw error
      }
    },
    {
      auth: true,
      params: t.Object({ code: t.String({ minLength: 4, maxLength: 8 }) }),
      detail: {
        summary: 'Look up an open room by invite code',
        tags: ['Rooms'],
      },
    },
  )
  .get(
    '/:id',
    async ({ params, set }) => {
      try {
        return publicRoom(await findOpenRoomById(params.id))
      } catch (error) {
        if (error instanceof RoomError) {
          set.status = error.status
          return { error: error.message }
        }
        throw error
      }
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ minLength: 8 }) }),
      detail: {
        summary: 'Look up an open room by id',
        tags: ['Rooms'],
      },
    },
  )
  .delete(
    '/:id',
    async ({ user, params, set }) => {
      try {
        await closeRoomAsHost(params.id, user.id)
        return { ok: true as const }
      } catch (error) {
        if (error instanceof RoomError) {
          set.status = error.status
          return { error: error.message }
        }
        throw error
      }
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ minLength: 8 }) }),
      detail: {
        summary: 'Close a table immediately (host only)',
        tags: ['Rooms'],
      },
    },
  )

export const ticketRoutes = new Elysia().use(authPlugin).post(
  '/ws-ticket',
  async ({ user, body, set }) => {
    try {
      const found = await findOpenRoomById(body.roomId)
      const ticket = await issueWsTicket({ userId: user.id, roomId: found.id })
      return {
        ticket,
        expiresInMs: 30_000,
        roomId: found.id,
      }
    } catch (error) {
      if (error instanceof RoomError) {
        set.status = error.status
        return { error: error.message }
      }
      throw error
    }
  },
  {
    auth: true,
    body: t.Object({
      roomId: t.String({ minLength: 8 }),
    }),
    detail: {
      summary: 'Issue a single-use WebSocket ticket for a room',
      tags: ['Realtime'],
    },
  },
)
