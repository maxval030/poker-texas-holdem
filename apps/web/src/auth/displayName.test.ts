import { describe, expect, test } from 'bun:test'
import {
  buildDisplayName,
  DISPLAY_NAME_MAX_BASE,
  DISPLAY_NAME_MIN_BASE,
  DISPLAY_NAME_SUFFIX_LENGTH,
  hasUsableDisplayName,
  parseDisplayNameBase,
} from './displayName.ts'

describe('parseDisplayNameBase', () => {
  test('accepts trimmed names within bounds', () => {
    expect(parseDisplayNameBase('  Max  ')).toEqual({ ok: true, base: 'Max' })
  })

  test('rejects short and long bases', () => {
    expect(parseDisplayNameBase('ab')).toEqual({ ok: false, reason: 'tooShort' })
    expect(parseDisplayNameBase('a'.repeat(DISPLAY_NAME_MAX_BASE + 1))).toEqual({
      ok: false,
      reason: 'tooLong',
    })
  })
})

describe('hasUsableDisplayName', () => {
  test('rejects empty and placeholders', () => {
    expect(hasUsableDisplayName('')).toBe(false)
    expect(hasUsableDisplayName('  ')).toBe(false)
    expect(hasUsableDisplayName('Guest')).toBe(false)
    expect(hasUsableDisplayName('Host')).toBe(false)
    expect(hasUsableDisplayName('Anonymous')).toBe(false)
  })

  test('accepts suffixed player names', () => {
    expect(hasUsableDisplayName('Max-A7k2')).toBe(true)
  })
})

describe('buildDisplayName', () => {
  test(`appends - and ${DISPLAY_NAME_SUFFIX_LENGTH} unambiguous chars`, () => {
    const name = buildDisplayName('Max')
    expect(name.startsWith('Max-')).toBe(true)
    expect(name.length).toBe(3 + 1 + DISPLAY_NAME_SUFFIX_LENGTH)
    expect(name.slice(4)).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz]+$/)
  })

  test('throws for invalid base', () => {
    expect(() => buildDisplayName('ab')).toThrow()
  })

  test('min length constant matches parser', () => {
    expect(DISPLAY_NAME_MIN_BASE).toBe(3)
  })
})
