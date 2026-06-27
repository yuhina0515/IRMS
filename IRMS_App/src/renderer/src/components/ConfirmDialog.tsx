// renderer/components/ConfirmDialog.tsx
import { useUiStore } from '../store/useUiStore'

export function ConfirmDialog(): JSX.Element | null {
  const confirm = useUiStore((s) => s.confirm)
  const resolve = useUiStore((s) => s.resolveConfirm)
  if (!confirm) return null

  return (
    <div className="overlay" onClick={() => resolve(false)}>
      <div className="dialog glass" onClick={(e) => e.stopPropagation()}>
        <h3>{confirm.title}</h3>
        <p>{confirm.message}</p>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => resolve(false)}>
            取消
          </button>
          <button className="btn btn-danger" onClick={() => resolve(true)}>
            確認
          </button>
        </div>
      </div>
    </div>
  )
}
