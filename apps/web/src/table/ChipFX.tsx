import type { GameEvent } from '@holdem/engine'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { positionOfSeat } from './geometry.ts'
import { useLayout } from './Stage.tsx'
import { useTableStore } from './store.ts'

interface Flight {
  id: string
  from: { x: number; y: number }
  to: { x: number; y: number }
  kind: 'to-pot' | 'to-winner'
}

let flightNonce = 0

/**
 * Short chip flights driven by game events: street close sweeps bets into the
 * pot, and pot awards send a stack to the winning seat.
 */
export function ChipFX() {
  const layout = useLayout()
  const events = useTableStore((state) => state.events)
  const viewerSeat = useTableStore((state) => state.view?.viewerSeat ?? null)
  const [flights, setFlights] = useState<Flight[]>([])

  useEffect(() => {
    if (events.length === 0) return

    const next: Flight[] = []
    for (const event of events) {
      const spawned = flightsFor(event, layout, viewerSeat)
      next.push(...spawned)
    }
    if (next.length === 0) return

    setFlights((current) => [...current, ...next])
    const timers = next.map((flight) =>
      window.setTimeout(() => {
        setFlights((current) => current.filter((item) => item.id !== flight.id))
      }, 700),
    )
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [events, layout, viewerSeat])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      <AnimatePresence>
        {flights.map((flight) => (
          <motion.div
            key={flight.id}
            className="absolute rounded-full border-2 border-cream/80 bg-[#c33a2c] shadow"
            style={{ width: 18, height: 18, marginLeft: -9, marginTop: -9 }}
            initial={{ left: flight.from.x, top: flight.from.y, opacity: 0.95, scale: 1 }}
            animate={{ left: flight.to.x, top: flight.to.y, opacity: 0.15, scale: 0.7 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

function flightsFor(
  event: GameEvent,
  layout: ReturnType<typeof useLayout>,
  viewerSeat: number | null,
): Flight[] {
  if (event.type === 'pots-formed') {
    // Sweep bet spots toward the pot when side pots lock in.
    return layout.bets.map((point) => ({
      id: `sweep-${flightNonce++}`,
      from: point,
      to: { x: layout.pot.x, y: layout.pot.y },
      kind: 'to-pot' as const,
    }))
  }

  if (event.type === 'pot-awarded') {
    const position = positionOfSeat(event.seat, viewerSeat)
    const target = layout.seats[position]
    if (!target) return []
    return [
      {
        id: `win-${flightNonce++}`,
        from: { x: layout.pot.x, y: layout.pot.y },
        to: target,
        kind: 'to-winner',
      },
    ]
  }

  if (event.type === 'player-acted' && event.paid > 0) {
    const position = positionOfSeat(event.seat, viewerSeat)
    const from = layout.seats[position]
    const to = layout.bets[position]
    if (!from || !to) return []
    return [
      {
        id: `bet-${flightNonce++}`,
        from,
        to,
        kind: 'to-pot',
      },
    ]
  }

  return []
}
