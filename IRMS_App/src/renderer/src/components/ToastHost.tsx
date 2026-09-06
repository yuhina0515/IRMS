// renderer/components/ToastHost.tsx
import { useEffect, useRef, useState } from 'react'
import { useUiStore, type Toast } from '../store/useUiStore'

// 120ms — must match .toast.exiting's animation-duration in tailwind.css, or the DOM node
// gets stripped before/after the CSS fade actually finishes.
const EXIT_ANIM_MS = 120

interface DisplayToast extends Toast {
  exiting: boolean
}

export function ToastHost(): JSX.Element {
  const toasts = useUiStore((s) => s.toasts)
  const dismiss = useUiStore((s) => s.dismissToast)
  // useUiStore.dismissToast removes a toast from the store instantly (no animation concept
  // there — it's just "is this notification still pending"). This local mirror is what actually
  // lets a dismissed toast play its exit fade: an item that disappears from `toasts` is kept
  // here (marked `exiting`) for EXIT_ANIM_MS instead of vanishing on the same render, and stays
  // at its original position in the list so it fades in place rather than jumping.
  const [displayed, setDisplayed] = useState<DisplayToast[]>([])
  const scheduledRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    const currentIds = new Set(toasts.map((t) => t.id))
    setDisplayed((prev) => {
      // 只标 exiting,不在這裡 filter 掉——某個項目剛從 store 消失的當下,它在
      // `prev` 裡的 t.exiting 必然還是 false(還沒被標過),若在同一次 filter 就
      // 用這個舊值篩掉它,會在標記為 exiting 之前就先被砍掉,120ms 退場動畫永遠
      // 播不到。真正的移除交給下面那個 effect 的計時器,這裡只負責保留 + 標記。
      const kept = prev.map((t) => (currentIds.has(t.id) ? t : { ...t, exiting: true }))
      const newOnes = toasts
        .filter((t) => !prev.some((p) => p.id === t.id))
        .map((t) => ({ ...t, exiting: false }))
      return [...kept, ...newOnes]
    })
  }, [toasts])

  useEffect(() => {
    for (const t of displayed) {
      if (t.exiting && !scheduledRef.current.has(t.id)) {
        scheduledRef.current.add(t.id)
        setTimeout(() => {
          scheduledRef.current.delete(t.id)
          setDisplayed((prev) => prev.filter((x) => x.id !== t.id))
        }, EXIT_ANIM_MS)
      }
    }
  }, [displayed])

  return (
    <div className="toast-host">
      {displayed.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.type}${t.exiting ? ' exiting' : ''}`}
          onClick={() => dismiss(t.id)}
        >
          {/* 以純文字渲染,杜絕舊版 innerHTML 的 XSS 風險 */}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
