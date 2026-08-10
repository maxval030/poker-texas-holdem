import { createGateSession, GATE_COOKIE_NAME } from '../../src/gate/session.ts'

export async function gateCookieHeader(): Promise<string> {
  const gateId = await createGateSession()
  return `${GATE_COOKIE_NAME}=${gateId}`
}
