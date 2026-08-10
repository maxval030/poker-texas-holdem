import { Elysia } from 'elysia'
import { clientIp } from './ip.ts'
import { hitRateLimit } from './limit.ts'

export type RateLimitKey = 'ip' | 'user'

export interface RateLimitOptions {
  limit: number
  windowSeconds: number
  key?: RateLimitKey
  scope?: string
}

export const rateLimitPlugin = new Elysia({ name: 'rate-limit' })
  .derive({ as: 'scoped' }, ({ server }) => ({
    requestIp: (request: Request) => clientIp(request, server ?? undefined),
  }))
  .macro({
    rateLimit(options: RateLimitOptions) {
      return {
        async beforeHandle(context) {
          const { request, set } = context
          const requestIp =
            'requestIp' in context && typeof context.requestIp === 'function'
              ? context.requestIp
              : (req: Request) => clientIp(req)

          const authUser =
            'user' in context && context.user && typeof context.user === 'object' && 'id' in context.user
              ? (context.user as { id: string })
              : undefined

          const scope = options.scope ?? 'default'
          const keyPart =
            options.key === 'user' && authUser ? authUser.id : requestIp(request)
          const result = await hitRateLimit(
            `${scope}:${keyPart}`,
            options.limit,
            options.windowSeconds,
          )

          set.headers['x-ratelimit-limit'] = String(options.limit)
          set.headers['x-ratelimit-remaining'] = String(result.remaining)

          if (result.limited) {
            set.status = 429
            set.headers['retry-after'] = String(result.retryAfterSeconds)
            return { error: 'rate limit exceeded' }
          }
        },
      }
    },
  })
