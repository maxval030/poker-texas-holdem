import type { HandCategory, MadeHand } from '@holdem/engine'
import { memo } from 'react'
import { useLocale } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { type Layout, PORTRAIT } from './geometry.ts'

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

const SIDE_GAP = 16
const ABOVE_OFFSET = 72

interface MadeHandLabelProps {
  made: MadeHand
  box: { left: number; top: number; width: number; height: number }
  layout: Layout
}

export const MadeHandLabel = memo(function MadeHandLabel({
  made,
  box,
  layout,
}: MadeHandLabelProps) {
  const { t } = useLocale()
  const narrow = layout === PORTRAIT || layout.width <= PORTRAIT.width
  const style = narrow
    ? {
        left: box.left,
        top: box.top - box.height / 2 - ABOVE_OFFSET,
      }
    : {
        left: box.left + box.width / 2 + SIDE_GAP,
        top: box.top,
      }

  return (
    <div
      className="pointer-events-none absolute z-20 whitespace-nowrap font-bold tracking-wide text-brass-300"
      style={{
        ...style,
        fontSize: 28,
        transform: narrow ? 'translate(-50%, -50%)' : 'translateY(-50%)',
      }}
      role="status"
    >
      {t(CATEGORY_KEY[made.category])}
    </div>
  )
})
