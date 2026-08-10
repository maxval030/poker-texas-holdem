import { type Card, type MadeHand, madeHand } from '@holdem/engine'
import { useShallow } from 'zustand/react/shallow'
import { useMadeHandAssist } from './madeHandAssist.tsx'
import { useTableStore } from './store.ts'

export function resolveHeroMadeHand(input: {
  assistEnabled: boolean
  hole: readonly Card[] | null | undefined
  board: readonly Card[]
  folded: boolean
  complete: boolean
}): { made: MadeHand | null; visible: boolean } {
  const hole = input.hole
  const made = hole && hole.length === 2 ? madeHand(hole, input.board) : null
  const holeVisible = hole !== null && hole !== undefined && hole.length === 2
  const visible =
    input.assistEnabled && made !== null && !input.folded && !input.complete && holeVisible
  return { made, visible }
}

export function useHeroMadeHand(): {
  made: MadeHand | null
  visible: boolean
} {
  const { enabled } = useMadeHandAssist()
  const snapshot = useTableStore(
    useShallow((state) => {
      const view = state.view
      const hand = view?.hand
      const viewerSeat = view?.viewerSeat ?? null
      const player =
        viewerSeat === null
          ? null
          : (hand?.players.find((entry) => entry.seat === viewerSeat) ?? null)
      return {
        hole: player?.holeCards ?? null,
        board: hand?.board ?? [],
        folded: player?.status === 'folded',
        complete: hand?.complete ?? false,
      }
    }),
  )

  return resolveHeroMadeHand({
    assistEnabled: enabled,
    hole: snapshot.hole,
    board: snapshot.board,
    folded: snapshot.folded,
    complete: snapshot.complete,
  })
}
