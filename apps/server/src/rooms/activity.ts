import type { ClientMessage } from '@holdem/protocol'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { room } from '../db/schema.ts'
import { clearIdleClosingWarning } from './closing.ts'

export function isHumanAction(message: ClientMessage): boolean {
  return message.type !== 'ping' && message.type !== 'resync'
}

/** Records meaningful human input and clears idle close warnings. */
export async function touchHumanAction(roomId: string): Promise<void> {
  await db
    .update(room)
    .set({
      lastHumanActionAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(room.id, roomId))
  await clearIdleClosingWarning(roomId)
}
