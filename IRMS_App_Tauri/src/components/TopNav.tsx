// renderer/components/TopNav.tsx
// UI v3 top navigation: brand, four text tabs, device status + connect. Replaces the
// beta8 command rail + command bar (PROPOSAL §2: horizontal navigation gives the pose stage
// the width the rail used to take).
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { bluetoothService } from '../services/bluetooth'
import { useGlobalShortcut } from '../hooks/useGlobalShortcut'
import { useToolModules } from '../views/ToolsView'
import logoIcon from '../assets/logo-icon-only.png'
import { connectionStatusText, useT } from '../i18n'

/** Tab order; labels come from the `nav` dictionary. */
export const NAV_ITEMS = ['dashboard', 'actions', 'history', 'tools', 'settings'] as const

export function TopNav(): JSX.Element {
  const view = useUiStore((s) => s.view)
  const hasTools = useToolModules().length > 0
  const setView = useUiStore((s) => s.setView)
  const demoMode = useUiStore((s) => s.demoMode)
  const isConnected = useStore((s) => s.isConnected)
  const connectionStatus = useStore((s) => s.connectionStatus)
  const reconnect = useStore((s) => s.reconnect)
  const m = useT()

  useGlobalShortcut({ key: 'k' }, demoMode ? null : () => void bluetoothService.connect())

  return (
    <header className="v3-topnav">
      <div className="v3-brand" aria-label="IRMS">
        <img src={logoIcon} alt="" />
        IRMS
      </div>
      <nav className="v3-tabs" aria-label={m.nav.ariaLabel}>
        {NAV_ITEMS.filter((id) => id !== 'tools' || hasTools || view === 'tools').map((id) => (
          <button
            key={id}
            className="v3-tab"
            aria-current={view === id ? 'page' : undefined}
            onClick={() => setView(id)}
          >
            {m.nav[id]}
          </button>
        ))}
      </nav>
      <div className="v3-topnav-right">
        <span className="v3-conn" role="status">
          <span className={`v3-conn-dot${isConnected ? ' on' : ''}${reconnect ? ' retrying' : ''}`} aria-hidden />
          {reconnect
            ? m.connection.reconnecting(reconnect)
            : isConnected
              ? m.topNav.connected
              : connectionStatusText(m, connectionStatus)}
        </span>
        <button
          className={`btn btn-sm ${isConnected ? 'btn-secondary' : 'btn-primary'}`}
          disabled={demoMode}
          title={demoMode ? m.topNav.demoTooltip : undefined}
          onClick={() => void bluetoothService.connect()}
        >
          {demoMode ? m.common.demoModeActive : isConnected ? m.common.disconnect : m.common.connectDevice}
        </button>
      </div>
    </header>
  )
}
