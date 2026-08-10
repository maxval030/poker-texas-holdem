/** Best-effort client IP for rate limiting and Turnstile remoteip. */
export function clientIp(request: Request, server?: { requestIP?: (req: Request) => { address: string } | null }): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }

  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  const fromServer = server?.requestIP?.(request)?.address
  if (fromServer) return fromServer

  return 'unknown'
}
