import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchRoomByCode, type PublicRoom } from '../api/rooms.ts'
import { ensureSignedIn } from '../auth/client.ts'
import { useLocale } from '../i18n/locale.tsx'
import { createOnlineTransport } from '../online/transport.ts'
import { chips } from '../table/format.ts'
import { useTableStore } from '../table/store.ts'
import { TableScreen } from '../table/TableScreen.tsx'

export const Route = createFileRoute('/room/$code')({
  component: RoomPage,
  ssr: false,
})

function RoomPage() {
  const { code } = Route.useParams()
  const [room, setRoom] = useState<PublicRoom | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await ensureSignedIn()
        const found = await fetchRoomByCode(code)
        if (cancelled) return
        setRoom(found)
        setReady(true)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'room unavailable')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code])

  if (error) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
        <p className="rounded-lg bg-[#7a2f2f] px-4 py-3 text-cream">{error}</p>
        <Link to="/room/join" className="text-center text-brass-300">
          Try another code
        </Link>
      </main>
    )
  }

  if (!room || !ready) {
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
