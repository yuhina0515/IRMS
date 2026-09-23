// Beta 8 command rail: fixed desktop navigation, deliberately not collapsible and never
// overlaid on the clinical workspace. The persisted legacy sidebarCollapsed field is ignored
// for backward-compatible settings hydration and can be retired in a future schema cleanup.
import { useUiStore } from '../store/useUiStore'
import { DashboardIcon, ActionsIcon, HistoryIcon, SettingsIcon } from './NavIcons'
import logoIcon from '../assets/logo-icon-only.png'

const NAV: { id: 'dashboard' | 'actions' | 'history' | 'settings'; label: string; Icon: typeof DashboardIcon }[] = [
  { id: 'dashboard', label: '即時監測', Icon: DashboardIcon },
  { id: 'actions', label: '動作管理', Icon: ActionsIcon },
  { id: 'history', label: '歷史紀錄', Icon: HistoryIcon },
  { id: 'settings', label: '系統設定', Icon: SettingsIcon }
]

export function Sidebar(): JSX.Element {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  return (
    <nav className="command-rail" aria-label="主要功能">
      <div className="command-brand" aria-label="IRMS">
        <img src={logoIcon} alt="" />
        <div className="brand-copy"><span>IRMS</span><small>Movement, understood.</small></div>
      </div>
      <div className="rail-section-label">WORKSPACE</div>
      <div className="sidebar-nav-group">
        {NAV.map(({ id, label, Icon }) => {
          const isActive = view === id
          return (
            <button
              key={id}
              className={`rail-item${isActive ? ' active' : ''}`}
              onClick={() => setView(id)}
              aria-current={isActive ? 'page' : undefined}
              title={label}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          )
        })}
      </div>
      <div className="rail-footer"><span className="rail-edition">IRMS · BETA</span><span>每一次動作，都看得更清楚。</span></div>
    </nav>
  )
}
