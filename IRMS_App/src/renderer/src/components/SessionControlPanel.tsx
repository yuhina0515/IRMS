// renderer/components/SessionControlPanel.tsx
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { sessionController } from '../services/sessionController'
import { GlassDropdown } from './GlassDropdown'
import {
  HOLD_TIME_BOUND,
  TARGET_ANGLE_BOUND,
  TOLERANCE_BOUND,
  clampHoldTimeMs,
  clampTargetAngle,
  clampTolerance
} from '@shared/validation'

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
        <GlassDropdown
          value={selectedActionId != null ? String(selectedActionId) : ''}
          disabled={running}
          placeholder={filtered.length === 0 ? '本協定尚無動作' : '請選擇動作'}
          onChange={(v) => selectAction(v ? Number(v) : null)}
          options={filtered.map((a) => ({ value: String(a.id), label: a.name }))}
        />
      </div>

      <div className="row">
        {/* 鉗制在 blur 而非每次按鍵:打字打到一半的中間值(例如輸入 100 的第一個 1)
            不該被跳改。真正的保證在 sessionController.currentConfig(),引擎永遠拿不到
            超出界限的參數。 */}
        <div className="field" style={{ flex: 1 }}>
          <label>Target (°)</label>
          <input
            type="number"
            min={TARGET_ANGLE_BOUND.min}
            max={TARGET_ANGLE_BOUND.max}
            value={params.targetAngle}
            disabled={running}
            onChange={(e) => setParams({ targetAngle: parseFloat(e.target.value) })}
            onBlur={(e) => setParams({ targetAngle: clampTargetAngle(parseFloat(e.target.value)) })}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Tolerance (±°)</label>
          <input
            type="number"
            min={TOLERANCE_BOUND.min}
            max={TOLERANCE_BOUND.max}
            value={params.tolerance}
            disabled={running}
            onChange={(e) => setParams({ tolerance: parseFloat(e.target.value) })}
            onBlur={(e) => setParams({ tolerance: clampTolerance(parseFloat(e.target.value)) })}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Hold (ms)</label>
          <input
            type="number"
            min={HOLD_TIME_BOUND.min}
            max={HOLD_TIME_BOUND.max}
            step={100}
            value={params.holdTimeMs}
            disabled={running}
            onChange={(e) => setParams({ holdTimeMs: parseInt(e.target.value, 10) })}
            onBlur={(e) => setParams({ holdTimeMs: clampHoldTimeMs(parseInt(e.target.value, 10)) })}
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
