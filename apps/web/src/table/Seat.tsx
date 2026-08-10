import { memo } from 'react'
import { useLocale } from '../i18n/locale.tsx'
import { ActionClock } from './ActionClock.tsx'
import { EMOTE_LABEL_KEY, EMOTE_MARK } from './emotes.tsx'
import { chips, initials } from './format.ts'
import { BUTTON_SIZE, type Layout, positionOfSeat } from './geometry.ts'
import { MadeHandLabel } from './MadeHandLabel.tsx'
import { PlayingCard } from './PlayingCard.tsx'
import { useLayout } from './Stage.tsx'
import { type SeatSlice, useSeatEmote, useSeatSlice, useTableStore } from './store.ts'
import { useHeroMadeHand } from './useMadeHand.ts'

interface SeatProps {
  index: number
  onSit(seat: number): void
}

export const Seat = memo(function Seat({ index, onSit }: SeatProps) {
  const slice = useSeatSlice(index)
  const emote = useSeatEmote(index)
  const layout = useLayout()
  const clockSkewMs = useTableStore((state) => state.clockSkewMs)
  const viewerSeat = useTableStore((state) => state.view?.viewerSeat ?? null)
  const { made, visible: madeVisible } = useHeroMadeHand()
  const { t } = useLocale()

  const position = positionOfSeat(index, viewerSeat)
  const point = layout.seats[position] as { x: number; y: number }
  const box = {
    left: point.x,
    top: point.y,
    width: layout.seatWidth,
    height: layout.seatHeight,
  }
  const seat = slice.seat

  if (!seat?.occupant) {
    return (
      <button
        type="button"
        onClick={() => onSit(index)}
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-dashed border-brass-400/40 bg-black/20 font-medium text-brass-300/70 transition-colors hover:border-brass-400 hover:text-brass-300"
        style={{ ...box, fontSize: 26 }}
      >
        {t('table.sit')}
      </button>
    )
  }

  const folded = slice.player?.status === 'folded'
  const hero = slice.isViewer
  const cardWidth = hero ? layout.heroCardWidth : layout.seatCardWidth
  const holeContributing = made?.holeContributing ?? []
  const showMade = hero && madeVisible && made !== null

  return (
    <>
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ ...box, zIndex: hero ? 10 : undefined }}
      >
        {slice.player && (
          <div
            data-seat-cards={index}
            className="absolute left-1/2 flex -translate-x-1/2"
            style={{
              gap: hero ? 8 : 6,
              bottom: hero ? '100%' : undefined,
              top: hero ? undefined : -layout.seatCardPeek,
              marginBottom: hero ? 12 : undefined,
              zIndex: hero ? undefined : -1,
              opacity: folded ? 0.3 : 1,
            }}
          >
            {([0, 1] as const).map((slot) => {
              const card = slice.player?.holeCards?.[slot] ?? null
              const contributing = showMade && card !== null && holeContributing.includes(card)
              return (
                <PlayingCard
                  key={slot}
                  card={card}
                  width={cardWidth}
                  dealDelayMs={position * 40 + slot * 70}
                  emphasized={contributing}
                  dimmed={Boolean(showMade && card !== null && !contributing)}
                />
              )
            })}
          </div>
        )}

        <div
          data-seat-badge={index}
          className="relative flex h-full items-center rounded-2xl border-2"
          style={{
            gap: 10,
            paddingInline: 10,
            borderColor: slice.isActor ? 'var(--color-brass-300)' : 'rgba(0,0,0,.45)',
            background: hero ? 'rgba(9,52,32,.95)' : 'rgba(0,0,0,.72)',
            opacity: folded ? 0.55 : 1,
            animation: slice.isActor ? 'seat-pulse 1.8s ease-out infinite' : undefined,
          }}
        >
          <div
            className="grid shrink-0 place-items-center rounded-full font-bold"
            style={{
              width: 68,
              height: 68,
              fontSize: 28,
              background:
                seat.controller === 'bot' ? 'var(--color-rail-500)' : 'var(--color-felt-600)',
            }}
          >
            {seat.controller === 'bot' ? 'B' : initials(seat.occupant.name)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate font-medium leading-tight" style={{ fontSize: 26 }}>
              {seat.occupant.name}
            </div>
            <div
              className="font-bold tabular-nums leading-tight text-brass-300"
              style={{ fontSize: 38 }}
            >
              {chips(seat.stack)}
            </div>
          </div>

          <SeatBadge slice={slice} folded={folded} />

          {slice.deadline !== null && (
            <ActionClock
              deadline={slice.deadline}
              totalMs={slice.actionClockMs}
              clockSkewMs={clockSkewMs}
            />
          )}
        </div>

        {emote && (
          <div
            key={emote.nonce}
            role="status"
            className="pointer-events-none absolute -top-4 right-0 flex items-center gap-1.5 rounded-full border border-brass-400/50 bg-cream font-semibold leading-none text-rail-900 shadow-lg"
            style={{
              padding: '8px 14px',
              fontSize: 22,
              animation: 'emote-rise 2.4s ease-out forwards',
            }}
          >
            <span className="text-brass-400" style={{ fontSize: 28 }} aria-hidden>
              {EMOTE_MARK[emote.emote]}
            </span>
            <span>{t(EMOTE_LABEL_KEY[emote.emote])}</span>
          </div>
        )}
      </div>

      {showMade && <MadeHandLabel made={made} box={box} layout={layout} />}

      {slice.isButton && <DealerButton layout={layout} position={position} />}
      {slice.player && slice.player.committed > 0 && (
        <BetChips layout={layout} position={position} amount={slice.player.committed} />
      )}
    </>
  )
})

function SeatBadge({ slice, folded }: { slice: SeatSlice; folded: boolean }) {
  const { t } = useLocale()
  const allIn = slice.player?.status === 'all-in'
  const label = allIn
    ? t('table.allInBadge')
    : folded
      ? t('table.folded')
      : slice.seat?.status === 'sitting-out'
        ? t('table.sittingOut')
        : slice.seat?.connected === false
          ? t('table.away')
          : null
  if (!label) return null

  return (
    <span
      className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full font-bold tracking-wider"
      style={{
        bottom: -24,
        fontSize: 19,
        padding: '2px 10px',
        background: allIn ? '#b8442e' : 'var(--color-rail-700)',
      }}
    >
      {label}
    </span>
  )
}

function DealerButton({ layout, position }: { layout: Layout; position: number }) {
  const point = layout.buttons[position] as { x: number; y: number }
  const { t } = useLocale()
  return (
    <div
      className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-cream font-black text-rail-900 shadow-md"
      style={{
        left: point.x,
        top: point.y,
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        fontSize: 26,
        zIndex: 11,
      }}
      role="img"
      aria-label={t('table.dealer')}
    >
      D
    </div>
  )
}

function BetChips({
  layout,
  position,
  amount,
}: {
  layout: Layout
  position: number
  amount: number
}) {
  const point = layout.bets[position] as { x: number; y: number }
  return (
    <div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center rounded-full bg-black/65 font-bold tabular-nums text-cream shadow"
      style={{ left: point.x, top: point.y, gap: 7, padding: '3px 12px', fontSize: 27 }}
    >
      <span
        className="rounded-full border-2 border-cream/70 bg-[#c33a2c]"
        style={{ width: 16, height: 16 }}
      />
      {chips(amount)}
    </div>
  )
}
