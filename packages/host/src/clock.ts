/**
 * The host reads the clock and schedules work through this, so a test can run a
 * thousand hands without waiting for a single bot to finish thinking.
 */
export interface HostClock {
  now(): number
  /** Returns a cancel function rather than a handle, so callers keep no ids. */
  schedule(callback: () => void, delayMs: number): () => void
}

export const systemClock: HostClock = {
  now: () => Date.now(),
  schedule(callback, delayMs) {
    const id = setTimeout(callback, Math.max(0, delayMs))
    return () => clearTimeout(id)
  },
}

interface Scheduled {
  at: number
  seq: number
  callback: () => void
  cancelled: boolean
}

/**
 * A clock that only moves when told to. Bot delays and action clocks are minutes
 * of real time across a session, and none of it has to be waited for.
 */
export class ManualClock implements HostClock {
  private current: number
  private seq = 0
  private queue: Scheduled[] = []

  constructor(start = 0) {
    this.current = start
  }

  now(): number {
    return this.current
  }

  schedule(callback: () => void, delayMs: number): () => void {
    this.seq += 1
    const entry: Scheduled = {
      at: this.current + Math.max(0, delayMs),
      seq: this.seq,
      callback,
      cancelled: false,
    }
    this.queue.push(entry)
    return () => {
      entry.cancelled = true
    }
  }

  /** Runs everything due within `ms`, including work those callbacks schedule. */
  advance(ms: number): void {
    const target = this.current + ms
    for (;;) {
      const next = this.earliest(target)
      if (!next) break
      this.queue = this.queue.filter((entry) => entry !== next)
      this.current = Math.max(this.current, next.at)
      next.callback()
    }
    this.current = target
  }

  /** Jumps straight to the next scheduled callback, however far away it is. */
  runNext(): boolean {
    const next = this.earliest(Number.POSITIVE_INFINITY)
    if (!next) return false
    this.queue = this.queue.filter((entry) => entry !== next)
    this.current = Math.max(this.current, next.at)
    next.callback()
    return true
  }

  private earliest(limit: number): Scheduled | null {
    let best: Scheduled | null = null
    for (const entry of this.queue) {
      if (entry.cancelled || entry.at > limit) continue
      if (!best || entry.at < best.at || (entry.at === best.at && entry.seq < best.seq)) {
        best = entry
      }
    }
    return best
  }
}
