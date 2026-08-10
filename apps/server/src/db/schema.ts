import type { TableConfig } from '@holdem/engine'
import { relations } from 'drizzle-orm'
import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

/**
 * Better Auth's core tables, plus the anonymous flag. Table and column names
 * match what the drizzle adapter expects out of the box.
 */
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  isAnonymous: boolean('is_anonymous').notNull().default(false),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const roomStatus = pgEnum('room_status', ['created', 'active', 'dormant', 'closed'])

export const room = pgTable(
  'room',
  {
    id: text('id').primaryKey(),
    /** Short code shown in the invite UI and typed at the join form. */
    code: text('code').notNull(),
    hostUserId: text('host_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    status: roomStatus('status').notNull().default('created'),
    config: jsonb('config').$type<TableConfig>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /** Last time a connected human was seen. Used for the dormant → closed timer. */
    lastHumanAt: timestamp('last_human_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('room_code_unique').on(table.code)],
)

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  rooms: many(room),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}))

export const roomRelations = relations(room, ({ one }) => ({
  host: one(user, { fields: [room.hostUserId], references: [user.id] }),
}))

/** Kept so a future migration can track how many seats a room ever filled. */
export type RoomStatus = (typeof roomStatus.enumValues)[number]

export const ACTION_CLOCK_OPTIONS_MS = [15_000, 20_000, 30_000, 60_000] as const

export interface CreateRoomBody {
  smallBlind: number
  bigBlind: number
  ante?: number
  minBuyIn: number
  maxBuyIn: number
  actionClockMs: (typeof ACTION_CLOCK_OPTIONS_MS)[number]
  rebuy: TableConfig['rebuy']
  maxSeats?: number
}
