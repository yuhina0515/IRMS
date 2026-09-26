// hooks/usePageSize.ts
// UI v3 lists never scroll the page (PROPOSAL §4): they measure how many fixed-height rows fit
// in their bounded body and page the rest.
import { useLayoutEffect, useState } from 'react'

export function usePageSize(ref: React.RefObject<HTMLElement>, rowHeight: number, fallback = 4): number {
  const [size, setSize] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = (): void => setSize(Math.max(1, Math.floor(el.clientHeight / rowHeight)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, rowHeight])
  return size
}
