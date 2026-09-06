// renderer/components/ConfirmDialog.tsx
import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../store/useUiStore'
import { useEscapeKey } from '../hooks/useEscapeKey'

// 150ms——必須對齊 tailwind.css 裡 .overlay.closing/.dialog.closing 的 animation-duration,
// 退場動畫才有時間播完再真正卸載。
const CLOSE_ANIM_MS = 150

export function ConfirmDialog(): JSX.Element | null {
  const confirm = useUiStore((s) => s.confirm)
  const resolve = useUiStore((s) => s.resolveConfirm)
  const cancelRef = useRef<HTMLButtonElement>(null)
  // 決議(resolve)必須立刻發生——呼叫端 await requestConfirm() 後接的動作(例如真的
  // 刪除紀錄)不該被動畫拖慢。這裡另外維護一份「畫面上是否還顯示」的鏡像狀態,只延遲
  // 卸載 DOM 150ms 讓退場動畫播完,邏輯上的決議與視覺上的關閉是兩件事。
  const [visible, setVisible] = useState(confirm)
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Esc = 取消。這個對話框守著刪除動作/紀錄與還原預設等不可逆操作,
  // 而在此之前它完全沒有鍵盤出口——只能用滑鼠點,或點背景(靜默視為取消)。
  useEscapeKey(confirm ? () => resolve(false) : null)

  // 開啟時把焦點移到「取消」而非「確認」:預設落點應該是安全的那一邊,
  // 使用者按 Enter 不該就把東西刪掉。
  useEffect(() => {
    if (confirm) {
      clearTimeout(closeTimerRef.current)
      setClosing(false)
      setVisible(confirm)
      cancelRef.current?.focus()
    } else if (visible) {
      setClosing(true)
      closeTimerRef.current = setTimeout(() => {
        setClosing(false)
        setVisible(null)
      }, CLOSE_ANIM_MS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm])

  useEffect(() => () => clearTimeout(closeTimerRef.current), [])

  if (!visible) return null

  return (
    <div className={`overlay${closing ? ' closing' : ''}`} onClick={() => resolve(false)}>
      <div
        className={`dialog glass${closing ? ' closing' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-label={visible.title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{visible.title}</h3>
        <p>{visible.message}</p>
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
