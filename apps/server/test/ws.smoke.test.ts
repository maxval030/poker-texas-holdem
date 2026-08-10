import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client.ts'
import { room, user } from '../src/db/schema.ts'
import { createRoom } from '../src/rooms/service.ts'
import { connectValkey, issueWsTicket } from '../src/valkey.ts'

const HOST_ID = 'ws-smoke-host'
const PORT = 3011
let stop: (() => void) | null = null

beforeAll(async () => {
  await connectValkey()
  await db
    .insert(user)
    .values({
      id: HOST_ID,
      name: 'Smoke',
      email: 'smoke@test.local',
      emailVerified: true,
      isAnonymous: false,
    })
    .onConflictDoNothing()

  const { tableWs } = await import('../src/realtime/ws.ts')
  const { Elysia } = await import('elysia')
  const app = new Elysia().use(tableWs).listen(PORT)
  stop = () => app.stop()
})

afterAll(async () => {
  stop?.()
  await db.delete(room).where(eq(room.hostUserId, HOST_ID))
  await db.delete(user).where(eq(user.id, HOST_ID))
  // kept alive across files
})

describe('table websocket', () => {
  test('deals a hand and redacts the opponent hole cards', async () => {
    const created = await createRoom(HOST_ID, {
      smallBlind: 25,
      bigBlind: 50,
      minBuyIn: 2_000,
      maxBuyIn: 10_000,
      actionClockMs: 30_000,
      rebuy: { kind: 'unlimited' },
    })
    const ticket = await issueWsTicket({ userId: HOST_ID, roomId: created.id })

    const messages: { type: string; [key: string]: unknown }[] = []

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/table/${created.id}?ticket=${ticket}`)
      const timer = setTimeout(() => {
        ws.close()
        reject(new Error(`timed out after ${messages.map((m) => m.type).join(',')}`))
      }, 5_000)

      ws.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as {
          type: string
          update?: {
            view: {
              hand: {
                complete: boolean
                players: { seat: number; holeCards: number[] | null }[]
              } | null
            }
          }
          self?: { legal: { canFold: boolean } | null }
        }
        messages.push(message)

        if (message.type === 'welcome') {
          ws.send(JSON.stringify({ type: 'sit', seat: 0, buyIn: 5_000 }))
          ws.send(JSON.stringify({ type: 'add-bot', seat: 1, difficulty: 'easy' }))
          ws.send(JSON.stringify({ type: 'start' }))
        }

        if (
          message.type === 'update' &&
          message.update?.view.hand &&
          !message.update.view.hand.complete
        ) {
          clearTimeout(timer)
          const mine = message.update.view.hand.players.find((player) => player.seat === 0)
          const other = message.update.view.hand.players.find((player) => player.seat === 1)
          expect(mine?.holeCards).toHaveLength(2)
          expect(other?.holeCards).toBeNull()
          ws.close()
          resolve()
        }
      })

      ws.addEventListener('error', () => {
        clearTimeout(timer)
        reject(new Error('socket error'))
      })
    })

    expect(messages.some((message) => message.type === 'welcome')).toBe(true)
  })

  test('rejects a burned ticket', async () => {
    const created = await createRoom(HOST_ID, {
      smallBlind: 25,
      bigBlind: 50,
      minBuyIn: 2_000,
      maxBuyIn: 10_000,
      actionClockMs: 30_000,
      rebuy: { kind: 'unlimited' },
    })
    const ticket = await issueWsTicket({ userId: HOST_ID, roomId: created.id })

    await new Promise<void>((resolve, reject) => {
      const first = new WebSocket(`ws://127.0.0.1:${PORT}/table/${created.id}?ticket=${ticket}`)
      first.addEventListener('open', () => {
        // Wait a beat so the first socket consumes the ticket, then try again.
        setTimeout(() => {
          const second = new WebSocket(
            `ws://127.0.0.1:${PORT}/table/${created.id}?ticket=${ticket}`,
          )
          second.addEventListener('message', (event) => {
            const message = JSON.parse(String(event.data)) as { type: string; reason?: string }
            expect(message.type).toBe('closed')
            first.close()
            second.close()
            resolve()
          })
          second.addEventListener('close', () => resolve())
          second.addEventListener('error', () => resolve())
        }, 100)
      })
      first.addEventListener('error', () => reject(new Error('first socket failed')))
    })
  })
})
