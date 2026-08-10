import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'holdem.madeHandAssist'

function readStored(): boolean {
  if (typeof window === 'undefined') return true
  const v = window.localStorage.getItem(STORAGE_KEY)
  if (v === null) return true
  return v !== '0'
}

export function useMadeHandAssist(): {
  enabled: boolean
  setEnabled(next: boolean): void
} {
  const [enabled, setEnabledState] = useState(true)

  useEffect(() => {
    setEnabledState(readStored())
  }, [])

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next)
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  }, [])

  return { enabled, setEnabled }
}
