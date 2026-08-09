export interface Rng {
  /** Uniformly distributed integer in `[0, maxExclusive)`. */
  nextInt(maxExclusive: number): number
}

/**
 * Rejection sampling over 32-bit words. Taking `value % max` directly would bias
 * the low residues whenever `max` does not divide 2^32.
 */
function unbiasedFrom32(next32: () => number, maxExclusive: number): number {
  if (maxExclusive <= 1) return 0
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive
  let value: number
  do {
    value = next32() >>> 0
  } while (value >= limit)
  return value % maxExclusive
}

/** Cryptographically secure source. Used for every real deal. */
export function cryptoRng(): Rng {
  const buffer = new Uint32Array(64)
  let cursor = buffer.length

  const next32 = () => {
    if (cursor >= buffer.length) {
      crypto.getRandomValues(buffer)
      cursor = 0
    }
    return buffer[cursor++] as number
  }

  return { nextInt: (maxExclusive) => unbiasedFrom32(next32, maxExclusive) }
}

/**
 * Deterministic xoshiro128** source. Only for tests, replays and bot simulations
 * where reproducibility matters more than unpredictability.
 */
export function seededRng(seed: number): Rng {
  let s0 = seed >>> 0 || 0x9e3779b9
  let s1 = (seed ^ 0x85ebca6b) >>> 0 || 0x243f6a88
  let s2 = (seed ^ 0xc2b2ae35) >>> 0 || 0xb7e15162
  let s3 = (seed ^ 0x27d4eb2f) >>> 0 || 0x9e3779b9

  const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0

  const next32 = () => {
    const result = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0) >>> 0
    const t = (s1 << 9) >>> 0
    s2 = (s2 ^ s0) >>> 0
    s3 = (s3 ^ s1) >>> 0
    s1 = (s1 ^ s2) >>> 0
    s0 = (s0 ^ s3) >>> 0
    s2 = (s2 ^ t) >>> 0
    s3 = rotl(s3, 11)
    return result
  }

  for (let i = 0; i < 16; i++) next32()

  return { nextInt: (maxExclusive) => unbiasedFrom32(next32, maxExclusive) }
}

export function shuffleInPlace<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1)
    const tmp = items[i] as T
    items[i] = items[j] as T
    items[j] = tmp
  }
  return items
}
