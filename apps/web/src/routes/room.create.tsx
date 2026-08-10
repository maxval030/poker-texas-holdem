import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { createRoom } from '../api/rooms.ts'
import { authClient } from '../auth/client.ts'
import {
  DISPLAY_NAME_MAX_BASE,
  displayNameErrorKey,
  hasUsableDisplayName,
} from '../auth/displayName.ts'
import { ensureNamedPlayer } from '../auth/ensureNamedPlayer.ts'
import { LanguageSwitch, useLocale } from '../i18n/locale.tsx'

export const Route = createFileRoute('/room/create')({
  component: CreateRoomPage,
  ssr: false,
})

function CreateRoomPage() {
  const navigate = useNavigate()
  const { t } = useLocale()
  const [name, setName] = useState('')
  const [namedAlready, setNamedAlready] = useState(false)
  const [smallBlind, setSmallBlind] = useState(25)
  const [actionClockMs, setActionClockMs] = useState<15_000 | 20_000 | 30_000 | 60_000>(30_000)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bigBlind = smallBlind * 2
  const minBuyIn = bigBlind * 40
  const maxBuyIn = bigBlind * 200

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
    setBusy(true)
    setError(null)
    try {
      const named = await ensureNamedPlayer(name)
      if (!named.ok) {
        setError(t(displayNameErrorKey(named.reason)))
        setBusy(false)
        return
      }
      const room = await createRoom({
        smallBlind,
        bigBlind,
        minBuyIn,
        maxBuyIn,
        actionClockMs,
        rebuy: { kind: 'unlimited' },
      })
      await navigate({ to: '/room/$code', params: { code: room.code } })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'could not create the room'
      setError(message === 'too many open tables' ? t('create.tooManyOpen') : message)
    } finally {
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
        <h1 className="text-2xl font-bold tracking-tight text-brass-300">{t('create.title')}</h1>
        <p className="mt-2 text-sm text-cream/70">{t('create.subtitle')}</p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {!namedAlready && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-cream/80">{t('create.name')}</span>
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
          <span className="text-cream/80">{t('create.smallBlind')}</span>
          <select
            value={smallBlind}
            onChange={(event) => setSmallBlind(Number(event.target.value))}
            className="rounded-lg border border-brass-400/30 bg-black/30 px-3 py-2 text-cream"
          >
            {[5, 10, 25, 50, 100].map((value) => (
              <option key={value} value={value}>
                {value} / {value * 2}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-cream/80">{t('create.clock')}</span>
          <select
            value={actionClockMs}
            onChange={(event) =>
              setActionClockMs(Number(event.target.value) as 15_000 | 20_000 | 30_000 | 60_000)
            }
            className="rounded-lg border border-brass-400/30 bg-black/30 px-3 py-2 text-cream"
          >
            {[15_000, 20_000, 30_000, 60_000].map((ms) => (
              <option key={ms} value={ms}>
                {t('seconds', { n: ms / 1000 })}
              </option>
            ))}
          </select>
        </label>

        <p className="text-xs text-cream/50">
          {t('create.buyIn', {
            min: minBuyIn.toLocaleString(),
            max: maxBuyIn.toLocaleString(),
          })}
        </p>

        {error && <p className="rounded-lg bg-[#7a2f2f] px-3 py-2 text-sm text-cream">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-felt-600 px-5 py-4 font-semibold text-cream shadow-md disabled:opacity-50"
        >
          {busy ? t('create.creating') : t('create.submit')}
        </button>
      </form>
    </main>
  )
}
