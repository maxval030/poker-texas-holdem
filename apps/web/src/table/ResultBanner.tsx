import { type HandCategory, REVEAL_WINDOW_MS } from '@holdem/engine'
import { memo } from 'react'
import { useLocale } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { ActionClock } from './ActionClock.tsx'
import { chips } from './format.ts'
import { useLayout } from './Stage.tsx'
import { useHandResult, useTableStore } from './store.ts'

const CATEGORY_KEY: Record<HandCategory, MessageKey> = {
  'straight-flush': 'hand.straightFlush',
  'four-of-a-kind': 'hand.fourOfAKind',
  'full-house': 'hand.fullHouse',
  flush: 'hand.flush',
  straight: 'hand.straight',
  'three-of-a-kind': 'hand.threeOfAKind',
  'two-pair': 'hand.twoPair',
  'one-pair': 'hand.onePair',
  'high-card': 'hand.highCard',
}

export const ResultBanner = memo(function ResultBanner() {
  const { result, seats, viewerSeat, clockSkewMs } = useHandResult()
  const send = useTableStore((state) => state.send)
  const { board } = useLayout()
  const { t } = useLocale()

  if (!result) return null

  const winnerNames = result.winners.map(
    (seat) => seats[seat]?.occupant?.name ?? `Seat ${seat + 1}`,
  )
  const soleWinner = result.winners.length === 1 ? result.winners[0]! : null
  const title =
    soleWinner !== null && soleWinner === viewerSeat
      ? t('result.youWin')
      : soleWinner !== null
        ? t('result.winner', { name: winnerNames[0]! })
        : t('result.splitWinners', { names: winnerNames.join(' · ') })

  const deltas = [...result.deltas].sort((a, b) => a.seat - b.seat)
  const showControls = result.canShow && !result.settled
  const cardHeight = board.cardWidth * 1.5
  const top = board.cy - cardHeight / 2 - 120

  return (
    <div
      className="absolute z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{ left: board.cx, top, width: 520 }}
      role="status"
    >
      <div className="relative w-full overflow-hidden rounded-2xl border border-brass-400/35 bg-black/75 px-5 pb-4 pt-4 text-center shadow-lg backdrop-blur-sm">
        <div className="font-bold leading-tight text-cream" style={{ fontSize: 42 }}>
          {title}
        </div>

        {result.categories.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 text-brass-300" style={{ fontSize: 28 }}>
            {result.categories.map((entry) => {
              const name = seats[entry.seat]?.occupant?.name ?? `Seat ${entry.seat + 1}`
              return (
                <div key={entry.seat}>
                  {result.categories.length > 1 ? `${name} · ` : ''}
                  {t(CATEGORY_KEY[entry.category])}
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-3 flex max-h-48 flex-col gap-1 overflow-y-auto" style={{ fontSize: 26 }}>
          {deltas.map((entry) => {
            const name = seats[entry.seat]?.occupant?.name ?? `Seat ${entry.seat + 1}`
            const positive = entry.delta >= 0
            const amount = chips(Math.abs(entry.delta))
            return (
              <div
                key={entry.seat}
                className="flex items-baseline justify-between gap-4 tabular-nums text-cream/85"
              >
                <span className="truncate text-left">{name}</span>
                <span style={{ color: positive ? 'var(--color-brass-300)' : '#e0563f' }}>
                  {positive ? `+${amount}` : `−${amount}`}
                </span>
              </div>
            )
          })}
        </div>

        {showControls && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => send({ type: 'show' })}
              className="rounded-xl px-3 py-3 font-bold text-cream shadow-md active:scale-[0.98]"
              style={{ background: '#1f6b46', fontSize: 30 }}
            >
              {t('result.show')}
            </button>
            <button
              type="button"
              onClick={() => send({ type: 'muck' })}
              className="rounded-xl px-3 py-3 font-bold text-cream shadow-md active:scale-[0.98]"
              style={{ background: '#7a2f2f', fontSize: 30 }}
            >
              {t('result.muck')}
            </button>
          </div>
        )}

        {showControls && result.revealDeadline !== null && (
          <ActionClock
            deadline={result.revealDeadline}
            totalMs={REVEAL_WINDOW_MS}
            clockSkewMs={clockSkewMs}
          />
        )}
      </div>
    </div>
  )
})
