import { type Card, cardToString, rankOf } from '@holdem/engine'
import { cardBackSvgBody } from './back.ts'
import { CARD_VIEW_BOX } from './geometry.ts'
import { isPipCard, pipCardSvgBody } from './pip.ts'

export * from './back.ts'
export * from './geometry.ts'
export * from './pip.ts'
export * from './suits.ts'

/** Court cards live in a sprite loaded once; everything else is drawn in code. */
export function courtSymbolId(card: Card): string | null {
  return isPipCard(card) ? null : `card-${cardToString(card)}`
}

export function isCourtCard(card: Card): boolean {
  const rank = rankOf(card)
  return rank >= 9 && rank <= 11
}

/** Inner markup only, so a caller can place it in an `svg` element it owns. */
export function cardFaceBody(card: Card): string {
  const symbol = courtSymbolId(card)
  return symbol ? `<use href="#${symbol}"/>` : pipCardSvgBody(card)
}

export function cardFaceSvg(card: Card): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CARD_VIEW_BOX}">${cardFaceBody(card)}</svg>`
}

export function cardBackSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CARD_VIEW_BOX}">${cardBackSvgBody()}</svg>`
}

let spritePromise: Promise<void> | null = null

/**
 * Injects the court sprite into the document once. Browsers do not reliably
 * resolve `use` across documents, so the markup has to be inline rather than
 * referenced by URL.
 */
export function ensureCourtSprite(url = '/court-sprite.svg'): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve()
  if (spritePromise) return spritePromise

  spritePromise = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`court sprite request returned ${response.status}`)
      return response.text()
    })
    .then((markup) => {
      if (document.getElementById('holdem-court-sprite')) return
      const holder = document.createElement('div')
      holder.id = 'holdem-court-sprite'
      holder.setAttribute('aria-hidden', 'true')
      // Hidden by size rather than by `display: none`, which stops `use` from
      // resolving the symbols in some browsers.
      holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
      holder.innerHTML = markup
      document.body.prepend(holder)
    })
    .catch((error) => {
      spritePromise = null
      throw error
    })

  return spritePromise
}
