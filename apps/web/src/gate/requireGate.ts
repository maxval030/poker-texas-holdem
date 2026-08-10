import { redirect } from '@tanstack/react-router'
import { fetchGateStatus } from './api.ts'

export async function requireGateVerified(): Promise<void> {
  const status = await fetchGateStatus()
  if (!status.verified) {
    throw redirect({ to: '/' })
  }
}
