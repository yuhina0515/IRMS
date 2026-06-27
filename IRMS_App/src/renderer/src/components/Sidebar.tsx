// renderer/components/Sidebar.tsx
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { bluetoothService } from '../services/bluetooth'

const NAV: { id: 'dashboard' | 'actions' | 'history' | 'settings'; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'actions', label: 'Actions' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' }
]

export function Sidebar(): JSX.Element {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  const isConnected = useStore((s) => s.isConnected)
  const statusText = useStore((s) => s.statusText)
  const logs = useStore((s) => s.logs)

  return (
    <aside className="sidebar glass">
      <button className="nav-item" onClick={toggleSidebar} title="收合側欄" style={{ alignSelf: 'flex-start' }}>
        ☰
      </button>

      <div className="logo">
        <h1>
          IRMS<span>.</span>
        </h1>
        <p>Rehab Dashboard</p>
      </div>

      <nav className="nav">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-item${view === n.id ? ' active' : ''}`}
            onClick={() => setView(n.id)}
          >
            <span>{n.label}</span>
          </button>
        ))}
      </nav>

      <div className="conn">
        <span className={`dot${isConnected ? ' on' : ''}`} />
        <span className="conn-text">{statusText}</span>
      </div>

      <button
        className={`btn ${isConnected ? 'btn-danger' : 'btn-primary'} btn-block`}
        onClick={() => void bluetoothService.connect()}
      >
        {isConnected ? 'Disconnect' : 'Connect Device'}
      </button>

      <div className="log-panel">{logs.length ? logs.join('\n') : '[System initialized]'}</div>
    </aside>
  )
}
