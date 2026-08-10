import { env } from '../env.ts'

export interface TurnstileVerifyResult {
  success: boolean
  errorCodes?: string[]
}

export function isTurnstileEnabled(): boolean {
  return Boolean(env.turnstile.secretKey)
}

/**
 * Validates a Turnstile token with Cloudflare. When Turnstile is disabled
 * (no secret in dev), every non-empty token passes.
 */
export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
): Promise<TurnstileVerifyResult> {
  if (!isTurnstileEnabled()) {
    return { success: token.length > 0 || token === 'dev-bypass' }
  }

  const body = new URLSearchParams({
    secret: env.turnstile.secretKey!,
    response: token,
  })
  if (remoteIp) body.set('remoteip', remoteIp)

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  const json = (await response.json()) as {
    success?: boolean
    'error-codes'?: string[]
  }

  return {
    success: Boolean(json.success),
    errorCodes: json['error-codes'],
  }
}
