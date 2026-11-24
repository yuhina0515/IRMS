// renderer/components/ErrorOverlay.tsx
// 硬體錯誤(ERR:1)紅色全螢幕警示遮罩。
// 出現時凍結畫面;BluetoothService 於收到 ERR 時即停止餵入角度,故資料寫入也自動暫停。
//
// 此遮罩是 `position:fixed; inset:0; z-index:1500`——I2C 故障期間使用者實體上按不到
// 「結束 Session」,唯一出路是強殺 App,而強殺會讓該場 session 留下
// endTime=NULL / repsCompleted=0 的孤兒列(真實資料變成 0 reps)。
// 因此遮罩一律提供逃生出口:結束並儲存 Session、中斷連線。
import { useStore } from '../store/useStore'
import { SessionSaveControl } from './SessionSaveControl'
import { bluetoothService } from '../services/bluetooth'
import { useT } from '../i18n'
import { useId, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { isolateBody, takeEmergencyReturnTarget } from '../services/modalIsolation'

export function ErrorOverlay(): JSX.Element | null {
  const hardwareError = useStore((s) => s.hardwareError)
  const m = useT()
  const titleId = useId()
  const descriptionId = useId()
  const hintId = useId()
  const overlayRef = useRef<HTMLDivElement>(null)
  const active = Boolean(hardwareError)
  // 警示不能用 Escape 靜默消失，也不能讓背景後開的視窗搶走此事件。
  useEscapeKey(active ? () => {} : null, 100)

  useLayoutEffect(() => {
    const overlay = overlayRef.current
    if (!active || !overlay) return
    const invoker = takeEmergencyReturnTarget() ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const releaseIsolation = isolateBody(overlay)
    const eligible = (element: HTMLElement): boolean => element.isConnected && !element.matches(':disabled') && !element.closest('[inert], [hidden], [aria-hidden="true"]')
    const controls = (): HTMLButtonElement[] => Array.from(overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter(eligible)
    const focusInside = (): void => { (controls()[0] ?? overlay).focus() }
    const containFocus = (event: FocusEvent): void => { if (!overlay.contains(event.target as Node)) focusInside() }
    const containKey = (event: KeyboardEvent): void => {
      if (event.key === 'Tab') {
        event.preventDefault()
        const choices = controls()
        const index = choices.indexOf(document.activeElement as HTMLButtonElement)
        const next = index < 0 ? (event.shiftKey ? choices.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + choices.length) % choices.length
        ;(choices[next] ?? overlay).focus()
      } else if (!overlay.contains(event.target as Node)) {
        event.preventDefault(); event.stopPropagation()
      }
    }
    const containPointer = (event: Event): void => {
      if (!overlay.contains(event.target as Node)) { event.preventDefault(); event.stopPropagation() }
    }
    // 儲存中按鈕會停用、成功後會移除；焦點必須接續到仍可操作的逃生控制。
    const observer = new MutationObserver(() => {
      const focused = document.activeElement
      if (!(focused instanceof HTMLElement) || !overlay.contains(focused) || !eligible(focused)) focusInside()
    })
    observer.observe(overlay, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'inert'] })
    document.addEventListener('focusin', containFocus, true)
    document.addEventListener('keydown', containKey, true)
    document.addEventListener('pointerdown', containPointer, true)
    document.addEventListener('click', containPointer, true)
    focusInside()
    return () => {
      observer.disconnect()
      document.removeEventListener('focusin', containFocus, true)
      document.removeEventListener('keydown', containKey, true)
      document.removeEventListener('pointerdown', containPointer, true)
      document.removeEventListener('click', containPointer, true)
      releaseIsolation()
      const target = takeEmergencyReturnTarget() ?? invoker
      const fallback = Array.from(document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')).find((element) => !overlay.contains(element) && element.tabIndex >= 0 && eligible(element))
      if (target && !overlay.contains(target) && eligible(target)) target.focus()
      else fallback?.focus()
    }
  }, [active])
  if (!hardwareError) return null

  return createPortal(
    <div ref={overlayRef} className="error-overlay" data-emergency-focus-owner role="alertdialog" tabIndex={-1} aria-modal="true" aria-labelledby={titleId} aria-describedby={`${descriptionId} ${hintId}`}>
      <div className="icon" aria-hidden="true">🚨</div>
      <h2 id={titleId}>{m.errorOverlay.title}</h2>
      <p id={descriptionId}>
        {m.errorOverlay.lost({ code: hardwareError })}
        <br />
        {m.errorOverlay.frozen}
      </p>
      <div className="error-overlay-actions">
        <SessionSaveControl allowEnd />
        <button className="btn" onClick={() => bluetoothService.disconnect()}>
          {m.common.disconnect}
        </button>
      </div>
      <p id={hintId} className="error-overlay-hint">
        {m.errorOverlay.hint}
      </p>
    </div>, document.body
  )
}
