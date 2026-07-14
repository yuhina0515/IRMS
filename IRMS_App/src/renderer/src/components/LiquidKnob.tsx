// renderer/components/LiquidKnob.tsx
// 液態黏滯滑動指示器:量測容器內目前 active 項目的位置/尺寸,讓指示塊平滑滑過去,
// 到位時觸發一次性拉伸回彈(knob-stretch keyframe,見 global.css),
// 套用 SVG 黏滯濾鏡(#liquid-gooey-filter,定義於 App.tsx)讓拉伸邊緣呈現液態感。
//
// 可直接「抓住」指示塊拖曳切換:指示塊視覺上永遠疊在目前選中項的按鈕正下方,
// 所以「抓指示塊」等同於「按住目前選中的那個按鈕拖曳」——用 getItemProps(key) 把
// pointerdown 只掛在「key === activeKey」的按鈕上即可,不需要額外的可視覺穿透層或
// z-index 手法。未選中的按鈕維持原本 onClick 單擊切換,不受影響。
//
// 拖曳追蹤刻意不依賴 setPointerCapture + 元素自身的 onPointerMove/onPointerUp:
// 按鈕的可點擊範圍不大,真實滑鼠/觸控拖曳很容易在一次 move 之間就滑出按鈕邊界,
// 若靠元素自己接事件,一旦指標離開範圍就收不到後續 move/up,拖曳等於卡死。
// 改成 pointerdown 當下手動掛 window 層級的 pointermove/pointerup 監聽,直到放開才
// 移除——不論指標實際移到哪裡都能持續追蹤到底。setPointerCapture 仍保留當輔助。
//
// 拖曳中指示塊會依瞬時速度沿拖曳方向拉伸(scaleX/scaleY),模擬液態被拉扯的手感,
// 放開後透過 CSS transition 彈簧回正到 1。
//
// 用法:呼叫端容器需 position:relative,每個可選項按鈕上加 data-knob-key,
// 並把 knobElement 當作容器的「第一個子元素」渲染(不需要 z-index,按鈕自然
// 疊在指示塊之上,只要按鈕本身也是 position:relative 的——見 global.css 的
// stacking 說明)。
import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

interface UseLiquidKnobOptions {
  containerRef: RefObject<HTMLElement>
  activeKey: string
  /** horizontal:依 left/width 定位(如水平分頁);vertical:依 top/height 定位(如底部/側邊導覽) */
  orientation: 'horizontal' | 'vertical'
  /** 提供時,使用者可直接抓取「目前選中項」的按鈕拖曳切換;不提供則指示塊純被動跟隨 activeKey */
  onSelect?: (key: string) => void
}

const MORPH_DURATION_MS = 420
const DRAG_THRESHOLD_PX = 4
const STRETCH_MAX = 1.4
const STRETCH_VELOCITY_SCALE = 0.015

interface DragState {
  pointerId: number
  pointerStart: number
  boxStart: number
  currentStart: number
  moved: boolean
  lastPos: number
  lastT: number
}

interface KnobItemProps {
  onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void
  style?: CSSProperties
}

interface UseLiquidKnobResult {
  knobElement: JSX.Element | null
  getItemProps: (key: string) => KnobItemProps
}

export function useLiquidKnob({
  containerRef,
  activeKey,
  orientation,
  onSelect
}: UseLiquidKnobOptions): UseLiquidKnobResult {
  const [box, setBox] = useState<{ start: number; size: number } | null>(null)
  const [morphing, setMorphing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState(0)
  const [dragStretch, setDragStretch] = useState(1)
  const prevKeyRef = useRef<string | null>(null)
  const morphTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const dragRef = useRef<DragState | null>(null)
  const cleanupDragListenersRef = useRef<(() => void) | null>(null)

  useLayoutEffect(() => {
    const measure = (): void => {
      const container = containerRef.current
      if (!container) return
      const activeEl = container.querySelector<HTMLElement>(
        `[data-knob-key="${CSS.escape(activeKey)}"]`
      )
      if (!activeEl) return
      const cRect = container.getBoundingClientRect()
      const aRect = activeEl.getBoundingClientRect()
      setBox(
        orientation === 'horizontal'
          ? { start: aRect.left - cRect.left, size: aRect.width }
          : { start: aRect.top - cRect.top, size: aRect.height }
      )
    }

    // 只有「真的換了選中項」才觸發拉伸回彈;首次掛載量測不晃動,
    // window resize 之類的重新量測(activeKey 不變時)也不重新觸發
    const isSelectionChange = prevKeyRef.current !== null && prevKeyRef.current !== activeKey
    prevKeyRef.current = activeKey
    measure()
    if (isSelectionChange) {
      setMorphing(true)
      clearTimeout(morphTimerRef.current)
      morphTimerRef.current = setTimeout(() => setMorphing(false), MORPH_DURATION_MS)
    }

    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
      clearTimeout(morphTimerRef.current)
    }
  }, [activeKey, orientation, containerRef])

  // 元件卸載時確保拖曳監聽一定被清掉,不留孤兒 listener
  useLayoutEffect(() => () => cleanupDragListenersRef.current?.(), [])

  const finishDrag = (): void => {
    const drag = dragRef.current
    const container = containerRef.current
    if (drag?.moved && container && box && onSelect) {
      // 放開時找出離指示塊目前中心最近的選項,吸附選取
      const knobCenter = drag.currentStart + box.size / 2
      const items = Array.from(container.querySelectorAll<HTMLElement>('[data-knob-key]'))
      const cRect = container.getBoundingClientRect()
      let nearestKey = activeKey
      let nearestDist = Infinity
      for (const item of items) {
        const r = item.getBoundingClientRect()
        const start = orientation === 'horizontal' ? r.left - cRect.left : r.top - cRect.top
        const size = orientation === 'horizontal' ? r.width : r.height
        const dist = Math.abs(start + size / 2 - knobCenter)
        if (dist < nearestDist) {
          nearestDist = dist
          nearestKey = item.dataset.knobKey ?? nearestKey
        }
      }
      if (nearestKey !== activeKey) onSelect(nearestKey)
    }
    dragRef.current = null
    setIsDragging(false)
    setDragStretch(1)
    cleanupDragListenersRef.current?.()
    cleanupDragListenersRef.current = null
  }

  const beginDrag = (e: ReactPointerEvent<HTMLElement>): void => {
    if (!onSelect || !box) return
    e.preventDefault()
    // 刻意不呼叫 setPointerCapture——它會讓瀏覽器把拖曳結束後補發的相容性
    // click 事件導回「按下當下的原始元素」(不論放開位置在哪),導致拖到別的
    // 選項放開後,原按鈕的 onClick 又補一槍把剛選好的新值蓋回舊值。追蹤全靠
    // 下方的 window 層級 pointermove/pointerup 監聽,不需要 capture。

    const now = performance.now()
    const startPos = orientation === 'horizontal' ? e.clientX : e.clientY
    dragRef.current = {
      pointerId: e.pointerId,
      pointerStart: startPos,
      boxStart: box.start,
      currentStart: box.start,
      moved: false,
      lastPos: startPos,
      lastT: now
    }

    // 用 window 層級的原生監聽追蹤 move/up,而非依賴元素自身接住後續事件——
    // 按鈕的可點擊範圍不大,真實拖曳很容易一下就滑出邊界,若指標離開後
    // 就收不到 move/up,拖曳會卡在「按下但選不到新項目」的死狀態。
    const onWindowPointerMove = (ev: PointerEvent): void => {
      const drag = dragRef.current
      const container = containerRef.current
      if (!drag || drag.pointerId !== ev.pointerId || !container || !box) return
      const pointerPos = orientation === 'horizontal' ? ev.clientX : ev.clientY
      const delta = pointerPos - drag.pointerStart
      if (!drag.moved && Math.abs(delta) < DRAG_THRESHOLD_PX) return
      drag.moved = true
      setIsDragging(true)

      const cRect = container.getBoundingClientRect()
      const containerSize = orientation === 'horizontal' ? cRect.width : cRect.height
      const maxStart = Math.max(0, containerSize - box.size)
      const nextStart = Math.min(Math.max(0, drag.boxStart + delta), maxStart)
      drag.currentStart = nextStart
      setDragStart(nextStart)

      const now = performance.now()
      const dt = Math.max(1, now - drag.lastT)
      const velocity = Math.abs(pointerPos - drag.lastPos) / dt
      drag.lastPos = pointerPos
      drag.lastT = now
      setDragStretch(Math.min(STRETCH_MAX, 1 + velocity * STRETCH_VELOCITY_SCALE))
    }

    const onWindowPointerUp = (ev: PointerEvent): void => {
      if (dragRef.current?.pointerId !== ev.pointerId) return
      finishDrag()
    }

    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointercancel', onWindowPointerUp)
    cleanupDragListenersRef.current = () => {
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('pointerup', onWindowPointerUp)
      window.removeEventListener('pointercancel', onWindowPointerUp)
    }
  }

  const getItemProps = (key: string): KnobItemProps => {
    if (!onSelect || key !== activeKey) return {}
    return {
      onPointerDown: beginDrag,
      style: { touchAction: 'none', cursor: 'grab' }
    }
  }

  if (box == null) return { knobElement: null, getItemProps }

  const effectiveStart = isDragging ? dragStart : box.start
  const trackStyle: CSSProperties =
    orientation === 'horizontal'
      ? { transform: `translateX(${effectiveStart}px)`, width: box.size }
      : { transform: `translateY(${effectiveStart}px)`, height: box.size }

  const shapeStyle: CSSProperties | undefined = isDragging
    ? {
        transform:
          orientation === 'horizontal' ? `scaleX(${dragStretch})` : `scaleY(${dragStretch})`
      }
    : undefined

  const knobElement = (
    <div
      className={`liquid-knob-track ${orientation}${isDragging ? ' dragging' : ''}`}
      style={trackStyle}
      aria-hidden
    >
      <div className={`liquid-knob-shape${morphing ? ' morph' : ''}`} style={shapeStyle} />
    </div>
  )

  return { knobElement, getItemProps }
}
