import { authClient, ensureSignedIn } from './client.ts'
import { buildDisplayName, hasUsableDisplayName, parseDisplayNameBase } from './displayName.ts'

export type EnsureNamedPlayerError = 'tooShort' | 'tooLong'

/**
 * Signs in anonymously if needed and ensures the session has a usable display name.
 * When the session already has a name, `baseInput` is ignored.
 */
export async function ensureNamedPlayer(
  baseInput: string,
): Promise<
  | { ok: true; user: Awaited<ReturnType<typeof ensureSignedIn>> }
  | { ok: false; reason: EnsureNamedPlayerError }
> {
  const existing = await authClient.getSession()
  if (hasUsableDisplayName(existing.data?.user?.name)) {
    return { ok: true, user: await ensureSignedIn() }
  }

  const parsed = parseDisplayNameBase(baseInput)
  if (!parsed.ok) return parsed

  return { ok: true, user: await ensureSignedIn(buildDisplayName(parsed.base)) }
}
