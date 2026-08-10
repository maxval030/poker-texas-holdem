import { ensureCourtSprite } from '@holdem/cards'
import { MAX_SEATS } from '@holdem/engine'
import { EMOTES } from '@holdem/protocol'
import { useCallback, useEffect, useState } from 'react'
import { LanguageSwitch, useLocale } from '../i18n/locale.tsx'
import { ActionBar } from './ActionBar.tsx'
import { Board } from './Board.tsx'
import { ChipFX } from './ChipFX.tsx'
import { EMOTE_LABEL_KEY, EMOTE_MARK } from './emotes.tsx'
import { Felt } from './Felt.tsx'
import { chips } from './format.ts'
import { useMadeHandAssist } from './madeHandAssist.tsx'
import { ResultBanner } from './ResultBanner.tsx'
import { Seat } from './Seat.tsx'
import { Stage } from './Stage.tsx'
import { useTableStore } from './store.ts'

const SEAT_INDICES = Array.from({ length: MAX_SEATS }, (_, index) => index)

export function TableScreen({ title }: { title: string }) {
  const send = useTableStore((state) => state.send)
  const config = useTableStore((state) => state.view?.config ?? null)
  const status = useTableStore((state) => state.status)
  const rejection = useTableStore((state) => state.rejection)
  const dismissRejection = useTableStore((state) => state.dismissRejection)
  const { t } = useLocale()
  const { enabled: assistEnabled, setEnabled: setAssistEnabled } = useMadeHandAssist()
  const [chartOpen, setChartOpen] = useState(false)

  useEffect(() => {
    ensureCourtSprite().catch(() => {
      // Court cards fall back to an empty frame rather than taking down the table.
    })
  }, [])

  const onSit = useCallback(
    (seat: number) => {
      send({ type: 'sit', seat, buyIn: config?.maxBuyIn ?? 0 })
    },
    [send, config?.maxBuyIn],
  )

  return (
    <div className="flex h-dvh flex-col bg-felt-900">
      <header
        className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 text-xs"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <span className="font-semibold tracking-wide text-brass-300">{title}</span>
        {config && (
          <span className="text-cream/60">
            {t('table.blinds', {
              sb: chips(config.smallBlind),
              bb: chips(config.bigBlind),
            })}
          </span>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAssistEnabled(!assistEnabled)}
            className="rounded px-2 py-1 tracking-wide"
            style={{
              background: assistEnabled ? 'rgba(232,205,148,.22)' : 'transparent',
              color: assistEnabled ? 'var(--color-brass-300)' : 'rgba(244,236,216,.45)',
            }}
            aria-pressed={assistEnabled}
          >
            {t('assist.madeHand')}
          </button>
          <button
            type="button"
            onClick={() => setChartOpen((open) => !open)}
            className="rounded px-2 py-1 tracking-wide"
            style={{
              background: chartOpen ? 'rgba(232,205,148,.22)' : 'transparent',
              color: chartOpen ? 'var(--color-brass-300)' : 'rgba(244,236,216,.45)',
            }}
            aria-pressed={chartOpen}
          >
            {t('assist.handChart')}
          </button>
          <LanguageSwitch />
          <ConnectionDot status={status} />
        </div>
      </header>

      <Stage>
        <Felt />
        <Board />
        <ResultBanner />
        <ChipFX />
        {SEAT_INDICES.map((index) => (
          <Seat key={`seat-${index}`} index={index} onSit={onSit} />
        ))}
      </Stage>

      <EmoteTray />
      <ActionBar />

      {rejection && (
        <button
          type="button"
          onClick={dismissRejection}
          className="absolute inset-x-4 top-14 mx-auto max-w-sm rounded-lg bg-[#7a2f2f] px-4 py-2 text-sm text-cream shadow-lg"
        >
          {rejection}
        </button>
      )}
    </div>
  )
}

function ConnectionDot({ status }: { status: string }) {
  const { t } = useLocale()
  const colour = status === 'open' ? '#3faa6a' : status === 'closed' ? '#b8442e' : '#d9a13a'
  const label =
    status === 'open'
      ? t('status.open')
      : status === 'closed'
        ? t('status.closed')
        : status === 'reconnecting'
          ? t('status.reconnecting')
          : t('status.connecting')
  return (
    <span className="flex items-center gap-1.5 text-cream/60">
      <span className="size-2 rounded-full" style={{ background: colour }} />
      {label}
    </span>
  )
}

function EmoteTray() {
  const send = useTableStore((state) => state.send)
  const seated = useTableStore((state) => state.self?.seat ?? null)
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  if (seated === null) return null

  return (
    <div className="relative shrink-0 px-3">
      {open && (
        <div className="absolute bottom-full right-3 mb-2 flex gap-1 rounded-xl border border-brass-400/30 bg-[#1a120c]/95 p-1.5 shadow-lg">
          {EMOTES.map((emote) => (
            <button
              key={emote}
              type="button"
              onClick={() => {
                send({ type: 'emote', emote })
                setOpen(false)
              }}
              className="flex min-w-12 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-brass-300 active:bg-white/10"
              aria-label={t(EMOTE_LABEL_KEY[emote])}
            >
              <span className="text-lg font-bold leading-none">{EMOTE_MARK[emote]}</span>
              <span className="max-w-14 truncate text-[10px] text-cream/70">
                {t(EMOTE_LABEL_KEY[emote])}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-full border border-brass-400/40 px-3 py-1 text-xs text-brass-300"
        >
          {t('table.emote')}
        </button>
      </div>
    </div>
  )
}
