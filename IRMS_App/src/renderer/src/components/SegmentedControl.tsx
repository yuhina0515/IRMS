// renderer/components/SegmentedControl.tsx
// 頂部分段切換器,取代舊版 BottomBar(見 doc/UI_REDESIGN.md 的外殼藍圖)。
// 沿用 useLiquidKnob 的量測/拖曳定位邏輯(該 hook 本身與視覺無關,只負責追蹤目前選中項的
// 位置並提供滑動指示塊),只是外觀從底部圖示列的軟性玻璃膠囊換成 .segmented 的直角深色控制項。
import { useRef } from 'react'
import { useUiStore } from '../store/useUiStore'
import { useLiquidKnob } from './LiquidKnob'

const NAV: { id: 'dashboard' | 'actions' | 'history' | 'settings'; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'actions', label: 'Actions' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' }
]

export function SegmentedControl(): JSX.Element {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const containerRef = useRef<HTMLDivElement>(null)

  const { knobElement, getItemProps } = useLiquidKnob({
    containerRef,
    activeKey: view,
    orientation: 'horizontal',
    onSelect: (key) => setView(key as typeof view)
  })

  return (
    <nav className="segmented" ref={containerRef}>
      {knobElement}
      {NAV.map(({ id, label }) => (
        <button
          key={id}
          data-knob-key={id}
          className={`segmented-item${view === id ? ' active' : ''}`}
          onClick={() => setView(id)}
          {...getItemProps(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
