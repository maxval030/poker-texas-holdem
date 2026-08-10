import type { LegalActions, PlayerAction } from '@holdem/engine'
import { useEffect, useState } from 'react'
import { useLocale } from '../i18n/locale.tsx'
import { chips } from './format.ts'
import { useTableStore } from './store.ts'

/**
 * Sits outside the scaled stage and hugs the bottom edge, so the buttons keep
 * their real size on a phone no matter how small the table has been scaled and
 * stay clear of the home indicator.
 */
export function ActionBar() {
  const legal = useTableStore((state) => state.self?.legal ?? null)
  const send = useTableStore((state) => state.send)

  return (
    <div
      className="shrink-0 border-t border-black/40 bg-black/45 px-3 pt-3 backdrop-blur"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {legal ? (
        <Controls legal={legal} onAct={(action) => send({ type: 'act', action })} />
      ) : (
        <Waiting />
      )}
    </div>
  )
}

function Waiting() {
  const status = useTableStore((state) => state.status)
  const actorSeat = useTableStore((state) => state.view?.hand?.actorSeat ?? null)
  const { t } = useLocale()
  const message =
    status !== 'open'
      ? t('table.connecting')
      : actorSeat === null
        ? t('table.waitHand')
        : t('table.waitTurn')
  return <div className="grid h-14 place-items-center text-sm text-cream/60">{message}</div>
}

function Controls({ legal, onAct }: { legal: LegalActions; onAct(action: PlayerAction): void }) {
  const potTotal = useTableStore((state) => state.view?.hand?.potTotal ?? 0)
  const { t } = useLocale()
  const raise = legal.raise
  const [amount, setAmount] = useState(raise?.min ?? 0)
  const [sliderOpen, setSliderOpen] = useState(false)

  useEffect(() => {
    setAmount(raise?.min ?? 0)
    setSliderOpen(false)
  }, [raise?.min])

  const callLabel = legal.call
    ? legal.call.allIn
      ? t('table.callAllIn', { amount: chips(legal.call.amount) })
      : t('table.call', { amount: chips(legal.call.amount) })
    : null

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      {sliderOpen && raise && (
        <RaiseSlider
          min={raise.min}
          max={raise.max}
          potTotal={potTotal}
          amount={amount}
          onChange={setAmount}
        />
      )}

      <div className="grid grid-cols-3 gap-2">
        <ActionButton tone="fold" disabled={!legal.canFold} onClick={() => onAct({ type: 'fold' })}>
          {t('table.fold')}
        </ActionButton>

        {legal.canCheck ? (
          <ActionButton tone="call" onClick={() => onAct({ type: 'check' })}>
            {t('table.check')}
          </ActionButton>
        ) : (
          <ActionButton tone="call" disabled={!legal.call} onClick={() => onAct({ type: 'call' })}>
            {callLabel ?? t('table.call', { amount: '' }).trim()}
          </ActionButton>
        )}

        {raise ? (
          <ActionButton
            tone="raise"
            onClick={() => {
              if (!sliderOpen && raise.min < raise.max) {
                setSliderOpen(true)
                return
              }
              onAct({ type: raise.isOpeningBet ? 'bet' : 'raise', to: amount })
            }}
          >
            {sliderOpen || raise.min === raise.max
              ? t('table.raiseTo', {
                  kind: raise.isOpeningBet ? t('table.bet') : t('table.raise'),
                  amount: chips(amount),
                })
              : raise.isOpeningBet
                ? t('table.bet')
                : t('table.raise')}
          </ActionButton>
        ) : (
          <ActionButton tone="raise" disabled>
            {t('table.raise')}
          </ActionButton>
        )}
      </div>
    </div>
  )
}

function RaiseSlider({
  min,
  max,
  potTotal,
  amount,
  onChange,
}: {
  min: number
  max: number
  potTotal: number
  amount: number
  onChange(value: number): void
}) {
  const { t } = useLocale()
  const presets: { label: string; value: number }[] = [
    { label: t('table.halfPot'), value: Math.round(potTotal / 2) },
    { label: t('table.potPreset'), value: potTotal },
    { label: t('table.allIn'), value: max },
  ]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {presets.map((preset) => {
          const value = Math.min(max, Math.max(min, preset.value))
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange(value)}
              className="flex-1 rounded-lg border border-brass-400/40 py-2 text-xs font-semibold text-brass-300 active:bg-brass-400/20"
            >
              {preset.label}
            </button>
          )
        })}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={amount}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 w-full accent-brass-400"
        aria-label="raise amount"
      />
    </div>
  )
}

const TONES = {
  fold: '#7a2f2f',
  call: '#1f6b46',
  raise: '#a8792c',
} as const

function ActionButton({
  tone,
  disabled,
  onClick,
  children,
}: {
  tone: keyof typeof TONES
  disabled?: boolean
  onClick?(): void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-14 rounded-xl px-2 text-sm font-bold text-cream shadow-md transition-transform disabled:opacity-35 active:scale-[0.98]"
      style={{ background: TONES[tone] }}
    >
      {children}
    </button>
  )
}
