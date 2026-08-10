import { anonymousClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export const authClient = createAuthClient({
  baseURL,
  plugins: [anonymousClient()],
})

export async function ensureSignedIn(displayName?: string): Promise<{
  id: string
  name: string
  isAnonymous: boolean
}> {
  const existing = await authClient.getSession()
  if (existing.data?.user) {
    return summarise(existing.data.user)
  }

  const result = await authClient.signIn.anonymous()
  if (result.error || !result.data?.user) {
    throw new Error(result.error?.message ?? 'could not start a guest session')
  }

  const trimmed = displayName?.trim()
  if (trimmed && trimmed !== result.data.user.name) {
    await authClient.updateUser({ name: trimmed })
    const refreshed = await authClient.getSession()
    if (refreshed.data?.user) return summarise(refreshed.data.user)
  }

  return summarise(result.data.user)
}

function summarise(user: { id: string; name: string; isAnonymous?: boolean | null }) {
  return {
    id: user.id,
    name: user.name,
    isAnonymous: Boolean(user.isAnonymous),
  }
}
