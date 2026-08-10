import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchRoomByCode, type PublicRoom } from '../api/rooms.ts'
import { authClient } from '../auth/client.ts'
import {
  DISPLAY_NAME_MAX_BASE,
  displayNameErrorKey,
  hasUsableDisplayName,
} from '../auth/displayName.ts'
import { ensureNamedPlayer } from '../auth/ensureNamedPlayer.ts'
import { LanguageSwitch, useLocale } from '../i18n/locale.tsx'
import { createOnlineTransport } from '../online/transport.ts'
import { chips } from '../table/format.ts'
import { useTableStore } from '../table/store.ts'
import { TableScreen } from '../table/TableScreen.tsx'

export const Route = createFileRoute('/room/$code')({
  component: RoomPage,
  ssr: false,
})

type Phase = 'checking' | 'need-name' | 'loading' | 'ready' | 'error'

function RoomPage() {
  const { code } = Route.useParams()
  const { t } = useLocale()
  const [phase, setPhase] = useState<Phase>('checking')
  const [room, setRoom] = useState<PublicRoom | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const session = await authClient.getSession()
        if (cancelled) return
        if (!hasUsableDisplayName(session.data?.user?.name)) {
          setPhase('need-name')
          return
        }
        await ensureNamedPlayer('')
        if (cancelled) return
        setPhase('loading')
        const found = await fetchRoomByCode(code)
        if (cancelled) return
        setRoom(found)
        setPhase('ready')
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'room unavailable')
          setPhase('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code])

  const onNameSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const named = await ensureNamedPlayer(name)
      if (!named.ok) {
        setError(t(displayNameErrorKey(named.reason)))
        return
      }
      setPhase('loading')
      const found = await fetchRoomByCode(code)
      setRoom(found)
      setPhase('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'room unavailable')
      setPhase('error')
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'error') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
        <p className="rounded-lg bg-[#7a2f2f] px-4 py-3 text-cream">{error}</p>
        <Link to="/room/join" className="text-center text-brass-300">
          Try another code
        </Link>
      </main>
    )
  }

  if (phase === 'need-name') {
    return (
      <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
        <div
          className="absolute right-4 top-4"
          style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
        >
          <LanguageSwitch />
        </div>
        <header className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-brass-300">
            {t('name.gateTitle')}
          </h1>
          <p className="mt-2 text-sm text-cream/70">{t('name.gateSubtitle', { code })}</p>
        </header>
        <form onSubmit={onNameSubmit} className="flex flex-col gap-4">
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
          {error && <p className="rounded-lg bg-[#7a2f2f] px-3 py-2 text-sm text-cream">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-felt-600 px-5 py-4 font-semibold text-cream shadow-md disabled:opacity-50"
          >
            {busy ? t('join.joining') : t('name.continue')}
          </button>
        </form>
      </main>
    )
  }

  if (phase !== 'ready' || !room) {
    return <main className="grid min-h-dvh place-items-center text-cream/70">Opening room…</main>
  }

  return <OnlineTable room={room} />
}

function OnlineTable({ room }: { room: PublicRoom }) {
  useEffect(() => {
    const transport = createOnlineTransport(room.id)
    const detach = useTableStore.getState().attach(transport)
    return () => {
      detach()
      transport.close()
    }
  }, [room.id])

  return (
    <div className="relative h-dvh">
      <TableScreen title={`Room ${room.code}`} />
      <OnlineChrome
        code={room.code}
        blinds={`${chips(room.config.smallBlind)} / ${chips(room.config.bigBlind)}`}
      />
    </div>
  )
}

function OnlineChrome({ code, blinds }: { code: string; blinds: string }) {
  const send = useTableStore((state) => state.send)
  const seated = useTableStore((state) => state.self?.seat ?? null)
  const view = useTableStore((state) => state.view)
  const { t } = useLocale()

  const emptySeat = view?.seats.findIndex((seat) => !seat.occupant) ?? -1

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-end gap-2 px-3 py-2 text-xs"
      style={{ paddingTop: 'max(2.75rem, calc(env(safe-area-inset-top) + 2.25rem))' }}
    >
      <div className="pointer-events-auto flex gap-1">
        {emptySeat >= 0 && (
          <button
            type="button"
            onClick={() => send({ type: 'add-bot', seat: emptySeat, difficulty: 'normal' })}
            className="rounded-full bg-black/55 px-3 py-1 text-cream/80"
          >
            {t('table.addBot')}
          </button>
        )}
        {seated !== null && (
          <button
            type="button"
            onClick={() => send({ type: 'start' })}
            className="rounded-full bg-black/55 px-3 py-1 text-cream/80"
          >
            {t('table.deal')}
          </button>
        )}
      </div>
      <span className="sr-only">
        {code} {blinds}
      </span>
    </div>
  )
}
