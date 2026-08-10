import { Elysia } from 'elysia'
import { auth } from './auth.ts'

/**
 * Mounts Better Auth and exposes an `auth: true` macro that resolves the
 * session against the database on every request (cookieCache is off).
 */
export const authPlugin = new Elysia({ name: 'better-auth' }).mount(auth.handler).macro({
  auth: {
    async resolve({ status, request: { headers } }) {
      const session = await auth.api.getSession({ headers })
      if (!session) return status(401)
      return {
        user: session.user,
        session: session.session,
      }
    },
  },
})
