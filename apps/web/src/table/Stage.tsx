import { createContext, type ReactNode, use, useEffect, useRef, useState } from 'react'
import { type Fitted, fitStage } from './fit.ts'
import { type Layout, PORTRAIT } from './geometry.ts'

const LayoutContext = createContext<Layout>(PORTRAIT)

export function useLayout(): Layout {
  return use(LayoutContext)
}

/**
 * Fits the fixed stage into whatever space it is given with a single transform.
 * Nothing inside reflows on resize, so rotating a phone or opening the keyboard
 * costs one style write rather than a full layout of the table.
 */
export function Stage({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null)
  const [fitted, setFitted] = useState<Fitted | null>(null)

  useEffect(() => {
    const element = frame.current
    if (!element) return

    const measure = (width: number, height: number) => {
      const next = fitStage(width, height)
      // Only the scale changes on most resizes, and replacing the layout object
      // would re-render every seat, so the identity is kept when it can be.
      setFitted((current) =>
        current && current.layout === next.layout && current.scale === next.scale ? current : next,
      )
    }

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) measure(box.width, box.height)
    })
    observer.observe(element)
    measure(element.clientWidth, element.clientHeight)
    return () => observer.disconnect()
  }, [])

  const layout = fitted?.layout ?? PORTRAIT

  return (
    <div ref={frame} className="relative flex-1 overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate(-50%, -50%) scale(${fitted?.scale ?? 1})`,
          // Hidden until measured, otherwise the first paint shows the stage at
          // full size before it is scaled down.
          visibility: fitted ? 'visible' : 'hidden',
        }}
      >
        <LayoutContext value={layout}>{children}</LayoutContext>
      </div>
    </div>
  )
}
