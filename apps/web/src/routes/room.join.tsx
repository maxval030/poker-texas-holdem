import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { authClient } from '../auth/client.ts'
import {
  DISPLAY_NAME_MAX_BASE,
  displayNameErrorKey,
  hasUsableDisplayName,
} from '../auth/displayName.ts'
import { ensureNamedPlayer } from '../auth/ensureNamedPlayer.ts'
import { LanguageSwitch, useLocale } from '../i18n/locale.tsx'

export const Route = createFileRoute('/room/join')({
  component: JoinRoomPage,
  ssr: false,
})

function JoinRoomPage() {
  const navigate = useNavigate()
  const { t } = useLocale()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [namedAlready, setNamedAlready] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const session = await authClient.getSession()
      if (!cancelled && hasUsableDisplayName(session.data?.user?.name)) {
        setNamedAlready(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const normalised = code.trim().toUpperCase()
    if (normalised.length < 4) {
      setError(t('join.codeError'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const named = await ensureNamedPlayer(name)
      if (!named.ok) {
        setError(t(displayNameErrorKey(named.reason)))
        setBusy(false)
        return
      }
      await navigate({ to: '/room/$code', params: { code: normalised } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not join')
      setBusy(false)
    }
  }

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div
        className="absolute right-4 top-4"
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <LanguageSwitch />
      </div>
      <header className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-brass-300">{t('join.title')}</h1>
        <p className="mt-2 text-sm text-cream/70">{t('join.subtitle')}</p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {!namedAlready && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-cream/80">{t('join.name')}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-lg border border-brass-400/30 bg-black/30 px-3 py-2 text-cream"
              placeholder={t('name.placeholder')}
              maxLength={DISPLAY_NAME_MAX_BASE}
              required
              minLength={3}
            />
            <span className="text-xs text-cream/50">{t('name.hint')}</span>
          </label>
        )}

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-cream/80">{t('join.code')}</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            className="rounded-lg border border-brass-400/30 bg-black/30 px-3 py-3 text-center text-2xl tracking-[0.35em] text-brass-300"
            placeholder="ABC123"
            maxLength={8}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>

        {error && <p className="rounded-lg bg-[#7a2f2f] px-3 py-2 text-sm text-cream">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-felt-600 px-5 py-4 font-semibold text-cream shadow-md disabled:opacity-50"
        >
          {busy ? t('join.joining') : t('join.submit')}
        </button>
      </form>
    </main>
  )
}
