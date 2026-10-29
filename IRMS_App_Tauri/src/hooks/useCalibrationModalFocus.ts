import { useLayoutEffect, type RefObject } from 'react'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { isolateBody } from '../services/modalIsolation'

/** 確認框退場仍持有焦點；不能只用已清空的 confirm store 判定可接管。 */
export function calibrationFocusBlocked(): boolean {
  return Boolean(useStore.getState().hardwareError || useUiStore.getState().confirm || document.querySelector('[role="alertdialog"]'))
}

/** 校正 A 的焦點租約；高層警示期間暫停，回復後接續精靈內原控制。 */
export function useCalibrationModalFocus(overlayRef: RefObject<HTMLDivElement>): void {
  useLayoutEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]') ?? overlay
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null
    let remembered: HTMLElement | null = null
    let release: (() => void) | null = null
    const eligible = (element: HTMLElement): boolean => element.isConnected && !element.matches(':disabled') && !element.closest('[inert], [hidden], [aria-hidden="true"]')
    const choices = (): HTMLElement[] => Array.from(overlay.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')).filter((element) => element.tabIndex >= 0 && eligible(element))
    const focusInside = (): void => {
      if (remembered && overlay.contains(remembered) && eligible(remembered)) remembered.focus()
      else (choices()[0] ?? dialog).focus()
    }
    const sync = (): void => {
      if (calibrationFocusBlocked()) {
        release?.()
        release = null
      } else if (!release) {
        release = isolateBody(overlay)
        focusInside()
      } else {
        const focused = document.activeElement
        if (!(focused instanceof HTMLElement) || !overlay.contains(focused) || !eligible(focused)) focusInside()
      }
    }
    const containFocus = (event: FocusEvent): void => {
      if (calibrationFocusBlocked()) return
      const target = event.target
      if (target instanceof HTMLElement && overlay.contains(target)) remembered = target
      else focusInside()
    }
    const containKey = (event: KeyboardEvent): void => {
      if (calibrationFocusBlocked()) return
      if (event.key === 'Tab') {
        event.preventDefault()
        const controls = choices()
        const index = controls.indexOf(document.activeElement as HTMLElement)
        const next = index < 0 ? (event.shiftKey ? controls.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
        ;(controls[next] ?? dialog).focus()
      } else if (!overlay.contains(event.target as Node)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const containPointer = (event: Event): void => {
      if (!calibrationFocusBlocked() && !overlay.contains(event.target as Node)) { event.preventDefault(); event.stopPropagation() }
    }
    document.addEventListener('focusin', containFocus, true)
    document.addEventListener('keydown', containKey, true)
    document.addEventListener('pointerdown', containPointer, true)
    document.addEventListener('click', containPointer, true)
    // 同步訂閱先於下一次 DOM/焦點事件讓出租約，避免不同元件順序造成爭焦點。
    const unsubscribeHardware = useStore.subscribe((state, previous) => { if (state.hardwareError !== previous.hardwareError) sync() })
    const unsubscribeConfirm = useUiStore.subscribe((state, previous) => { if (state.confirm !== previous.confirm) sync() })
    const bodyObserver = new MutationObserver(sync)
    bodyObserver.observe(document.body, { childList: true })
    const controlsObserver = new MutationObserver(sync)
    controlsObserver.observe(overlay, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'inert', 'aria-hidden'] })
    sync()
    return () => {
      unsubscribeHardware(); unsubscribeConfirm()
      bodyObserver.disconnect(); controlsObserver.disconnect()
      document.removeEventListener('focusin', containFocus, true)
      document.removeEventListener('keydown', containKey, true)
      document.removeEventListener('pointerdown', containPointer, true)
      document.removeEventListener('click', containPointer, true)
      release?.()
      // 上層警示仍在時不把焦點帶回背景；已移除/停用的呼叫端也不強制聚焦。
      if (!calibrationFocusBlocked() && invoker && eligible(invoker)) invoker.focus()
    }
  }, [overlayRef])
}
