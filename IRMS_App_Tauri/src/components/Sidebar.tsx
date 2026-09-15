// Beta 8 command rail: fixed desktop navigation, deliberately not collapsible and never
// overlaid on the clinical workspace. The persisted legacy sidebarCollapsed field is ignored
// for backward-compatible settings hydration and can be retired in a future schema cleanup.
import { useUiStore } from '../store/useUiStore'
import { DashboardIcon, ActionsIcon, HistoryIcon, SettingsIcon } from './NavIcons'
import logoIcon from '../assets/logo-icon-only.png'

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
    <nav className="command-rail" aria-label="主要功能">
      <div className="command-brand" aria-label="IRMS">
        <img src={logoIcon} alt="" />
        <span>IRMS</span>
      </div>
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
      <div className="rail-footer">BETA</div>
    </nav>
  )
}
