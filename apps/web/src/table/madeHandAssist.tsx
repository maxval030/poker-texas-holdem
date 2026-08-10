import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

const STORAGE_KEY = 'holdem.madeHandAssist'

interface MadeHandAssistContextValue {
  enabled: boolean
  setEnabled(next: boolean): void
}

const MadeHandAssistContext = createContext<MadeHandAssistContextValue | null>(null)

function readStored(): boolean {
  if (typeof window === 'undefined') return true
  const v = window.localStorage.getItem(STORAGE_KEY)
  if (v === null) return true
  return v !== '0'
}

export function MadeHandAssistProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(true)

  useEffect(() => {
    setEnabledState(readStored())
  }, [])

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next)
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  }, [])

  const value = useMemo(() => ({ enabled, setEnabled }), [enabled, setEnabled])

  return <MadeHandAssistContext value={value}>{children}</MadeHandAssistContext>
}

export function useMadeHandAssist(): MadeHandAssistContextValue {
  const value = use(MadeHandAssistContext)
  if (!value) throw new Error('useMadeHandAssist must be used within MadeHandAssistProvider')
  return value
}
