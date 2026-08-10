import { LANDSCAPE, type Layout, PORTRAIT } from './geometry.ts'

export interface Fitted {
  layout: Layout
  scale: number
}

/**
 * Chooses whichever fixed stage paints larger in the available frame.
 * Exported so phone portrait through iPad Pro sizes can be unit-tested.
 */
export function fitStage(width: number, height: number): Fitted {
  const portrait = Math.min(width / PORTRAIT.width, height / PORTRAIT.height)
  const landscape = Math.min(width / LANDSCAPE.width, height / LANDSCAPE.height)
  return landscape * LANDSCAPE.width > portrait * PORTRAIT.width
    ? { layout: LANDSCAPE, scale: landscape }
    : { layout: PORTRAIT, scale: portrait }
}
