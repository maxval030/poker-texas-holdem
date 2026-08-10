import { describe, expect, test } from 'bun:test'
import { formatMessage, MESSAGES, type MessageKey } from './messages.ts'

describe('i18n', () => {
  test('every English key has a Thai translation', () => {
    for (const key of Object.keys(MESSAGES.en) as MessageKey[]) {
      expect(MESSAGES.th[key]?.length).toBeGreaterThan(0)
    }
  })

  test('interpolates variables', () => {
    expect(formatMessage('en', 'table.pot', { amount: '1,200' })).toBe('Pot 1,200')
    expect(formatMessage('th', 'table.pot', { amount: '1,200' })).toContain('1,200')
  })
})
