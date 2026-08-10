const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export interface GateStatus {
  verified: boolean
}

async function gateApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseURL}${path}`, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  const body = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error(body.error ?? `request failed (${response.status})`)
  }
  return body
}

export function fetchGateStatus(): Promise<GateStatus> {
  return gateApi<GateStatus>('/gate/status')
}

export function verifyGate(token?: string): Promise<GateStatus & { verified: true }> {
  return gateApi('/gate/verify', {
    method: 'POST',
    body: JSON.stringify({ token: token ?? 'dev-bypass' }),
  })
}

export const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

export function isTurnstileConfigured(): boolean {
  return Boolean(turnstileSiteKey && turnstileSiteKey.length > 0)
}
