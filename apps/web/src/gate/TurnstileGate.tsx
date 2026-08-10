import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale } from '../i18n/locale.tsx'
import { fetchGateStatus, isTurnstileConfigured, turnstileSiteKey, verifyGate } from './api.ts'

type GatePhase = 'checking' | 'challenge' | 'verifying' | 'verified' | 'error'

interface TurnstileGateProps {
  onVerified: () => void
}

export function TurnstileGate({ onVerified }: TurnstileGateProps) {
  const { t } = useLocale()
  const turnstileRef = useRef<TurnstileInstance>(null)
  const [phase, setPhase] = useState<GatePhase>('checking')
  const [error, setError] = useState<string | null>(null)

  const completeVerification = useCallback(async (token?: string) => {
    setPhase('verifying')
    setError(null)
    try {
      await verifyGate(token)
      setPhase('verified')
      onVerified()
    } catch (err) {
      setPhase('error')
      setError(err instanceof Error ? err.message : t('gate.error'))
      turnstileRef.current?.reset()
    }
  }, [onVerified, t])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const status = await fetchGateStatus()
        if (cancelled) return
        if (status.verified) {
          setPhase('verified')
          onVerified()
          return
        }

        if (!isTurnstileConfigured()) {
          await completeVerification('dev-bypass')
          return
        }

        setPhase('challenge')
      } catch {
        if (!cancelled) {
          if (!isTurnstileConfigured()) {
            await completeVerification('dev-bypass')
          } else {
            setPhase('challenge')
          }
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [completeVerification, onVerified])

  if (phase === 'checking' || phase === 'verifying' || phase === 'verified') {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-sm text-cream/60">
        <p>{phase === 'verifying' ? t('gate.verifying') : t('gate.checking')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="text-center">
        <p className="text-sm font-medium text-cream/90">{t('gate.title')}</p>
        <p className="mt-1 text-xs text-cream/50">{t('gate.hint')}</p>
      </div>

      {isTurnstileConfigured() && turnstileSiteKey && (
        <Turnstile
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          onSuccess={(token) => void completeVerification(token)}
          onError={() => {
            setPhase('error')
            setError(t('gate.error'))
          }}
          onExpire={() => turnstileRef.current?.reset()}
          options={{ theme: 'dark', size: 'normal' }}
        />
      )}

      {error && <p className="rounded-lg bg-[#7a2f2f] px-3 py-2 text-sm text-cream">{error}</p>}

      {phase === 'error' && (
        <button
          type="button"
          onClick={() => {
            setError(null)
            setPhase('challenge')
            turnstileRef.current?.reset()
          }}
          className="rounded-lg border border-brass-400/40 px-4 py-2 text-sm text-brass-300"
        >
          {t('gate.retry')}
        </button>
      )}
    </div>
  )
}
