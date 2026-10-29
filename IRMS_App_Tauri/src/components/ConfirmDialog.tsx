// renderer/components/ConfirmDialog.tsx
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUiStore } from '../store/useUiStore'
import { useStore } from '../store/useStore'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useT } from '../i18n'
import { isolateBody, offerEmergencyReturnTarget, takeEmergencyReturnTarget } from '../services/modalIsolation'

// 150ms——必須對齊 tailwind.css 裡 .overlay.closing/.dialog.closing 的 animation-duration,
// 退場動畫才有時間播完再真正卸載。
const CLOSE_ANIM_MS = 150

export function ConfirmDialog(): JSX.Element | null {
  const confirm = useUiStore((s) => s.confirm)
  const resolve = useUiStore((s) => s.resolveConfirm)
  const m = useT()
  const hardwareError = useStore((s) => s.hardwareError)
  const descriptionId = useId()
  const overlayRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  // 決議(resolve)必須立刻發生——呼叫端 await requestConfirm() 後接的動作(例如真的
  // 刪除紀錄)不該被動畫拖慢。這裡另外維護一份「畫面上是否還顯示」的鏡像狀態,只延遲
  // 卸載 DOM 150ms 讓退場動畫播完,邏輯上的決議與視覺上的關閉是兩件事。
  const [visible, setVisible] = useState(confirm)
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Esc = 取消。這個對話框守著刪除動作/紀錄與還原預設等不可逆操作,
  // 而在此之前它完全沒有鍵盤出口——只能用滑鼠點,或點背景(靜默視為取消)。
  const active = visible != null && !hardwareError
  // 退場動畫期間仍消耗 Esc，避免同一次關閉穿透到下層視窗。
  useEscapeKey(active ? () => { if (!closing) resolve(false) } : null)

  // 此單例確認框以 body portal 隔離其他內容；保留原始 inert 狀態與呼叫端焦點。
  useLayoutEffect(() => {
    const overlay = overlayRef.current
    const dialog = dialogRef.current
    if (!active || !overlay || !dialog) return
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const buttons = (): HTMLButtonElement[] => Array.from(dialog.querySelectorAll('button:not(:disabled)'))
    const focusInside = (): void => { (buttons()[0] ?? dialog).focus() }
    const containFocus = (event: FocusEvent): void => {
      if (!overlay.contains(event.target as Node)) focusInside()
    }
    const containKey = (event: KeyboardEvent): void => {
      if (event.key === 'Tab') {
        event.preventDefault()
        const choices = buttons()
        const index = choices.indexOf(document.activeElement as HTMLButtonElement)
        const next = index < 0 ? (event.shiftKey ? choices.length - 1 : 0)
          : (index + (event.shiftKey ? -1 : 1) + choices.length) % choices.length
        const target = choices[next] ?? dialog
        target.focus()
      } else if (!overlay.contains(event.target as Node)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const containPointer = (event: Event): void => {
      if (!overlay.contains(event.target as Node)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const releaseIsolation = isolateBody(overlay)
    document.addEventListener('focusin', containFocus, true)
    document.addEventListener('keydown', containKey, true)
    document.addEventListener('pointerdown', containPointer, true)
    document.addEventListener('click', containPointer, true)
    focusInside()
    return () => {
      releaseIsolation()
      document.removeEventListener('focusin', containFocus, true)
      document.removeEventListener('keydown', containKey, true)
      document.removeEventListener('pointerdown', containPointer, true)
      document.removeEventListener('click', containPointer, true)
      // 先解除隔離再交還焦點；硬體警示接管時直接選擇仍可操作的逃生控制。
      const hardwareOwns = Boolean(useStore.getState().hardwareError)
      if (hardwareOwns) offerEmergencyReturnTarget(invoker)
      const emergency = document.querySelector<HTMLElement>('.error-overlay:not([data-emergency-focus-owner]) button:not(:disabled)')
      const target = hardwareOwns ? emergency : invoker
      if (target?.isConnected && !target.matches(':disabled') && !target.closest('[inert], [hidden]')) target.focus()
    }
  }, [active])

  // 其他元件的警示 DOM 要等 mutation 階段完成才存在；在 layout setup 階段交接焦點。
  useLayoutEffect(() => {
    if (hardwareError && !active) {
      document.querySelector<HTMLElement>('.error-overlay:not([data-emergency-focus-owner]) button:not(:disabled)')?.focus()
    } else if (!hardwareError) {
      takeEmergencyReturnTarget()
    }
  }, [hardwareError, active])

  // 開啟時把焦點移到「取消」而非「確認」:預設落點應該是安全的那一邊,
  // 使用者按 Enter 不該就把東西刪掉。
  useEffect(() => {
    if (hardwareError) {
      // 硬體警示立即接管，不等待動畫，也不讓已取消的確認框在警示解除後重新出現。
      clearTimeout(closeTimerRef.current)
      setClosing(false)
      setVisible(null)
      if (confirm) resolve(false)
    } else if (confirm) {
      clearTimeout(closeTimerRef.current)
      setClosing(false)
      setVisible(confirm)
    } else if (visible) {
      setClosing(true)
      closeTimerRef.current = setTimeout(() => {
        setClosing(false)
        setVisible(null)
      }, CLOSE_ANIM_MS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm, hardwareError])

  // 取消鈕要等對話框真正渲染(visible 設定後)才存在,所以焦點在這裡移,不能在上面的 effect
  useEffect(() => {
    if (visible && !closing) cancelRef.current?.focus()
  }, [visible, closing])

  useEffect(() => () => clearTimeout(closeTimerRef.current), [])

  if (!active || !visible) return null

  return createPortal(
    <div ref={overlayRef} className={`overlay${closing ? ' closing' : ''}`} onClick={() => { if (!closing) resolve(false) }}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`dialog glass${closing ? ' closing' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-label={visible.title}
        aria-describedby={descriptionId}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{visible.title}</h3>
        <p id={descriptionId}>{visible.message}</p>
        <div className="actions">
          <button ref={cancelRef} disabled={closing} className="btn btn-secondary" onClick={() => resolve(false)}>
            {m.common.cancel}
          </button>
          <button disabled={closing} className="btn btn-danger" onClick={() => resolve(true)}>
            {m.common.confirm}
          </button>
        </div>
      </div>
    </div>, document.body
  )
}
