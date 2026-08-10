import type { MessageKey } from '../i18n/messages.ts'

/** Alphabet without ambiguous 0/O/1/I/l. */
const SUFFIX_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz'

export const DISPLAY_NAME_MIN_BASE = 3
export const DISPLAY_NAME_MAX_BASE = 20
export const DISPLAY_NAME_SUFFIX_LENGTH = 4

const PLACEHOLDER_NAMES = new Set(['guest', 'host', 'anonymous'])

export type DisplayNameBaseError = 'tooShort' | 'tooLong'

export function displayNameErrorKey(reason: DisplayNameBaseError): MessageKey {
  return reason === 'tooShort' ? 'name.tooShort' : 'name.tooLong'
}

export function parseDisplayNameBase(
  raw: string,
): { ok: true; base: string } | { ok: false; reason: DisplayNameBaseError } {
  const base = raw.trim()
  if (base.length < DISPLAY_NAME_MIN_BASE) return { ok: false, reason: 'tooShort' }
  if (base.length > DISPLAY_NAME_MAX_BASE) return { ok: false, reason: 'tooLong' }
  return { ok: true, base }
}

/** True when the session already has a player-chosen name we should keep. */
export function hasUsableDisplayName(name: string | null | undefined): boolean {
  const trimmed = name?.trim() ?? ''
  if (trimmed.length < DISPLAY_NAME_MIN_BASE) return false
  if (PLACEHOLDER_NAMES.has(trimmed.toLowerCase())) return false
  return true
}

export function buildDisplayName(base: string): string {
  const parsed = parseDisplayNameBase(base)
  if (!parsed.ok) {
    throw new Error(`invalid display name base: ${parsed.reason}`)
  }
  return `${parsed.base}-${randomSuffix(DISPLAY_NAME_SUFFIX_LENGTH)}`
}

function randomSuffix(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += SUFFIX_ALPHABET[bytes[i]! % SUFFIX_ALPHABET.length]!
  }
  return out
}
