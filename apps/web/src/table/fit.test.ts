import { describe, expect, test } from 'bun:test'
import { fitStage } from './fit.ts'
import { LANDSCAPE, PORTRAIT } from './geometry.ts'

describe('fitStage viewports', () => {
  test('phone portrait prefers the portrait stage', () => {
    // iPhone 14 / 15 logical CSS pixels, minus a typical header + action bar.
    const fitted = fitStage(390, 700)
    expect(fitted.layout).toBe(PORTRAIT)
    expect(fitted.scale).toBeGreaterThan(0)
    expect(fitted.scale * PORTRAIT.width).toBeLessThanOrEqual(390 + 0.01)
  })

  test('phone landscape still fits without overflowing', () => {
    const fitted = fitStage(844, 320)
    expect(fitted.scale * fitted.layout.width).toBeLessThanOrEqual(844 + 0.01)
    expect(fitted.scale * fitted.layout.height).toBeLessThanOrEqual(320 + 0.01)
  })

  test('iPad Pro 11" landscape prefers the landscape stage', () => {
    // 1194 × 834 points; table area after chrome is still wide.
    const fitted = fitStage(1194, 720)
    expect(fitted.layout).toBe(LANDSCAPE)
    expect(fitted.scale * LANDSCAPE.width).toBeLessThanOrEqual(1194 + 0.01)
    expect(fitted.scale * LANDSCAPE.height).toBeLessThanOrEqual(720 + 0.01)
  })

  test('iPad Pro 12.9" portrait stays readable', () => {
    // 1024 × 1366 points, minus chrome for header and action bar.
    const fitted = fitStage(1024, 1180)
    expect(fitted.scale * fitted.layout.width).toBeLessThanOrEqual(1024 + 0.01)
    expect(fitted.scale * fitted.layout.height).toBeLessThanOrEqual(1180 + 0.01)
    expect(fitted.scale).toBeGreaterThan(0.5)
  })
})
