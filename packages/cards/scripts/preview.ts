import { cardToString, DECK_SIZE, parseCard } from '@holdem/engine'
import { CARD_VIEW_BOX, cardBackSvgBody, cardFaceBody } from '../src/index.ts'

/** Renders the deck on one page so the drawn cards can be eyeballed. */
const sprite = await Bun.file(new URL('../generated/court-sprite.svg', import.meta.url)).text()

function figure(label: string, body: string): string {
  return `<figure><svg viewBox="${CARD_VIEW_BOX}">${body}</svg><figcaption>${label}</figcaption></figure>`
}

function page(columns: number, figures: string[], background = '#14532d'): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Deck preview</title>
<style>
  body { margin: 0; padding: 24px; background: ${background}; font: 14px system-ui, sans-serif; color: #fff; }
  .grid { display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 16px; }
  figure { margin: 0; }
  svg { width: 100%; height: auto; display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,.4)); }
  figcaption { text-align: center; padding-top: 6px; opacity: .8; }
</style></head>
<body>${sprite}<div class="grid">${figures.join('')}</div></body></html>`
}

const all: string[] = []
for (let card = 0; card < DECK_SIZE; card++)
  all.push(figure(cardToString(card), cardFaceBody(card)))
all.push(figure('back', cardBackSvgBody()))
const deckPage = page(13, all)

const DEFAULT_DETAIL = 'As,Ac,Ad,Ah,5h,Ts,7c,3d,Kd,Qh,back'

/** `/detail?cards=As,Ac&cols=2` renders a chosen few large enough to inspect. */
function detailPage(params: URLSearchParams): string {
  const names = (params.get('cards') ?? DEFAULT_DETAIL).split(',')
  const columns = Number(params.get('cols') ?? Math.min(names.length, 5))
  return page(
    columns,
    names.map((name) =>
      name === 'back'
        ? figure('back', cardBackSvgBody())
        : figure(name, cardFaceBody(parseCard(name))),
    ),
    params.get('bg') ?? undefined,
  )
}

const port = Number(process.env.PREVIEW_PORT ?? 4321)
Bun.serve({
  port,
  fetch(request) {
    const url = new URL(request.url)
    const body = url.pathname === '/detail' ? detailPage(url.searchParams) : deckPage
    return new Response(body, { headers: { 'content-type': 'text/html' } })
  },
})
console.info(`deck preview on http://localhost:${port} (and /detail)`)
