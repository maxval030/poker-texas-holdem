import { memo } from 'react'
import { useLayout } from './Stage.tsx'

/**
 * One SVG for the whole table surface. Drawing the rail and felt as vector keeps
 * it crisp at every scale the stage can be shown at, and costs one element.
 */
export const Felt = memo(function Felt() {
  const { width, height, felt, railWidth } = useLayout()

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <title>Poker table</title>
      <ellipse
        cx={felt.cx}
        cy={felt.cy + 12}
        rx={felt.rx + railWidth + 6}
        ry={felt.ry + railWidth + 6}
        fill="rgba(0,0,0,.35)"
      />
      <ellipse
        cx={felt.cx}
        cy={felt.cy}
        rx={felt.rx + railWidth}
        ry={felt.ry + railWidth}
        fill="var(--color-rail-700)"
        stroke="var(--color-rail-900)"
        strokeWidth={3}
      />
      <ellipse
        cx={felt.cx}
        cy={felt.cy}
        rx={felt.rx}
        ry={felt.ry}
        fill="var(--color-felt-700)"
        stroke="var(--color-brass-400)"
        strokeWidth={3}
      />
      <ellipse
        cx={felt.cx}
        cy={felt.cy}
        rx={felt.rx - 16}
        ry={felt.ry - 16}
        fill="none"
        stroke="rgba(232,205,148,.22)"
        strokeWidth={2}
      />
    </svg>
  )
})
