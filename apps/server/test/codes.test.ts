import { describe, expect, test } from 'bun:test'
import { generateRoomCode } from '../src/rooms/codes.ts'

describe('generateRoomCode', () => {
  test('is six characters from the unambiguous alphabet', () => {
    const code = generateRoomCode()
    expect(code).toHaveLength(6)
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  })

  test('is deterministic for a given byte string', () => {
    const bytes = Uint8Array.from([0, 1, 2, 3, 4, 5])
    expect(generateRoomCode(bytes)).toBe(generateRoomCode(bytes))
  })
})
