// renderer/components/GlassDropdown.tsx
// 自訂下拉選單:取代原生 <select>,點擊觸發(非 hover)彈出玻璃選單面板,
// 開啟時由小長大、關閉時由大縮小(dropdown-grow/dropdown-shrink keyframes,
// 詳見 tailwind.css)—— 縮小動畫播完才真正卸載 DOM,而非關閉瞬間直接消失。
//
// 選單面板以 createPortal 掛到 document.body、用量測出來的座標 position:fixed 定位,
// 不能像一般 dropdown 一樣單純 position:absolute 掛在觸發按鈕底下:任何祖先只要有
// backdrop-filter(Liquid Glass 面板全部都有)就會產生新的 stacking context,把子孫的
// z-index 侷限在該祖先內部,導致選單視覺上「長出來」卻被下一張卡片蓋住。
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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

// 100ms — must track .glass-dropdown-popup.closing's animation-duration in tailwind.css
// exactly, or the DOM unmounts before/after the CSS finishes.
const CLOSE_ANIM_MS = 100

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
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number; above: boolean } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const updatePos = (): void => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    const viewport = window.visualViewport
    const x = viewport?.offsetLeft ?? 0, y = viewport?.offsetTop ?? 0
    const w = viewport?.width ?? window.innerWidth, h = viewport?.height ?? window.innerHeight
    const margin = 8
    const width = Math.min(rect.width, Math.max(0, w - margin * 2))
    const below = Math.max(0, y + h - margin - rect.bottom - 6)
    const aboveSpace = Math.max(0, rect.top - 6 - y - margin)
    const wanted = Math.min(popupRef.current?.scrollHeight || 280, 280)
    const above = below < wanted && aboveSpace > below
    const maxHeight = Math.min(280, above ? aboveSpace : below)
    const height = Math.min(wanted, maxHeight)
    setPos({
      top: Math.max(y + margin, Math.min(above ? rect.top - 6 - height : rect.bottom + 6, y + h - margin - height)),
      left: Math.max(x + margin, Math.min(rect.left, x + w - margin - width)),
      width, maxHeight, above
    })
  }

  const requestOpen = (): void => {
    clearTimeout(closeTimerRef.current)
    setClosing(false)
    updatePos()
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

  useLayoutEffect(() => { if (mounted) updatePos() }, [mounted, options])

  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if (popupRef.current?.contains(target)) return
      requestClose()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') requestClose()
    }
    // 面板已 portal 到 body、用量測座標定位,任何祖先的捲動或視窗縮放都得重新量測,
    // 否則選單會停在舊座標,飄離觸發按鈕。scroll 不會冒泡,用 capture 階段才能在
    // window 上收到 .main 內部捲動的事件。
    document.addEventListener('pointerdown', onDocPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    window.visualViewport?.addEventListener('resize', updatePos)
    window.visualViewport?.addEventListener('scroll', updatePos)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
      window.visualViewport?.removeEventListener('resize', updatePos)
      window.visualViewport?.removeEventListener('scroll', updatePos)
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

      {mounted &&
        !disabled &&
        pos &&
        createPortal(
          <div
            ref={popupRef}
            className={`glass-dropdown-popup glass glass-warp${closing ? ' closing' : ''}`}
            role="listbox"
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight, overflowY: 'auto', boxSizing: 'border-box', transformOrigin: pos.above ? 'bottom center' : 'top center' }}
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
          </div>,
          document.body
        )}
    </div>
  )
}
