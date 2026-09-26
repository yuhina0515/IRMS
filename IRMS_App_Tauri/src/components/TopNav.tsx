// renderer/components/TopNav.tsx
// UI v3 top navigation: brand, four text tabs, device status + connect, theme. Replaces the
// beta8 command rail + command bar (PROPOSAL §2: horizontal navigation gives the pose stage
// the width the rail used to take).
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { bluetoothService } from '../services/bluetooth'
import { useGlobalShortcut } from '../hooks/useGlobalShortcut'
import logoIcon from '../assets/logo-icon-only.png'

export const NAV_ITEMS = [
  { id: 'dashboard', label: '即時監測' },
  { id: 'actions', label: '動作處方' },
  { id: 'history', label: '療程紀錄' },
  { id: 'settings', label: '設定' }
] as const

const THEME_NEXT = { system: 'light', light: 'dark', dark: 'system' } as const
const THEME_LABEL = { system: '跟隨系統', light: '日間', dark: '夜間' } as const

export function TopNav(): JSX.Element {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const demoMode = useUiStore((s) => s.demoMode)
  const isConnected = useStore((s) => s.isConnected)
  const statusText = useStore((s) => s.statusText)
  const reconnect = useStore((s) => s.reconnect)
  const themeMode = useStore((s) => s.settings.themeMode)
  const setSettings = useStore((s) => s.setSettings)

  useGlobalShortcut({ key: 'k' }, demoMode ? null : () => void bluetoothService.connect())

  return (
    <header className="v3-topnav">
      <div className="v3-brand" aria-label="IRMS">
        <img src={logoIcon} alt="" />
        IRMS
      </div>
      <nav className="v3-tabs" aria-label="主要功能">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className="v3-tab"
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="v3-topnav-right">
        <span className="v3-conn" role="status">
          <span className={`v3-conn-dot${isConnected ? ' on' : ''}${reconnect ? ' retrying' : ''}`} aria-hidden />
          {reconnect ? `重新連線中 ${reconnect.attempt}/${reconnect.max}` : isConnected ? '裝置已連線' : statusText === 'Disconnected' ? '未連線' : statusText}
        </span>
        <button
          className="btn btn-secondary btn-sm"
          title={`主題:${THEME_LABEL[themeMode]}(點擊切換)`}
          onClick={() => setSettings({ themeMode: THEME_NEXT[themeMode] })}
        >
          {THEME_LABEL[themeMode]}
        </button>
        <button
          className={`btn btn-sm ${isConnected ? 'btn-secondary' : 'btn-primary'}`}
          disabled={demoMode}
          title={demoMode ? '示範模式進行中,無法連線真實裝置——請先於設定頁結束示範模式' : undefined}
          onClick={() => void bluetoothService.connect()}
        >
          {demoMode ? '示範模式中' : isConnected ? '中斷連線' : '連線裝置'}
        </button>
      </div>
    </header>
  )
}
