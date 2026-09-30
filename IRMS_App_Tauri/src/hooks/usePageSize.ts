// hooks/usePageSize.ts
// UI v3 lists never scroll the page (PROPOSAL §4): they measure how many fixed-height rows fit
// in their bounded body and page the rest.
//
// The measured element can be replaced without the ref object changing: History swaps its list
// for the full-page review and back, which mounts a new list body. An effect keyed on the ref
// kept observing the detached old body, whose height reads 0, so every page held one row
// (reported 2026-09-27). The effect therefore re-checks the element on every render and ignores
// measurements from an element that is no longer in the document.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export function usePageSize(ref: React.RefObject<HTMLElement>, rowHeight: number, fallback = 4): number {
  const [size, setSize] = useState(fallback)
  const observed = useRef<{ el: HTMLElement; rowHeight: number; ro: ResizeObserver } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const current = observed.current
    if (current && current.el === el && current.rowHeight === rowHeight) return
    current?.ro.disconnect()
    observed.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = (): void => {
      if (!el.isConnected) return
      // Adaptive layouts may restyle rows (e.g. History's stacked cards at narrow widths); the
      // stylesheet then publishes the real row height as --page-row-height on the measured body.
      const cssRow = parseFloat(getComputedStyle(el).getPropertyValue('--page-row-height'))
      const h = cssRow > 0 ? cssRow : rowHeight
      setSize(Math.max(1, Math.floor(el.clientHeight / h)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    observed.current = { el, rowHeight, ro }
  })

  useEffect(() => () => observed.current?.ro.disconnect(), [])
  return size
}
