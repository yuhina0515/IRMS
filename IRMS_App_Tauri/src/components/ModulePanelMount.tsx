// components/ModulePanelMount.tsx
// 把模組註冊的操作介面掛進一個容器;模組的 mount 出錯只影響它自己的區塊。
import { useEffect, useRef } from 'react'
import { modulePage } from '../services/moduleFeatures'
import { getT } from '../i18n'

export function ModulePanelMount({ id }: { id: string }): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  const panel = modulePage(id)
  useEffect(() => {
    const el = ref.current
    if (!el || !panel) return
    let cleanup: void | (() => void)
    try {
      cleanup = panel.mount(el)
    } catch (err) {
      el.textContent = getT().tools.panelFailed({ message: err instanceof Error ? err.message : String(err) })
    }
    return () => {
      try {
        if (typeof cleanup === 'function') cleanup()
      } finally {
        el.replaceChildren()
      }
    }
  }, [panel])
  return panel ? <div ref={ref} className="module-panel" data-module={id} /> : null
}
