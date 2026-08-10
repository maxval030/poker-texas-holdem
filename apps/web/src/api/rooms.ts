import type { TableConfig } from '@holdem/engine'

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export interface PublicRoom {
  id: string
  code: string
  status: 'created' | 'active' | 'dormant' | 'closed'
  config: TableConfig
  hostUserId: string
  createdAt: string
}

export interface CreateRoomInput {
  smallBlind: number
  bigBlind: number
  ante?: number
  minBuyIn: number
  maxBuyIn: number
  actionClockMs: 15_000 | 20_000 | 30_000 | 60_000
  rebuy: TableConfig['rebuy']
  maxSeats?: number
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
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

export function createRoom(input: CreateRoomInput): Promise<PublicRoom> {
  return api('/rooms', { method: 'POST', body: JSON.stringify(input) })
}

export function fetchRoomByCode(code: string): Promise<PublicRoom> {
  return api(`/rooms/code/${encodeURIComponent(code.trim().toUpperCase())}`)
}

export function fetchRoomById(id: string): Promise<PublicRoom> {
  return api(`/rooms/${encodeURIComponent(id)}`)
}

export function issueWsTicket(roomId: string): Promise<{
  ticket: string
  expiresInMs: number
  roomId: string
}> {
  return api('/ws-ticket', { method: 'POST', body: JSON.stringify({ roomId }) })
}
