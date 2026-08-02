// renderer/components/ConfirmDialog.tsx
import { useEffect, useRef } from 'react'
import { useUiStore } from '../store/useUiStore'
import { useEscapeKey } from '../hooks/useEscapeKey'

export function ConfirmDialog(): JSX.Element | null {
  const confirm = useUiStore((s) => s.confirm)
  const resolve = useUiStore((s) => s.resolveConfirm)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Esc = 取消。這個對話框守著刪除動作/紀錄與還原預設等不可逆操作,
  // 而在此之前它完全沒有鍵盤出口——只能用滑鼠點,或點背景(靜默視為取消)。
  useEscapeKey(confirm ? () => resolve(false) : null)

  // 開啟時把焦點移到「取消」而非「確認」:預設落點應該是安全的那一邊,
  // 使用者按 Enter 不該就把東西刪掉。
  useEffect(() => {
    if (confirm) cancelRef.current?.focus()
  }, [confirm])

  if (!confirm) return null

  return (
    <div className="overlay" onClick={() => resolve(false)}>
      <div
        className="dialog glass"
        role="alertdialog"
        aria-modal="true"
        aria-label={confirm.title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{confirm.title}</h3>
        <p>{confirm.message}</p>
        <div className="actions">
          <button ref={cancelRef} className="btn btn-secondary" onClick={() => resolve(false)}>
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
