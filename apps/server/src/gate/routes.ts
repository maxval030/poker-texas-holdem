import { Elysia, t } from 'elysia'
import { env } from '../env.ts'
import { clientIp } from '../rate-limit/ip.ts'
import { rateLimitPlugin } from '../rate-limit/plugin.ts'
import {
  createGateSession,
  GATE_COOKIE_NAME,
  gateCookieAttributes,
  hasValidGate,
} from './session.ts'
import { isTurnstileEnabled, verifyTurnstileToken } from './turnstile.ts'

export const gateRoutes = new Elysia({ prefix: '/gate' })
  .use(rateLimitPlugin)
  .get(
    '/status',
    async ({ request }) => {
      const verified = await hasValidGate(request.headers)
      return { verified }
    },
    {
      detail: {
        summary: 'Check whether the browser has passed the Turnstile gate',
        tags: ['Gate'],
      },
    },
  )
  .post(
    '/verify',
    async ({ body, request, set }) => {
      const token = body.token?.trim() ?? ''
      if (!token && isTurnstileEnabled()) {
        set.status = 400
        return { error: 'missing turnstile token' }
      }

      const verifyToken = token || 'dev-bypass'
      const result = await verifyTurnstileToken(verifyToken, clientIp(request))
      if (!result.success) {
        set.status = 403
        return { error: 'turnstile verification failed' }
      }

      const gateId = await createGateSession()
      set.headers['set-cookie'] = `${GATE_COOKIE_NAME}=${gateId}; ${gateCookieAttributes(env.turnstile.gateTtlSeconds)}`
      return { verified: true as const }
    },
    {
      rateLimit: { limit: 20, windowSeconds: 60, key: 'ip', scope: 'gate:verify' },
      body: t.Object({
        token: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Verify a Turnstile token and issue a gate cookie',
        tags: ['Gate'],
      },
    },
  )
