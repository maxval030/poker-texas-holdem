import type { BotDifficulty, TableConfig } from '@holdem/engine'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { SoloSetup } from '../solo/messages.ts'
import { createSoloTransport } from '../solo/transport.ts'
import { useTableStore } from '../table/store.ts'
import { TableScreen } from '../table/TableScreen.tsx'

export const Route = createFileRoute('/play/solo')({
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

const BUY_IN = 5_000

function SoloPage() {
  const [setup, setSetup] = useState<SoloSetup | null>(null)
  return setup ? <SoloTable setup={setup} /> : <SoloLobby onStart={setSetup} />
}

function SoloLobby({ onStart }: { onStart(setup: SoloSetup): void }) {
  const [opponents, setOpponents] = useState(5)
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal')

  const start = () => {
    onStart({
      config: CONFIG,
      player: { userId: 'solo-player', name: 'You' },
      seat: 0,
      buyIn: BUY_IN,
      // Seats fan out from the one either side of the player, so a short table
      // stays spread around the oval instead of bunching up on one edge.
      bots: SEAT_ORDER.slice(0, opponents).map((seat) => ({ seat, difficulty })),
    })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-brass-300">Play against bots</h1>
        <p className="mt-2 text-sm text-cream/70">
          Everything runs on this device. Nothing is sent anywhere.
        </p>
      </header>

      <Field label={`Opponents: ${opponents}`}>
        <input
          type="range"
          min={1}
          max={8}
          step={1}
          value={opponents}
          onChange={(event) => setOpponents(Number(event.target.value))}
          className="h-9 w-full accent-brass-400"
          aria-label="number of opponents"
        />
      </Field>

      <Field label="Difficulty">
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
              {level}
            </button>
          ))}
        </div>
      </Field>

      <button
        type="button"
        onClick={start}
        className="rounded-xl bg-felt-600 px-5 py-4 font-semibold text-cream shadow-md active:scale-[0.99]"
      >
        Sit down with {BUY_IN.toLocaleString()} chips
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
