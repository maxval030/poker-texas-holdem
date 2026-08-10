import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../env.ts'
import * as schema from './schema.ts'

/**
 * postgres.js rather than Bun.SQL: Bun's pool has known silent deadlocks and
 * row decode bugs that are not yet in a released fix (bun#33985, bun#33665).
 */
const queryClient = postgres(env.databaseUrl, {
  max: 10,
  prepare: false,
})

export const db = drizzle(queryClient, { schema })

export type Database = typeof db
