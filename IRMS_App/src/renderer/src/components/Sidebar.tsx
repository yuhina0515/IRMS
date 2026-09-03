// renderer/components/Sidebar.tsx
// 左側導覽欄——唯一的主導覽介面(2026-09-02:依 Gemini 設計判斷移除原本並存的頂部
// SegmentedControl,雙層導覽功能重複又視覺混淆;IRMS UI 設計全權交給 Gemini,見
// memory feedback_irms_ui_design_delegated_to_gemini)。
import { useUiStore } from '../store/useUiStore'
import { DashboardIcon, ActionsIcon, HistoryIcon, SettingsIcon } from './NavIcons'

const NAV: { id: 'dashboard' | 'actions' | 'history' | 'settings'; label: string; Icon: typeof DashboardIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { id: 'actions', label: 'Actions', Icon: ActionsIcon },
  { id: 'history', label: 'History', Icon: HistoryIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon }
]

export function Sidebar(): JSX.Element {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)

  return (
    <nav className="sidebar">
      {NAV.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`sidebar-item${view === id ? ' active' : ''}`}
          onClick={() => setView(id)}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
