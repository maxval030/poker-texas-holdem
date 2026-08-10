import { type HandCategory, parseCards } from '@holdem/engine'
import { useEffect } from 'react'
import { useLocale } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { PlayingCard } from './PlayingCard.tsx'

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

const CHART: { category: HandCategory; example: string }[] = [
  { category: 'straight-flush', example: 'As Ks Qs Js Ts' },
  { category: 'four-of-a-kind', example: 'Ac Ad Ah As Kc' },
  { category: 'full-house', example: 'Ac Ad Ah Kc Kd' },
  { category: 'flush', example: 'As Js 9s 6s 2s' },
  { category: 'straight', example: 'Ac Kd Qh Js Tc' },
  { category: 'three-of-a-kind', example: 'Ac Ad Ah Kc Qd' },
  { category: 'two-pair', example: 'Ac Ad Kc Kd Qh' },
  { category: 'one-pair', example: 'Ac Ad Kc Qd Jh' },
  { category: 'high-card', example: 'Ac Kd Qh Js 9d' },
]

const CARD_WIDTH = 36

interface HandChartProps {
  onClose: () => void
}

export function HandChart({ onClose }: HandChartProps) {
  const { t } = useLocale()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-label={t('assist.close')}
      />
      <div
        className="relative max-h-[min(90dvh,720px)] w-full max-w-md overflow-y-auto rounded-2xl border border-brass-400/35 bg-[#1a120c] p-4 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hand-chart-title"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="hand-chart-title" className="text-sm font-semibold tracking-wide text-brass-300">
            {t('assist.handChart')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs tracking-wide text-cream/70"
          >
            {t('assist.close')}
          </button>
        </div>
        <ul className="flex flex-col gap-2">
          {CHART.map(({ category, example }) => {
            const cards = parseCards(example)
            return (
              <li key={category} className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-sm text-cream/90">{t(CATEGORY_KEY[category])}</span>
                <div className="flex shrink-0 gap-0.5">
                  {cards.map((card) => (
                    <PlayingCard key={`${category}-${card}`} card={card} width={CARD_WIDTH} />
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
