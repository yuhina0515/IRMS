// renderer/components/SessionControlPanel.tsx
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { sessionController } from '../services/sessionController'

function formatClock(sec: number): string {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0')
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function SessionControlPanel(): JSX.Element {
  const isConnected = useStore((s) => s.isConnected)
  const params = useStore((s) => s.params)
  const setParams = useStore((s) => s.setParams)
  const protocol = useStore((s) => s.settings.protocol)
  const actions = useStore((s) => s.customActions)
  const selectedActionId = useStore((s) => s.selectedActionId)
  const selectAction = useStore((s) => s.selectAction)
  const session = useStore((s) => s.session)
  const showToast = useUiStore((s) => s.showToast)

  const filtered = actions.filter((a) => a.protocol === protocol)
  const running = session.running
  const canStart = isConnected && selectedActionId != null && !running

  const handleStart = async (): Promise<void> => {
    try {
      await sessionController.startSession()
      showToast('Session started.', 'success')
    } catch {
      showToast('Failed to start session.', 'error')
    }
  }

  const handleEnd = async (): Promise<void> => {
    await sessionController.endSession()
    showToast('Session ended and saved.', 'success')
  }

  return (
    <div className="panel glass">
      <div className="field">
        <label>Designated Action (指定動作)</label>
        <select
          value={selectedActionId ?? ''}
          disabled={running}
          onChange={(e) => selectAction(e.target.value ? Number(e.target.value) : null)}
        >
          {filtered.length === 0 && <option value="">本協定尚無動作</option>}
          {filtered.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Target (°)</label>
          <input
            type="number"
            value={params.targetAngle}
            disabled={running}
            onChange={(e) => setParams({ targetAngle: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Tolerance (±°)</label>
          <input
            type="number"
            value={params.tolerance}
            disabled={running}
            onChange={(e) => setParams({ tolerance: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Hold (ms)</label>
          <input
            type="number"
            value={params.holdTimeMs}
            disabled={running}
            onChange={(e) => setParams({ holdTimeMs: parseInt(e.target.value, 10) || 0 })}
          />
        </div>
      </div>

      {running ? (
        <>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ color: 'var(--text-dim)' }}>Recording</span>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatClock(session.elapsedSec)}</strong>
          </div>
          <button className="btn btn-danger btn-block" onClick={() => void handleEnd()}>
            End Session
          </button>
        </>
      ) : (
        <button className="btn btn-primary btn-block" disabled={!canStart} onClick={() => void handleStart()}>
          {isConnected ? 'Start Session' : 'Connect device first'}
        </button>
      )}
    </div>
  )
}
