import type { ClosingReason, ServerMessage } from '@holdem/protocol'
import type { room } from '../db/schema.ts'
import { getPublisher } from '../valkey.ts'
import {
  CLOSING_WARNING_MS,
  CREATED_EMPTY_MS,
  DORMANT_CLOSE_MS,
  IDLE_NO_ACTION_MS,
  ROOM_MAX_LIFETIME_MS,
} from './constants.ts'

const WARNED_TTL_SECONDS = 360

function warnedKey(roomId: string, reason: ClosingReason): string {
  return `holdem:room:${roomId}:warned:${reason}`
}

export async function clearIdleClosingWarning(roomId: string): Promise<void> {
  await getPublisher().del(warnedKey(roomId, 'idle-timeout'))
}

export interface RoomDeadline {
  reason: ClosingReason
  closesAt: number
}

export function computeSoonestDeadline(
  row: typeof room.$inferSelect,
  now = Date.now(),
): RoomDeadline | null {
  const candidates: RoomDeadline[] = []

  if (row.status !== 'closed') {
    candidates.push({
      reason: 'session-expiring',
      closesAt: row.createdAt.getTime() + ROOM_MAX_LIFETIME_MS,
    })
  }

  if (row.status === 'active' || row.status === 'dormant') {
    candidates.push({
      reason: 'idle-timeout',
      closesAt: row.lastHumanActionAt.getTime() + IDLE_NO_ACTION_MS,
    })
  }

  if (row.status === 'dormant') {
    candidates.push({
      reason: 'dormant-timeout',
      closesAt: row.lastHumanAt.getTime() + DORMANT_CLOSE_MS,
    })
  }

  const open = candidates.filter((c) => c.closesAt > now)
  if (open.length === 0) return null
  open.sort((a, b) => a.closesAt - b.closesAt)
  return open[0] ?? null
}

export function isInClosingWarningWindow(closesAt: number, now = Date.now()): boolean {
  const remaining = closesAt - now
  return remaining > 0 && remaining <= CLOSING_WARNING_MS
}

async function broadcastClosing(message: ServerMessage, roomId: string): Promise<void> {
  const { roomRegistry } = await import('../realtime/registry.ts')
  roomRegistry.broadcastToRoom(roomId, message)
}

export async function maybeSendClosingWarning(
  row: typeof room.$inferSelect,
  now = Date.now(),
): Promise<boolean> {
  const deadline = computeSoonestDeadline(row, now)
  if (!deadline || !isInClosingWarningWindow(deadline.closesAt, now)) return false

  const key = warnedKey(row.id, deadline.reason)
  const set = await getPublisher().set(key, '1', 'EX', WARNED_TTL_SECONDS, 'NX')
  if (set !== 'OK') return false

  await broadcastClosing(
    {
      type: 'closing-soon',
      reason: deadline.reason,
      closesAt: deadline.closesAt,
    },
    row.id,
  )
  return true
}

export async function notifyDormantClosing(row: typeof room.$inferSelect): Promise<void> {
  const closesAt = row.lastHumanAt.getTime() + DORMANT_CLOSE_MS
  const key = warnedKey(row.id, 'dormant-timeout')
  const set = await getPublisher().set(key, '1', 'EX', WARNED_TTL_SECONDS, 'NX')
  if (set !== 'OK') return

  await broadcastClosing(
    {
      type: 'closing-soon',
      reason: 'dormant-timeout',
      closesAt,
    },
    row.id,
  )
}

/** Skip warning for rules shorter than the warning lead (e.g. created empty 2m). */
export function shouldWarnForCreatedEmpty(): boolean {
  return CREATED_EMPTY_MS > CLOSING_WARNING_MS
}
