import { Elysia } from 'elysia'
import { getOnlineStats } from '../realtime/presence.ts'

export const statsRoutes = new Elysia({ prefix: '/stats' }).get(
  '/online',
  async () => getOnlineStats(),
  {
    detail: {
      summary: 'Live table and player counts',
      tags: ['Stats'],
    },
  },
)
