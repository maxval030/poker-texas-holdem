import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { betterAuth } from 'better-auth'
import { anonymous } from 'better-auth/plugins'
import { db } from './db/client.ts'
import * as schema from './db/schema.ts'
import { env } from './env.ts'
import { hasValidGate } from './gate/session.ts'
import { clientIp } from './rate-limit/ip.ts'
import { hitRateLimit } from './rate-limit/limit.ts'

function socialProviders() {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {}
  if (env.google.clientId && env.google.clientSecret) {
    providers.google = {
      clientId: env.google.clientId,
      clientSecret: env.google.clientSecret,
    }
  }
  if (env.github.clientId && env.github.clientSecret) {
    providers.github = {
      clientId: env.github.clientId,
      clientSecret: env.github.clientSecret,
    }
  }
  if (env.discord.clientId && env.discord.clientSecret) {
    providers.discord = {
      clientId: env.discord.clientId,
      clientSecret: env.discord.clientSecret,
    }
  }
  return providers
}

/**
 * cookieCache is deliberately off. A revoked session that stays valid for the
 * length of a cache TTL would leave a banned player on a live WebSocket for
 * hours; every upgrade and ticket issue hits the database instead.
 */
export const auth = betterAuth({
  baseURL: env.betterAuthUrl,
  secret: env.betterAuthSecret,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  socialProviders: socialProviders(),
  trustedOrigins: [env.webOrigin],
  session: {
    cookieCache: {
      enabled: false,
    },
  },
  advanced: {
    // Cross-origin cookies need SameSite=None + Secure. Local HTTP cannot set
    // those, so development keeps Lax cookies and the vite proxy is what makes
    // the session look same-origin to the browser.
    defaultCookieAttributes: env.betterAuthUrl.startsWith('https')
      ? { sameSite: 'none', secure: true, partitioned: true }
      : { sameSite: 'lax', secure: false },
  },
  plugins: [
    anonymous({
      emailDomainName: 'guest.holdem.local',
    }),
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-in/anonymous') return

      if (!(await hasValidGate(ctx.request?.headers ?? new Headers()))) {
        throw new APIError('FORBIDDEN', { message: 'verification required' })
      }

      const ip = clientIp(ctx.request!)
      const limited = await hitRateLimit(`auth:anonymous:${ip}`, 10, 60)
      if (limited.limited) {
        throw new APIError('TOO_MANY_REQUESTS', { message: 'rate limit exceeded' })
      }
    }),
  },
})

export type AuthSession = typeof auth.$Infer.Session
export type AuthUser = AuthSession['user']
