import { cors } from '@elysiajs/cors'
import { openapi } from '@elysiajs/openapi'
import { Elysia } from 'elysia'
import { authPlugin } from './auth-plugin.ts'
import { assertProductionSecrets, env } from './env.ts'
import { tableWs } from './realtime/ws.ts'
import { startJanitor } from './rooms/lifecycle.ts'
import { roomRoutes, ticketRoutes } from './rooms/routes.ts'
import { connectValkey } from './valkey.ts'

assertProductionSecrets()

await connectValkey()
const stopJanitor = startJanitor()

const app = new Elysia()
  .use(
    cors({
      origin: env.webOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  )
  .use(
    openapi({
      documentation: {
        info: {
          title: "Texas Hold'em API",
          version: '0.1.0',
          description:
            'REST surface for private rooms and WebSocket tickets. The table protocol itself is typed in @holdem/protocol, not here.',
        },
        tags: [
          { name: 'Rooms', description: 'Private cash tables' },
          { name: 'Realtime', description: 'Ticket issuance for WebSocket upgrades' },
        ],
      },
    }),
  )
  .use(authPlugin)
  .get('/health', () => ({ ok: true as const }), {
    detail: { summary: 'Liveness probe', tags: ['Realtime'] },
  })
  .use(roomRoutes)
  .use(ticketRoutes)
  .use(tableWs)
  .listen({
    port: env.serverPort,
    // Bind on all interfaces so the container port mapping works.
    hostname: '0.0.0.0',
  })

console.info(`holdem server listening on http://localhost:${app.server?.port}`)

const shutdown = async () => {
  stopJanitor()
  await app.stop()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())

export type App = typeof app
