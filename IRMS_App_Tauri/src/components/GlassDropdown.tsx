// renderer/components/GlassDropdown.tsx
// 自訂下拉選單:取代原生 <select>,點擊觸發(非 hover)彈出玻璃選單面板,
// 開啟時由小長大、關閉時由大縮小(dropdown-grow/dropdown-shrink keyframes,
// 詳見 tailwind.css)—— 縮小動畫播完才真正卸載 DOM,而非關閉瞬間直接消失。
//
// 選單面板以 createPortal 掛到 document.body、用量測出來的座標 position:fixed 定位,
// 不能像一般 dropdown 一樣單純 position:absolute 掛在觸發按鈕底下:任何祖先只要有
// backdrop-filter(Liquid Glass 面板全部都有)就會產生新的 stacking context,把子孫的
// z-index 侷限在該祖先內部,導致選單視覺上「長出來」卻被下一張卡片蓋住。
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n'
import { useEscapeKey } from '../hooks/useEscapeKey'

export interface GlassDropdownOption {
  value: string
  label: string
}

interface GlassDropdownProps {
  id?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
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
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  value,
  options,
  onChange,
  disabled,
  placeholder
}: GlassDropdownProps): JSX.Element {
  const m = useT()
  const generatedId = useId()
  const triggerId = id ?? generatedId
  const listId = `${triggerId}-listbox`
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number; above: boolean } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const triggerRef = useRef<HTMLButtonElement>(null)
  // 候選與已提交的值分開；探索選項不會立即變更設定。
  const [activeValue, setActiveValue] = useState<string>()
  const openRef = useRef(false)
  const searchRef = useRef({ text: '', at: 0 })
  const selectedIndex = options.findIndex((o) => o.value === value)
  const candidateIndex = options.findIndex((o) => o.value === activeValue)
  const activeIndex = candidateIndex >= 0 ? candidateIndex : Math.max(0, selectedIndex)
  const active = open ? options[activeIndex] : undefined

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

  const requestOpen = (index = Math.max(0, selectedIndex)): void => {
    if (disabled) return
    openRef.current = true
    setActiveValue(options[index]?.value)
    searchRef.current = { text: '', at: 0 }
    clearTimeout(closeTimerRef.current)
    setClosing(false)
    updatePos()
    setMounted(true)
    setOpen(true)
  }

  const requestClose = (): void => {
    openRef.current = false
    setOpen(false)
    setClosing(true)
    clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => {
      setClosing(false)
      setMounted(false)
    }, CLOSE_ANIM_MS)
  }

  // closing 期間仍攔住 Escape，不讓同一次關閉穿透底層視窗。
  useEscapeKey(mounted && !disabled ? () => { if (openRef.current) requestClose() } : null)

  const commit = (option = active): void => {
    if (!openRef.current || disabled) return
    requestClose()
    if (option) onChange(option.value)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled || e.nativeEvent.isComposing) return
    if (e.key === 'Tab') { if (openRef.current) commit(); return }
    if (e.key === 'Escape') return // 共用 capture stack 已處理，避免關閉兩層。
    const wasOpen = openRef.current
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(e.key)) {
      e.preventDefault()
      if (e.key === 'Enter' || e.key === ' ') {
        if (wasOpen) commit(); else requestOpen()
        return
      }
      if (e.altKey && e.key === 'ArrowUp' && wasOpen) { commit(); return }
      if (!wasOpen) requestOpen(e.key === 'End' ? options.length - 1 : e.key === 'Home' || e.key === 'ArrowUp' ? 0 : Math.max(0, selectedIndex))
      else {
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1
          : activeIndex + (e.key === 'PageDown' ? 10 : e.key === 'PageUp' ? -10 : e.key === 'ArrowDown' ? (e.altKey ? 0 : 1) : -1)
        setActiveValue(options[Math.max(0, Math.min(options.length - 1, next))]?.value)
      }
      return
    }
    // 短時間內累積前綴，重複同字則循環；組字／快捷鍵不當成選項搜尋。
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      const now = performance.now()
      const text = (now - searchRef.current.at < 700 ? searchRef.current.text : '') + e.key.toLocaleLowerCase()
      const repeated = [...text].every((char) => char === text[0])
      const prefix = repeated ? text[0] : text
      const start = repeated ? (wasOpen ? activeIndex + 1 : 0) : 0
      const match = options.findIndex((_, offset) => options[(start + offset) % options.length].label.toLocaleLowerCase().startsWith(prefix))
      if (!wasOpen) requestOpen()
      searchRef.current = { text, at: now }
      if (match >= 0) setActiveValue(options[(start + match) % options.length].value)
    }
  }

  useLayoutEffect(() => {
    if (open && active) document.getElementById(`${listId}-option-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active, activeIndex, listId])

  useLayoutEffect(() => {
    if (!disabled) return
    openRef.current = false
    clearTimeout(closeTimerRef.current)
    setOpen(false); setMounted(false); setClosing(false)
  }, [disabled])

  useLayoutEffect(() => { if (mounted) updatePos() }, [mounted, options])

  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if (popupRef.current?.contains(target)) return
      requestClose()
    }
    // 面板已 portal 到 body、用量測座標定位,任何祖先的捲動或視窗縮放都得重新量測,
    // 否則選單會停在舊座標,飄離觸發按鈕。scroll 不會冒泡,用 capture 階段才能在
    // window 上收到 .main 內部捲動的事件。
    document.addEventListener('pointerdown', onDocPointerDown)
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    window.visualViewport?.addEventListener('resize', updatePos)
    window.visualViewport?.addEventListener('scroll', updatePos)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown)
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
        ref={triggerRef}
        id={triggerId}
        role="combobox"
        aria-label={ariaLabelledBy ? undefined : ariaLabel ?? current?.label ?? placeholder ?? m.common.selectPlaceholder}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-haspopup="listbox"
        aria-controls={mounted && !disabled ? listId : undefined}
        aria-expanded={open && !disabled}
        aria-activedescendant={active && !disabled ? `${listId}-option-${activeIndex}` : undefined}
        type="button"
        className="glass-dropdown-trigger"
        disabled={disabled}
        onKeyDown={onKeyDown}
        onBlur={() => { if (openRef.current) requestClose() }}
        onClick={() => (openRef.current ? requestClose() : requestOpen())}
      >
        <span className={current ? '' : 'placeholder'}>{current?.label ?? placeholder ?? m.common.selectPlaceholder}</span>
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
            id={listId}
            className={`glass-dropdown-popup glass glass-warp${closing ? ' closing' : ''}`}
            role="listbox"
            aria-label={ariaLabelledBy ? undefined : ariaLabel ?? current?.label ?? placeholder ?? m.common.selectPlaceholder}
            aria-labelledby={ariaLabelledBy}
            aria-hidden={!open}
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight, overflowY: 'auto', boxSizing: 'border-box', transformOrigin: pos.above ? 'bottom center' : 'top center' }}
          >
            {options.length === 0 ? (
              <div className="glass-dropdown-empty">{placeholder ?? m.common.noOptions}</div>
            ) : (
              options.map((o, index) => (
                <button
                  type="button"
                  key={o.value}
                  id={`${listId}-option-${index}`}
                  className={`glass-dropdown-item${o.value === active?.value ? ' selected' : ''}`}
                  role="option"
                  aria-selected={o.value === active?.value}
                  tabIndex={-1}
                  disabled={!open}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (!openRef.current) return
                    triggerRef.current?.focus()
                    commit(o)
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
