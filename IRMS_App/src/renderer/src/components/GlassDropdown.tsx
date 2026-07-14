// renderer/components/GlassDropdown.tsx
// 自訂下拉選單:取代原生 <select>,點擊觸發(非 hover)彈出玻璃選單面板,
// 開啟時由小長大、關閉時由大縮小(dropdown-grow/dropdown-shrink keyframes,
// 詳見 global.css)—— 縮小動畫播完才真正卸載 DOM,而非關閉瞬間直接消失。
import { useEffect, useRef, useState } from 'react'

export interface GlassDropdownOption {
  value: string
  label: string
}

interface GlassDropdownProps {
  value: string
  options: GlassDropdownOption[]
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}

const CLOSE_ANIM_MS = 160

export function GlassDropdown({
  value,
  options,
  onChange,
  disabled,
  placeholder
}: GlassDropdownProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const requestOpen = (): void => {
    clearTimeout(closeTimerRef.current)
    setClosing(false)
    setMounted(true)
    setOpen(true)
  }

  const requestClose = (): void => {
    setOpen(false)
    setClosing(true)
    clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => {
      setClosing(false)
      setMounted(false)
    }, CLOSE_ANIM_MS)
  }

  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (e: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) requestClose()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => () => clearTimeout(closeTimerRef.current), [])

  // 選項變動後若目前開啟中的清單已不含原值,不強制關閉,交由呼叫端下一輪 render 自然反映

  const current = options.find((o) => o.value === value)

  return (
    <div className={`glass-dropdown${disabled ? ' disabled' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="glass-dropdown-trigger"
        disabled={disabled}
        onClick={() => (open ? requestClose() : requestOpen())}
      >
        <span className={current ? '' : 'placeholder'}>{current?.label ?? placeholder ?? '請選擇'}</span>
        <svg className={`chevron${open ? ' open' : ''}`} width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden>
          <path d="M1 1l4.5 4.5L10 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {mounted && !disabled && (
        <div
          className={`glass-dropdown-popup glass glass-warp${closing ? ' closing' : ''}`}
          role="listbox"
        >
          {options.length === 0 ? (
            <div className="glass-dropdown-empty">{placeholder ?? '無可用選項'}</div>
          ) : (
            options.map((o) => (
              <button
                type="button"
                key={o.value}
                className={`glass-dropdown-item${o.value === value ? ' selected' : ''}`}
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value)
                  requestClose()
                }}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
