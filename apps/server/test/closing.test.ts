import { describe, expect, test } from 'bun:test'
import {
  computeSoonestDeadline,
  isInClosingWarningWindow,
} from '../src/rooms/closing.ts'
import {
  CLOSING_WARNING_MS,
  DORMANT_CLOSE_MS,
  IDLE_NO_ACTION_MS,
  ROOM_MAX_LIFETIME_MS,
} from '../src/rooms/constants.ts'
import type { room } from '../src/db/schema.ts'

function row(partial: Partial<typeof room.$inferSelect>): typeof room.$inferSelect {
  const now = Date.now()
  return {
    id: 'r1',
    code: 'ABC123',
    hostUserId: 'u1',
    status: 'active',
    config: {} as typeof room.$inferSelect['config'],
    createdAt: new Date(now - ROOM_MAX_LIFETIME_MS + 4 * 60_000),
    updatedAt: new Date(now),
    closedAt: null,
    lastHumanAt: new Date(now),
    lastHumanActionAt: new Date(now - IDLE_NO_ACTION_MS + 4 * 60_000),
    ...partial,
  }
}

describe('computeSoonestDeadline', () => {
  test('picks the nearest deadline', () => {
    const now = Date.now()
    const deadline = computeSoonestDeadline(
      row({
        createdAt: new Date(now - ROOM_MAX_LIFETIME_MS + 3 * 60_000),
        lastHumanActionAt: new Date(now - IDLE_NO_ACTION_MS + 10 * 60_000),
      }),
      now,
    )
    expect(deadline?.reason).toBe('session-expiring')
  })

  test('includes dormant timeout when dormant', () => {
    const now = Date.now()
    const deadline = computeSoonestDeadline(
      row({
        status: 'dormant',
        lastHumanAt: new Date(now - DORMANT_CLOSE_MS + 60_000),
        lastHumanActionAt: new Date(now),
        createdAt: new Date(now - 60_000),
      }),
      now,
    )
    expect(deadline?.reason).toBe('dormant-timeout')
  })
})

describe('isInClosingWarningWindow', () => {
  test('is true inside the warning lead', () => {
    const now = Date.now()
    expect(isInClosingWarningWindow(now + CLOSING_WARNING_MS - 1_000, now)).toBe(true)
    expect(isInClosingWarningWindow(now + CLOSING_WARNING_MS + 1_000, now)).toBe(false)
  })
})
