import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { formatMessage, type Locale, type MessageKey } from './messages.ts'

const STORAGE_KEY = 'holdem.locale'

interface LocaleContextValue {
  locale: Locale
  setLocale(locale: Locale): void
  t(key: MessageKey, vars?: Record<string, string | number>): string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'th' || stored === 'en') return stored
  return navigator.language.toLowerCase().startsWith('th') ? 'th' : 'en'
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')

  useEffect(() => {
    setLocaleState(readStoredLocale())
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    window.localStorage.setItem(STORAGE_KEY, locale)
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
  }, [])

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => formatMessage(locale, key, vars),
    [locale],
  )

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <LocaleContext value={value}>{children}</LocaleContext>
}

export function useLocale(): LocaleContextValue {
  const value = use(LocaleContext)
  if (!value) throw new Error('useLocale must be used within LocaleProvider')
  return value
}

export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale()
  return (
    <div className={className ?? 'flex gap-1 text-xs'}>
      {(['en', 'th'] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          className="rounded px-2 py-1 uppercase tracking-wide"
          style={{
            background: locale === code ? 'rgba(232,205,148,.22)' : 'transparent',
            color: locale === code ? 'var(--color-brass-300)' : 'rgba(244,236,216,.45)',
          }}
          aria-pressed={locale === code}
        >
          {code}
        </button>
      ))}
    </div>
  )
}
