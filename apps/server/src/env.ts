function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing environment variable ${name}`)
  return value
}

function optional(name: string): string | undefined {
  const value = process.env[name]
  return value && value.length > 0 ? value : undefined
}

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://holdem:holdem@localhost:5432/holdem',
  valkeyUrl: process.env.VALKEY_URL ?? 'redis://localhost:6379',
  serverPort: Number(process.env.SERVER_PORT ?? 3001),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? 'dev-only-change-me-to-a-long-random-string',
  betterAuthUrl: process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',
  google: {
    clientId: optional('GOOGLE_CLIENT_ID'),
    clientSecret: optional('GOOGLE_CLIENT_SECRET'),
  },
  github: {
    clientId: optional('GITHUB_CLIENT_ID'),
    clientSecret: optional('GITHUB_CLIENT_SECRET'),
  },
  discord: {
    clientId: optional('DISCORD_CLIENT_ID'),
    clientSecret: optional('DISCORD_CLIENT_SECRET'),
  },
  turnstile: {
    secretKey: optional('TURNSTILE_SECRET_KEY'),
    gateTtlSeconds: 86_400,
  },
} as const

export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV === 'production') {
    required('BETTER_AUTH_SECRET')
    required('DATABASE_URL')
    required('TURNSTILE_SECRET_KEY')
  }
}
