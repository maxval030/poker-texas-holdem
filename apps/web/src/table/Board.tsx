import { AnimatePresence } from 'motion/react'
import { memo } from 'react'
import { useLocale } from '../i18n/locale.tsx'
import { chips } from './format.ts'
import { PlayingCard } from './PlayingCard.tsx'
import { useLayout } from './Stage.tsx'
import { useBoard } from './store.ts'
import { useHeroMadeHand } from './useMadeHand.ts'

const BOARD_SLOTS = ['flop-1', 'flop-2', 'flop-3', 'turn', 'river'] as const

export const Board = memo(function Board() {
  const { cards, potTotal } = useBoard()
  const { board, pot } = useLayout()
  const { t } = useLocale()
  const { made, visible: madeVisible } = useHeroMadeHand()
  const boardContributing = made?.boardContributing ?? []
  const width = BOARD_SLOTS.length * board.cardWidth + (BOARD_SLOTS.length - 1) * board.gap

  return (
    <>
      {potTotal > 0 && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/55 font-bold tabular-nums text-brass-300 shadow"
          style={{ left: pot.x, top: pot.y, padding: '5px 20px', fontSize: 34 }}
        >
          {t('table.pot', { amount: chips(potTotal) })}
        </div>
      )}

      <div
        className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center"
        style={{ left: board.cx, top: board.cy, width, gap: board.gap }}
      >
        {BOARD_SLOTS.map((name, slot) => {
          const card = cards[slot]
          return card === undefined ? (
            <div
              key={name}
              className="rounded-lg border-2 border-dashed border-white/15 bg-black/10"
              style={{ width: board.cardWidth, height: board.cardWidth * 1.5 }}
            />
          ) : (
            <AnimatePresence key={`${name}-${card}`}>
              <PlayingCard
                card={card}
                width={board.cardWidth}
                dealDelayMs={slot * 90}
                dealFromCenter
                emphasized={madeVisible && boardContributing.includes(card)}
                dimmed={madeVisible && !boardContributing.includes(card)}
              />
            </AnimatePresence>
          )
        })}
      </div>
    </>
  )
})
