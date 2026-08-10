const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const plain = new Intl.NumberFormat('en')

/** Stacks are read at a glance from across a phone screen, so past 10k they shorten. */
export function chips(amount: number): string {
  return amount >= 10_000 ? compact.format(amount) : plain.format(amount)
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 2)
  return (
    words
      .map((word) => [...word][0] ?? '')
      .join('')
      .toUpperCase() || '?'
  )
}
