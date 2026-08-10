import { CARD_ASPECT, CARD_VIEW_BOX, cardBackSvgBody, cardFaceBody } from '@holdem/cards'
import { type Card, rankOf, suitOf } from '@holdem/engine'
import { motion, useReducedMotion } from 'motion/react'
import { memo } from 'react'

const RANK_NAMES = [
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'jack',
  'queen',
  'king',
  'ace',
] as const
const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'] as const

function describe(card: Card | null): string {
  if (card === null) return 'face down card'
  return `${RANK_NAMES[rankOf(card)]} of ${SUIT_NAMES[suitOf(card)]}`
}

const bodies = new Map<number, string>()

function bodyFor(card: Card | null): string {
  const key = card ?? -1
  let body = bodies.get(key)
  if (body === undefined) {
    body = card === null ? cardBackSvgBody() : cardFaceBody(card)
    bodies.set(key, body)
  }
  return body
}

interface PlayingCardProps {
  /** `null` renders the back. */
  card: Card | null
  width: number
  className?: string
  dimmed?: boolean
  /** Staggers deal / flip when several cards arrive together. */
  dealDelayMs?: number
  /** When true, the card flies in from the board centre before settling. */
  dealFromCenter?: boolean
}

export const PlayingCard = memo(function PlayingCard({
  card,
  width,
  className,
  dimmed,
  dealDelayMs = 0,
  dealFromCenter = false,
}: PlayingCardProps) {
  const reduceMotion = useReducedMotion()
  const height = width / CARD_ASPECT
  const faceUp = card !== null

  return (
    <motion.div
      className={className}
      style={{
        width,
        height,
        perspective: 800,
        filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.45))',
        opacity: dimmed ? 0.45 : 1,
      }}
      initial={
        reduceMotion
          ? false
          : {
              opacity: 0,
              scale: 0.85,
              y: dealFromCenter ? -40 : -18,
              x: dealFromCenter ? 0 : 0,
            }
      }
      animate={{ opacity: dimmed ? 0.45 : 1, scale: 1, y: 0, x: 0 }}
      transition={{
        duration: 0.32,
        delay: dealDelayMs / 1000,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d' }}
        initial={false}
        animate={{ rotateY: faceUp ? 180 : 0 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.42, delay: dealDelayMs / 1000, ease: [0.22, 1, 0.36, 1] }
        }
      >
        <CardFace card={null} width={width} height={height} back />
        <CardFace card={card} width={width} height={height} />
      </motion.div>
    </motion.div>
  )
})

function CardFace({
  card,
  width,
  height,
  back,
}: {
  card: Card | null
  width: number
  height: number
  back?: boolean
}) {
  return (
    <svg
      viewBox={CARD_VIEW_BOX}
      width={width}
      height={height}
      className="absolute inset-0 block"
      style={{
        backfaceVisibility: 'hidden',
        transform: back ? 'rotateY(0deg)' : 'rotateY(180deg)',
      }}
      role="img"
      aria-label={back ? 'face down card' : describe(card)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: generated SVG from a closed card set
      dangerouslySetInnerHTML={{ __html: bodyFor(back ? null : card) }}
    />
  )
}
