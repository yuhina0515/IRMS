// renderer/components/ToastHost.tsx
import { useUiStore } from '../store/useUiStore'

export function ToastHost(): JSX.Element {
  const toasts = useUiStore((s) => s.toasts)
  const dismiss = useUiStore((s) => s.dismissToast)

  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} onClick={() => dismiss(t.id)}>
          {/* 以純文字渲染,杜絕舊版 innerHTML 的 XSS 風險 */}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
