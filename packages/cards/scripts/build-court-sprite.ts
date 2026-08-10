import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cardToString, makeCard, RANK_CHARS, SUIT_CHARS } from '@holdem/engine'
import { optimize } from 'svgo'
import { CARD_VIEW_BOX } from '../src/geometry.ts'

/**
 * Court cards are the one part of the deck not generated in code. They are the
 * CC0 English pattern deck by Dmitry Fomin, taken as individual files that
 * Wikimedia already publishes, so nothing has to be sliced out of a sheet.
 */

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_SVG = join(PACKAGE_ROOT, 'generated', 'court-sprite.svg')
const OUTPUT_META = join(PACKAGE_ROOT, 'generated', 'court-sprite.ts')
const WEB_PUBLIC = join(PACKAGE_ROOT, '..', '..', 'apps', 'web', 'public', 'court-sprite.svg')
const CACHE_DIR = join(PACKAGE_ROOT, 'assets', 'downloaded')

const COURT_RANKS = [
  { index: 9, name: 'jack' },
  { index: 10, name: 'queen' },
  { index: 11, name: 'king' },
] as const

const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'] as const

const API = 'https://commons.wikimedia.org/w/api.php'
const FILE_PATH = 'https://commons.wikimedia.org/wiki/Special:FilePath'
const USER_AGENT =
  'holdem-cards-build/0.1 (https://github.com/overtakemadaka/texas-holdem; card asset pipeline) bun/1.3'

interface SourceFile {
  card: number
  title: string
  url: string
  license: string
  artist: string
}

async function resolveUrls(titles: string[]): Promise<Map<string, Omit<SourceFile, 'card'>>> {
  const params = new URLSearchParams({
    action: 'query',
    titles: titles.map((t) => `File:${t}`).join('|'),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    format: 'json',
  })
  const response = await fetch(`${API}?${params}`, { headers: { 'user-agent': USER_AGENT } })
  if (!response.ok) throw new Error(`Commons API returned ${response.status}`)
  const payload = (await response.json()) as {
    query: {
      pages: Record<
        string,
        {
          title: string
          missing?: string
          imageinfo?: { url: string; extmetadata?: Record<string, { value: string }> }[]
        }
      >
    }
  }

  const found = new Map<string, Omit<SourceFile, 'card'>>()
  for (const page of Object.values(payload.query.pages)) {
    if (page.missing !== undefined || !page.imageinfo?.[0]) {
      throw new Error(`Commons has no file named ${page.title}`)
    }
    const info = page.imageinfo[0]
    const title = page.title.replace(/^File:/, '')
    found.set(title, {
      title,
      url: info.url,
      license: info.extmetadata?.LicenseShortName?.value ?? 'unknown',
      artist: stripTags(info.extmetadata?.Artist?.value ?? 'unknown'),
    })
  }
  return found
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The source frame has to be read before optimisation strips the attributes. */
function sourceViewBox(rawSvg: string, cardName: string): string {
  const header = rawSvg.slice(0, rawSvg.indexOf('>', rawSvg.indexOf('<svg')) + 1)
  const declared = /viewBox="([^"]+)"/.exec(header)?.[1]
  if (declared) return declared.trim().replace(/\s+/g, ' ')
  const width = /width="([\d.]+)"/.exec(header)?.[1]
  const height = /height="([\d.]+)"/.exec(header)?.[1]
  if (!width || !height) throw new Error(`${cardName} declares neither a viewBox nor a size`)
  return `0 0 ${Number(width)} ${Number(height)}`
}

/** Keeps only the drawing, and namespaces every internal id to the card. */
function toSymbol(rawSvg: string, cardName: string): string {
  const viewBox = sourceViewBox(rawSvg, cardName)
  if (viewBox !== CARD_VIEW_BOX) {
    throw new Error(
      `${cardName} is drawn on ${viewBox} but the deck uses ${CARD_VIEW_BOX}; the shared frame is what keeps a flip from changing shape`,
    )
  }

  const { data } = optimize(rawSvg, {
    multipass: true,
    floatPrecision: 1,
    plugins: ['preset-default', { name: 'prefixIds', params: { prefix: `c${cardName}` } }],
  })

  const opened = data.indexOf('>', data.indexOf('<svg'))
  const closed = data.lastIndexOf('</svg>')
  if (opened < 0 || closed < 0) throw new Error(`could not read the optimised svg for ${cardName}`)

  return `<symbol id="card-${cardName}" viewBox="${CARD_VIEW_BOX}">${data.slice(opened + 1, closed)}</symbol>`
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Downloads go through Special:FilePath rather than the direct upload host URL
 * the API hands back. That URL carries tracking parameters and is rate limited
 * hard enough to refuse the fifth file of twelve for minutes at a time.
 *
 * Sources are still cached on disk so an interrupted run resumes where it
 * stopped rather than fetching the whole set again.
 */
async function fetchSource(url: string, label: string): Promise<string> {
  const cached = Bun.file(join(CACHE_DIR, label))
  if (await cached.exists()) {
    const text = await cached.text()
    if (text.includes('<svg')) return text
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
    if (response.ok) {
      const text = await response.text()
      await mkdir(CACHE_DIR, { recursive: true })
      await writeFile(join(CACHE_DIR, label), text, 'utf8')
      return text
    }
    if (response.status !== 429 && response.status !== 503) {
      throw new Error(`downloading ${label} returned ${response.status}`)
    }
    const retryAfter = Number(response.headers.get('retry-after') ?? 0)
    const wait = Math.max(retryAfter * 1000, 2_000 * (attempt + 1))
    console.info(`  ${label}: ${response.status}, waiting ${(wait / 1000).toFixed(0)} s`)
    await sleep(wait)
  }
  throw new Error(`gave up downloading ${label}; rerun to continue from the cache`)
}

async function main(): Promise<void> {
  const wanted: { card: number; title: string }[] = []
  for (const rank of COURT_RANKS) {
    for (let suit = 0; suit < SUIT_NAMES.length; suit++) {
      wanted.push({
        card: makeCard(rank.index, suit),
        title: `English pattern ${rank.name} of ${SUIT_NAMES[suit]}.svg`,
      })
    }
  }

  console.info(`resolving ${wanted.length} court cards on Wikimedia Commons`)
  const resolved = await resolveUrls(wanted.map((w) => w.title))

  const symbols: string[] = []
  const licenses = new Set<string>()
  const artists = new Set<string>()
  let downloaded = 0

  for (const { card, title } of wanted) {
    const source = resolved.get(title)
    if (!source) throw new Error(`Commons did not return ${title}`)
    if (!source.license.toLowerCase().startsWith('cc0')) {
      throw new Error(`${title} is licensed ${source.license}, and only CC0 is acceptable here`)
    }
    licenses.add(source.license)
    artists.add(source.artist)

    const raw = await fetchSource(`${FILE_PATH}/${encodeURIComponent(title)}`, title)
    downloaded += raw.length

    symbols.push(toSymbol(raw, cardToString(card)))
    console.info(`  ${cardToString(card).padEnd(3)} ${(raw.length / 1024).toFixed(0)} KiB`)
  }

  const attribution = `English pattern playing cards by ${[...artists].join(', ')}, ${[...licenses].join(', ')}`
  const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true"><!-- ${attribution} -->${symbols.join('')}</svg>`

  const ids = wanted
    .map(({ card }) => `  '${cardToString(card)}': 'card-${cardToString(card)}',`)
    .join('\n')

  const meta = `// Generated by scripts/build-court-sprite.ts. Do not edit.
// ${attribution}

export const COURT_SPRITE_BYTES = ${sprite.length}

export const COURT_SYMBOL_IDS: Record<string, string> = {
${ids}
}

export const COURT_ATTRIBUTION = ${JSON.stringify(attribution)}
`

  await mkdir(dirname(OUTPUT_SVG), { recursive: true })
  await writeFile(OUTPUT_SVG, sprite, 'utf8')
  await writeFile(OUTPUT_META, meta, 'utf8')
  await mkdir(dirname(WEB_PUBLIC), { recursive: true })
  await writeFile(WEB_PUBLIC, sprite, 'utf8')

  const compressed = Bun.gzipSync(new TextEncoder().encode(sprite)).length
  console.info(
    `\n${symbols.length} symbols: ${(downloaded / 1024).toFixed(0)} KiB downloaded, ${(sprite.length / 1024).toFixed(0)} KiB written, ${(compressed / 1024).toFixed(0)} KiB gzipped`,
  )
  console.info(`${RANK_CHARS.length} ranks and ${SUIT_CHARS.length} suits in the deck encoding`)
}

await main()
