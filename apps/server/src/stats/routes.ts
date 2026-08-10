import { Elysia } from 'elysia'
import { gatePlugin } from '../gate/plugin.ts'
import { getOnlineStats } from '../realtime/presence.ts'
import { rateLimitPlugin } from '../rate-limit/plugin.ts'

export const statsRoutes = new Elysia({ prefix: '/stats' })
  .use(rateLimitPlugin)
  .use(gatePlugin)
  .get(
    '/online',
    async () => getOnlineStats(),
    {
      gate: true,
      rateLimit: { limit: 120, windowSeconds: 3_600, key: 'ip', scope: 'stats:online' },
      detail: {
        summary: 'Live table and player counts',
        tags: ['Stats'],
      },
    },
  )
