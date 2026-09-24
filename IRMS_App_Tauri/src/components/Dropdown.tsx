// 下拉選單:取代原生 <select> 以統一兩個主題下的外觀。選單面板 portal 到 body 並以量測
// 座標 position:fixed 定位——工作區是可捲動容器,掛在觸發按鈕底下會被裁切。
// 鍵盤:觸發鈕可 Enter/Space 開啟,方向鍵在選項間移動,Esc 關閉並把焦點還給觸發鈕。
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n'
import { ChevronIcon } from './Icons'

export interface DropdownOption {
  value: string
  label: string
}

interface DropdownProps {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  /** 無可見 <label> 時提供給輔助科技的名稱 */
  ariaLabel?: string
  id?: string
}

export function Dropdown({ value, options, onChange, disabled, placeholder, ariaLabel, id }: DropdownProps): JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const updatePos = (): void => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
  }

  const close = (refocus: boolean): void => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node
      if (rootRef.current?.contains(target) || popupRef.current?.contains(target)) return
      close(false)
    }
    // 捲動不冒泡,capture 階段才收得到工作區內部捲動
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    // 開啟後把焦點移到目前選取項(或第一項)
    requestAnimationFrame(() => {
      const items = popupRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')
      const selected = popupRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ;(selected ?? items?.[0])?.focus()
    })
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [open])

  const onPopupKeyDown = (e: KeyboardEvent): void => {
    const items = Array.from(popupRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      close(true)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[Math.min(items.length - 1, index + 1)]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[Math.max(0, index - 1)]?.focus()
    }
  }

  const current = options.find((o) => o.value === value)

  return (
    <div className="dropdown" ref={rootRef}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="dropdown__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => {
          if (open) close(false)
          else {
            updatePos()
            setOpen(true)
          }
        }}
      >
        <span className={current ? undefined : 'dropdown__placeholder'}>
          {current?.label ?? placeholder ?? t.dialogs.dropdownPlaceholder}
        </span>
        <ChevronIcon size={16} className={`icon dropdown__chevron${open ? ' dropdown__chevron--open' : ''}`} />
      </button>

      {open &&
        !disabled &&
        pos &&
        createPortal(
          <div
            ref={popupRef}
            id={listId}
            className="dropdown__popup"
            role="listbox"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            onKeyDown={onPopupKeyDown}
          >
            {options.length === 0 ? (
              <div className="dropdown__empty">{placeholder ?? t.dialogs.dropdownEmpty}</div>
            ) : (
              options.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  className="dropdown__item"
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => {
                    onChange(o.value)
                    close(true)
                  }}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  )
}
