import { describe, expect, test } from 'bun:test'
import { parseCards } from '@holdem/engine'
import { resolveHeroMadeHand } from './useMadeHand.ts'

describe('resolveHeroMadeHand', () => {
  const hole = parseCards('As Kh') as [number, number]
  const board = parseCards('2c 3d 4h')

  test('visible when assist on, hole face-up, not folded, hand live', () => {
    const result = resolveHeroMadeHand({
      assistEnabled: true,
      hole,
      board: [],
      folded: false,
      complete: false,
    })
    expect(result.made?.category).toBe('high-card')
    expect(result.visible).toBe(true)
  })

  test('hidden when assist off', () => {
    const result = resolveHeroMadeHand({
      assistEnabled: false,
      hole,
      board: [],
      folded: false,
      complete: false,
    })
    expect(result.made).not.toBeNull()
    expect(result.visible).toBe(false)
  })

  test('hidden when folded, complete, or hole not visible', () => {
    expect(
      resolveHeroMadeHand({
        assistEnabled: true,
        hole,
        board,
        folded: true,
        complete: false,
      }).visible,
    ).toBe(false)
    expect(
      resolveHeroMadeHand({
        assistEnabled: true,
        hole,
        board,
        folded: false,
        complete: true,
      }).visible,
    ).toBe(false)
    expect(
      resolveHeroMadeHand({
        assistEnabled: true,
        hole: null,
        board,
        folded: false,
        complete: false,
      }).visible,
    ).toBe(false)
  })
})
