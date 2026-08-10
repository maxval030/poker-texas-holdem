import { memo } from 'react'

interface ActionClockProps {
  /** Server wall clock at which the action expires. */
  deadline: number
  totalMs: number
  clockSkewMs: number
}

/**
 * Runs entirely in CSS. The remaining time only decides where the animation
 * starts, through a negative delay, so React renders this once per turn instead
 * of once per second and the bar keeps ticking during a heavy re-render.
 */
export const ActionClock = memo(function ActionClock({
  deadline,
  totalMs,
  clockSkewMs,
}: ActionClockProps) {
  const remaining = deadline - (Date.now() + clockSkewMs)
  if (remaining <= 0) return null

  const elapsed = Math.max(0, totalMs - remaining)
  const urgent = remaining < 5_000

  return (
    <div className="absolute inset-x-2 bottom-1 h-1.5 overflow-hidden rounded-full bg-black/45">
      <div
        // Keyed on the deadline so a new turn restarts the animation rather than
        // resuming the previous one.
        key={deadline}
        className="motion-essential h-full origin-left rounded-full"
        style={{
          background: urgent ? '#e0563f' : 'var(--color-brass-400)',
          animation: `clock-drain ${totalMs}ms linear ${-elapsed}ms forwards`,
        }}
      />
    </div>
  )
})
