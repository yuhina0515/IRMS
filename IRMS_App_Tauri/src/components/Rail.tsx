// 命令軌:固定 84px 的唯一主導覽,不收合、不覆蓋工作區(設計語言 v2 §7)。
// 舊 settings.sidebarCollapsed 欄位仍可被反序列化以相容既有資料,但不再使用。
import { useT } from '../i18n'
import { useUiStore, type WorkspaceId } from '../store/useUiStore'
import { ActionsIcon, HistoryIcon, MonitorIcon, SettingsIcon } from './Icons'
import logoIcon from '../assets/logo-icon-only.png'

const NAV: { id: WorkspaceId; Icon: typeof MonitorIcon }[] = [
  { id: 'dashboard', Icon: MonitorIcon },
  { id: 'actions', Icon: ActionsIcon },
  { id: 'history', Icon: HistoryIcon },
  { id: 'settings', Icon: SettingsIcon }
]

export function Rail(): JSX.Element {
  const t = useT()
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  return (
    <nav className="rail" aria-label={t.shell.navLabel}>
      <div className="rail__brand">
        <img src={logoIcon} alt="" />
        <span>IRMS</span>
      </div>
      {NAV.map(({ id, Icon }) => (
        <button
          key={id}
          type="button"
          className="rail__item"
          onClick={() => setView(id)}
          aria-current={view === id ? 'page' : undefined}
          title={t.workspaces[id].title}
        >
          <Icon size={22} />
          <span>{t.workspaces[id].short}</span>
        </button>
      ))}
      <div className="rail__footer">{t.shell.beta}</div>
    </nav>
  )
}
