// renderer/components/BottomBar.tsx
// 底部導覽列:取代舊側欄的垂直導覽,水平 icon bar + 液態指示塊。
// 指示塊疊在「目前選中」的 icon 正下方,按住該 icon 拖曳即可移動指示塊到別的
// icon 上放開切換(useLiquidKnob 的 getItemProps 只把拖曳事件掛在 active 項上);
// 其餘 icon 維持原本單擊立即切換,不受影響。
import { useRef } from 'react'
import { useUiStore } from '../store/useUiStore'
import { useLiquidKnob } from './LiquidKnob'
import { DashboardIcon, ActionsIcon, HistoryIcon, SettingsIcon } from './NavIcons'

const NAV: { id: 'dashboard' | 'actions' | 'history' | 'settings'; label: string; Icon: typeof DashboardIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { id: 'actions', label: 'Actions', Icon: ActionsIcon },
  { id: 'history', label: 'History', Icon: HistoryIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon }
]

export function BottomBar(): JSX.Element {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const barRef = useRef<HTMLElement>(null)

  const { knobElement, getItemProps } = useLiquidKnob({
    containerRef: barRef,
    activeKey: view,
    orientation: 'horizontal',
    onSelect: (key) => setView(key as typeof view)
  })

  return (
    <nav className="bottom-bar glass glass-warp" ref={barRef}>
      {knobElement}
      {NAV.map(({ id, label, Icon }) => (
        <button
          key={id}
          data-knob-key={id}
          className={`bottom-bar-item${view === id ? ' active' : ''}`}
          title={label}
          onClick={() => setView(id)}
          {...getItemProps(id)}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
