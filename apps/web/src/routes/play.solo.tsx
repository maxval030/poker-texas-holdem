import type { BotDifficulty, TableConfig } from '@holdem/engine'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { requireGateVerified } from '../gate/requireGate.ts'
import { LanguageSwitch, useLocale } from '../i18n/locale.tsx'
import type { SoloSetup } from '../solo/messages.ts'
import { createSoloTransport } from '../solo/transport.ts'
import { chips } from '../table/format.ts'
import { useTableStore } from '../table/store.ts'
import { TableScreen } from '../table/TableScreen.tsx'

export const Route = createFileRoute('/play/solo')({
  beforeLoad: () => requireGateVerified(),
  component: SoloPage,
  // The whole game runs in a Web Worker, so there is nothing to render on the
  // server and rendering it there would only cost a hydration pass.
  ssr: false,
})

const CONFIG: TableConfig = {
  format: 'cash',
  maxSeats: 9,
  smallBlind: 25,
  bigBlind: 50,
  ante: 0,
  minBuyIn: 2_000,
  maxBuyIn: 10_000,
  actionClockMs: 30_000,
  rebuy: { kind: 'unlimited' },
}

const DEFAULT_BUY_IN = 5_000
const BUY_IN_STEP = 500

function clampBuyIn(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_BUY_IN
  const clamped = Math.min(CONFIG.maxBuyIn, Math.max(CONFIG.minBuyIn, Math.round(raw)))
  const steps = Math.floor((clamped - CONFIG.minBuyIn) / BUY_IN_STEP)
  return CONFIG.minBuyIn + steps * BUY_IN_STEP
}

function SoloPage() {
  const [setup, setSetup] = useState<SoloSetup | null>(null)
  return setup ? <SoloTable setup={setup} /> : <SoloLobby onStart={setSetup} />
}

function SoloLobby({ onStart }: { onStart(setup: SoloSetup): void }) {
  const { t } = useLocale()
  const [opponents, setOpponents] = useState(5)
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal')
  const [buyIn, setBuyIn] = useState(DEFAULT_BUY_IN)
  const [buyInText, setBuyInText] = useState(String(DEFAULT_BUY_IN))

  const applyBuyIn = (next: number) => {
    const value = clampBuyIn(next)
    setBuyIn(value)
    setBuyInText(String(value))
  }

  const start = () => {
    const finalBuyIn = clampBuyIn(buyIn)
    onStart({
      config: CONFIG,
      player: { userId: 'solo-player', name: 'You' },
      seat: 0,
      buyIn: finalBuyIn,
      // Seats fan out from the one either side of the player, so a short table
      // stays spread around the oval instead of bunching up on one edge.
      bots: SEAT_ORDER.slice(0, opponents).map((seat) => ({ seat, difficulty })),
    })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div className="flex justify-end">
        <LanguageSwitch />
      </div>
      <header className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-brass-300">{t('home.solo')}</h1>
        <p className="mt-2 text-sm text-cream/70">{t('solo.subtitle')}</p>
      </header>

      <Field label={t('solo.opponents', { n: opponents })}>
        <input
          type="range"
          min={1}
          max={8}
          step={1}
          value={opponents}
          onChange={(event) => setOpponents(Number(event.target.value))}
          className="h-9 w-full accent-brass-400"
          aria-label={t('solo.opponents', { n: opponents })}
        />
      </Field>

      <Field label={t('solo.difficulty')}>
        <div className="grid grid-cols-3 gap-2">
          {(['easy', 'normal', 'hard'] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setDifficulty(level)}
              className="rounded-lg border py-3 text-sm font-semibold capitalize transition-colors"
              style={{
                borderColor:
                  difficulty === level ? 'var(--color-brass-300)' : 'rgba(232,205,148,.25)',
                background: difficulty === level ? 'rgba(232,205,148,.16)' : 'transparent',
                color: difficulty === level ? 'var(--color-brass-300)' : 'rgba(244,236,216,.7)',
              }}
            >
              {t(`solo.diff.${level}`)}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label={t('solo.buyIn', {
          min: chips(CONFIG.minBuyIn),
          max: chips(CONFIG.maxBuyIn),
        })}
      >
        <input
          type="range"
          min={CONFIG.minBuyIn}
          max={CONFIG.maxBuyIn}
          step={BUY_IN_STEP}
          value={buyIn}
          onChange={(event) => applyBuyIn(Number(event.target.value))}
          className="h-9 w-full accent-brass-400"
          aria-label={t('solo.buyInAmount')}
        />
        <input
          type="number"
          min={CONFIG.minBuyIn}
          max={CONFIG.maxBuyIn}
          step={BUY_IN_STEP}
          value={buyInText}
          onChange={(event) => {
            const raw = event.target.value
            setBuyInText(raw)
            const parsed = Number(raw)
            if (Number.isFinite(parsed)) setBuyIn(clampBuyIn(parsed))
          }}
          onBlur={() => applyBuyIn(Number(buyInText))}
          className="mt-2 w-full rounded-lg border border-brass-400/30 bg-black/30 px-3 py-3 text-sm tabular-nums text-cream outline-none focus:border-brass-300"
          aria-label={t('solo.buyInAmount')}
        />
      </Field>

      <button
        type="button"
        onClick={start}
        className="rounded-xl bg-felt-600 px-5 py-4 font-semibold text-cream shadow-md active:scale-[0.99]"
      >
        {t('solo.start', { amount: chips(buyIn) })}
      </button>
    </main>
  )
}

/** Alternating right and left of the player, so five bots still ring the table. */
const SEAT_ORDER = [1, 8, 2, 7, 3, 6, 4, 5]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-cream/80">{label}</legend>
      {children}
    </fieldset>
  )
}

function SoloTable({ setup }: { setup: SoloSetup }) {
  // The worker is spawned in the effect rather than during render, so a double
  // mount gets a second worker instead of a terminated first one.
  useEffect(() => {
    const transport = createSoloTransport(setup)
    const detach = useTableStore.getState().attach(transport)
    return () => {
      detach()
      transport.close()
    }
  }, [setup])

  return <TableScreen title="Single player" />
}
