import { describe, expect, test } from 'bun:test'
import { cardToString, DECK_SIZE, parseCard, rankOf } from '@holdem/engine'
import {
  CARD_HEIGHT,
  CARD_VIEW_BOX,
  CARD_WIDTH,
  cardBackSvg,
  cardBackSvgBody,
  cardFaceBody,
  cardFaceSvg,
  courtSymbolId,
} from '../src/index.ts'

const sprite = await Bun.file(
  new URL('../generated/court-sprite.svg', import.meta.url).pathname,
).text()

function countGlyphs(markup: string): number {
  return markup.split('<g transform="translate(').length - 1
}

describe('generated faces', () => {
  test('every card renders on the shared frame', () => {
    for (let card = 0; card < DECK_SIZE; card++) {
      const svg = cardFaceSvg(card)
      expect(svg).toContain(`viewBox="${CARD_VIEW_BOX}"`)
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg.endsWith('</svg>')).toBe(true)
    }
  })

  test('a pip card carries as many suit glyphs as its rank, plus two corners', () => {
    const expected: Record<string, number> = {
      '2': 2,
      '3': 3,
      '4': 4,
      '5': 5,
      '6': 6,
      '7': 7,
      '8': 8,
      '9': 9,
      T: 10,
      A: 1,
    }
    for (const [rank, pips] of Object.entries(expected)) {
      for (const suit of ['c', 'd', 'h', 's']) {
        const card = parseCard(`${rank}${suit}`)
        expect(countGlyphs(cardFaceBody(card))).toBe(pips + 2)
      }
    }
  })

  test('turns the lower half of the pips over, the way a real card reads either way up', () => {
    const body = cardFaceBody(parseCard('Ts'))
    expect(body.split('rotate(180) scale(').length - 1).toBeGreaterThanOrEqual(6)
  })

  test('names the rank in both corners', () => {
    const body = cardFaceBody(parseCard('9h'))
    expect(body.split('>9</text>').length - 1).toBe(2)
  })

  test('colours hearts and diamonds red, clubs and spades black', () => {
    expect(cardFaceBody(parseCard('7h'))).toContain('#d40000')
    expect(cardFaceBody(parseCard('7d'))).toContain('#d40000')
    expect(cardFaceBody(parseCard('7c'))).not.toContain('#d40000')
    expect(cardFaceBody(parseCard('7s'))).not.toContain('#d40000')
  })
})

describe('court cards', () => {
  test('are referenced from the sprite rather than drawn', () => {
    for (const rank of ['J', 'Q', 'K']) {
      for (const suit of ['c', 'd', 'h', 's']) {
        const card = parseCard(`${rank}${suit}`)
        expect(courtSymbolId(card)).toBe(`card-${rank}${suit}`)
        expect(cardFaceBody(card)).toBe(`<use href="#card-${rank}${suit}"/>`)
      }
    }
  })

  test('pip cards are never routed to the sprite', () => {
    for (let card = 0; card < DECK_SIZE; card++) {
      const rank = rankOf(card)
      const isCourt = rank >= 9 && rank <= 11
      expect(courtSymbolId(card) === null).toBe(!isCourt)
    }
  })
})

describe('the court sprite', () => {
  test('holds all twelve symbols', () => {
    for (const rank of ['J', 'Q', 'K']) {
      for (const suit of ['c', 'd', 'h', 's']) {
        expect(sprite).toContain(`id="card-${rank}${suit}"`)
      }
    }
    expect(sprite.split('<symbol ').length - 1).toBe(12)
  })

  test('draws every symbol on the same frame as the generated cards', () => {
    const viewBoxes = [...sprite.matchAll(/<symbol id="card-[^"]+" viewBox="([^"]+)"/g)].map(
      (match) => match[1],
    )
    expect(viewBoxes).toHaveLength(12)
    expect(new Set(viewBoxes)).toEqual(new Set([CARD_VIEW_BOX]))
  })

  test('credits the source, which the CC0 licence does not require but courtesy does', () => {
    expect(sprite).toContain('Dmitry Fomin')
    expect(sprite.toLowerCase()).toContain('cc0')
  })

  test('namespaces internal ids so twelve drawings can share one document', () => {
    const ids = [...sprite.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1] as string)
    const nonSymbol = ids.filter((id) => !id.startsWith('card-'))
    expect(new Set(nonSymbol).size).toBe(nonSymbol.length)
  })
})

describe('the back', () => {
  test('shares the frame the faces use, so a flip never changes shape', () => {
    expect(cardBackSvg()).toContain(`viewBox="${CARD_VIEW_BOX}"`)
  })

  test('needs no ids, so any number of backs can sit in one document', () => {
    expect(cardBackSvg()).not.toContain('id=')
    expect(cardBackSvg()).not.toContain('url(#')
  })

  test('is drawn in the green and dark red of the reference deck', () => {
    const svg = cardBackSvg()
    expect(svg).toContain('#0b5132')
    expect(svg).toContain('#8c1c2b')
  })

  test('keeps the plaid inside the card, since nothing clips it at render time', () => {
    const points = [...cardBackSvgBody().matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)]
    expect(points.length).toBeGreaterThan(100)
    for (const [, x, y] of points) {
      expect(Number(x)).toBeGreaterThanOrEqual(0)
      expect(Number(x)).toBeLessThanOrEqual(CARD_WIDTH)
      expect(Number(y)).toBeGreaterThanOrEqual(0)
      expect(Number(y)).toBeLessThanOrEqual(CARD_HEIGHT)
    }
  })
})

describe('deck coverage', () => {
  test('all fifty two cards produce distinct markup', () => {
    const seen = new Set<string>()
    for (let card = 0; card < DECK_SIZE; card++) seen.add(cardFaceBody(card))
    expect(seen.size).toBe(DECK_SIZE)
  })

  test('card names round trip through the engine encoding', () => {
    for (let card = 0; card < DECK_SIZE; card++) {
      expect(parseCard(cardToString(card))).toBe(card)
    }
  })
})
