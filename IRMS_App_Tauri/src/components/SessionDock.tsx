// renderer/components/SessionDock.tsx
// UI v3 bottom dock of the live sheet (PROPOSAL §4/§5). Before a session: action + prescription
// editor and Start. During a session: completed reps, current hold, elapsed time, alarm mute and
// End — prescription becomes read-only. Replaces SessionControlPanel with the same guards.
import { useGlobalShortcut } from '../hooks/useGlobalShortcut'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { sessionController } from '../services/sessionController'
import { bluetoothService } from '../services/bluetooth'
import { firmwareUpdateBusy, useFirmwareAutoStore } from '../services/firmwareAutoUpdate'
import { GlassDropdown } from './GlassDropdown'
import { isProtocolSupported } from '@shared/types'
import {
  HOLD_TIME_BOUND,
  TARGET_ANGLE_BOUND,
  TOLERANCE_BOUND,
  clampHoldTimeMs,
  clampTargetAngle,
  clampTolerance
} from '@shared/validation'

function formatClock(sec: number): string {
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}

/** Why Start is unavailable, in the order a user must fix things; null = can start. */
export function startBlocker(s: {
  protocolOk: boolean
  fwBusy: boolean
  isConnected: boolean
  hasAction: boolean
  calibrated: boolean
  simulated: boolean
  running: boolean
}): string | null {
  if (s.running) return '療程進行中'
  if (!s.protocolOk) return '此協定尚未支援'
  if (s.fwBusy) return '韌體更新中'
  if (!s.isConnected) return '請先連線裝置'
  if (!s.hasAction) return '請先選擇動作'
  // 2026-09-25 使用者裁定:未校準不得開始。實測證明角度正確性取決於校準
  // (衣物墊高讓感測器不平行);示範模式的模擬姿態本身就在校準座標系,不受此限。
  if (!s.calibrated && !s.simulated) return '請先完成校準'
  return null
}

export function SessionDock({ onCalibrate }: { onCalibrate: () => void }): JSX.Element {
  const isConnected = useStore((s) => s.isConnected)
  const params = useStore((s) => s.params)
  const setParams = useStore((s) => s.setParams)
  const protocol = useStore((s) => s.settings.protocol)
  const calibrated = useStore((s) => s.settings.lastCalibratedAt != null)
  const actions = useStore((s) => s.customActions)
  const selectedActionId = useStore((s) => s.selectedActionId)
  const selectAction = useStore((s) => s.selectAction)
  const session = useStore((s) => s.session)
  const showToast = useUiStore((s) => s.showToast)
  const fwStatus = useFirmwareAutoStore((s) => s.status)

  const filtered = actions.filter((a) => a.protocol === protocol)
  const running = session.running
  const protocolOk = isProtocolSupported(protocol)
  const fwBusy = firmwareUpdateBusy(fwStatus)
  const blocker = startBlocker({
    protocolOk,
    fwBusy,
    isConnected,
    hasAction: selectedActionId != null,
    calibrated,
    simulated: bluetoothService.isSimulated,
    running
  })
  const canStart = blocker == null

  const handleStart = async (): Promise<void> => {
    try {
      await sessionController.startSession()
      showToast('療程已開始', 'success')
    } catch {
      showToast('無法開始療程', 'error')
    }
  }
  const handleEnd = async (): Promise<void> => {
    // 早退時不得謊報「已儲存」:雙擊,或與斷線自動收尾競爭時,這裡其實什麼也沒做
    const ended = await sessionController.endSession()
    if (ended) showToast('療程已結束並儲存', 'success')
  }

  // Ctrl/Cmd+Enter:與按鈕走同一個守衛(handler 為 null 時不掛 listener)
  useGlobalShortcut({ key: 'Enter' }, running ? () => void handleEnd() : canStart ? () => void handleStart() : null)

  if (running) {
    const holdSec = (session.holdProgress / 100) * (params.holdTimeMs / 1000)
    return (
      <div className="v3-dock running">
        <div className="v3-dock-stat">
          <span className="v3-dock-label">已完成</span>
          <span className="v3-dock-value">
            {session.reps}
            <small> 次</small>
          </span>
        </div>
        <div className="v3-dock-stat">
          <span className="v3-dock-label">本次保持</span>
          <span className="v3-dock-value">
            {holdSec.toFixed(1)}
            <small> / {(params.holdTimeMs / 1000).toFixed(1)} 秒</small>
          </span>
          <span className="v3-hold-bar" aria-hidden>
            <span style={{ width: `${Math.min(100, session.holdProgress)}%` }} />
          </span>
        </div>
        <div className="v3-dock-stat">
          <span className="v3-dock-label">療程時間</span>
          <span className="v3-dock-value">{formatClock(session.elapsedSec)}</span>
        </div>
        <div className="v3-dock-actions">
          {session.alarmActive && (
            // 蜂鳴器綁在患者腿上,必須有軟體開關;靜音只暫停聲音,仍超限會自動重新鳴響
            <button className="btn btn-secondary v3-btn-lg" onClick={() => sessionController.silenceAlarm()}>
              靜音 30 秒
            </button>
          )}
          <button className="btn btn-primary v3-btn-lg" onClick={() => void handleEnd()}>
            結束療程
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="v3-dock">
      <div className="v3-dock-field v3-dock-action">
        <label htmlFor="dock-action">動作</label>
        <GlassDropdown
          value={selectedActionId != null ? String(selectedActionId) : ''}
          placeholder={filtered.length === 0 ? '本協定尚無動作' : '請選擇動作'}
          onChange={(v) => selectAction(v ? Number(v) : null)}
          options={filtered.map((a) => ({ value: String(a.id), label: a.name }))}
        />
      </div>
      {/* 鉗制在 blur 而非每次按鍵;真正的保證在 sessionController.currentConfig() */}
      <div className="v3-dock-field">
        <label htmlFor="dock-target">目標 (°)</label>
        <input
          id="dock-target"
          type="number"
          min={TARGET_ANGLE_BOUND.min}
          max={TARGET_ANGLE_BOUND.max}
          value={params.targetAngle}
          onChange={(e) => setParams({ targetAngle: parseFloat(e.target.value) })}
          onBlur={(e) => setParams({ targetAngle: clampTargetAngle(parseFloat(e.target.value)) })}
        />
      </div>
      <div className="v3-dock-field">
        <label htmlFor="dock-tol">容許 (±°)</label>
        <input
          id="dock-tol"
          type="number"
          min={TOLERANCE_BOUND.min}
          max={TOLERANCE_BOUND.max}
          value={params.tolerance}
          onChange={(e) => setParams({ tolerance: parseFloat(e.target.value) })}
          onBlur={(e) => setParams({ tolerance: clampTolerance(parseFloat(e.target.value)) })}
        />
      </div>
      <div className="v3-dock-field">
        <label htmlFor="dock-hold">保持 (秒)</label>
        <input
          id="dock-hold"
          type="number"
          min={HOLD_TIME_BOUND.min / 1000}
          max={HOLD_TIME_BOUND.max / 1000}
          step={0.1}
          value={params.holdTimeMs / 1000}
          onChange={(e) => setParams({ holdTimeMs: Math.round(parseFloat(e.target.value) * 1000) })}
          onBlur={(e) => setParams({ holdTimeMs: clampHoldTimeMs(Math.round(parseFloat(e.target.value) * 1000)) })}
        />
      </div>
      <div className="v3-dock-actions">
        {blocker === '請先完成校準' ? (
          <button className="btn btn-primary v3-btn-lg" onClick={onCalibrate}>
            開始校準
          </button>
        ) : (
          <button className="btn btn-primary v3-btn-lg" disabled={!canStart} onClick={() => void handleStart()}>
            {canStart
              ? '開始療程'
              : blocker === '韌體更新中' && fwStatus.phase === 'updating'
                ? `韌體更新中 ${fwStatus.percent ?? 0}%`
                : blocker}
          </button>
        )}
      </div>
    </div>
  )
}
