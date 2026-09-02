// renderer/components/Sidebar.tsx
// 左側導覽欄——外部設計 handoff(doc/gemini-handoff-20260902/)採用的雙層導覽:側欄 +
// 頂部 SegmentedControl 共同驅動同一個 view 狀態,兩者保持同步,不是各自獨立的導覽來源。
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
