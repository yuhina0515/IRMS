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
import { formatNumber, useLocale, useT, type Messages } from '../i18n'

function formatClock(sec: number): string {
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}

export type StartBlocker = keyof Messages['sessionDock']['blocker']

/** Why Start is unavailable, in the order a user must fix things; null = can start. */
export function startBlocker(s: {
  protocolOk: boolean
  fwBusy: boolean
  isConnected: boolean
  hasAction: boolean
  calibrated: boolean
  simulated: boolean
  running: boolean
}): StartBlocker | null {
  if (s.running) return 'running'
  if (!s.protocolOk) return 'protocolUnsupported'
  if (s.fwBusy) return 'firmwareUpdating'
  if (!s.isConnected) return 'notConnected'
  if (!s.hasAction) return 'noAction'
  // 2026-09-25 使用者裁定:未校準不得開始。實測證明角度正確性取決於校準
  // (衣物墊高讓感測器不平行);示範模式的模擬姿態本身就在校準座標系,不受此限。
  if (!s.calibrated && !s.simulated) return 'notCalibrated'
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
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const fwStatus = useFirmwareAutoStore((s) => s.status)
  const m = useT()
  const locale = useLocale()

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
    // 個人角度範圍沒有預設值:未量測時判定不做任何角度警示,開始前提醒一次(仍可開始)
    if (useStore.getState().angleRange == null && !bluetoothService.isSimulated) {
      const ok = await requestConfirm(m.clinical.noRangeTitle, m.clinical.noRangeBody)
      if (!ok) return
    }
    try {
      await sessionController.startSession()
      showToast(m.sessionDock.started, 'success')
    } catch {
      showToast(m.sessionDock.startFailed, 'error')
    }
  }
  const handleEnd = async (): Promise<void> => {
    // 早退時不得謊報「已儲存」:雙擊,或與斷線自動收尾競爭時,這裡其實什麼也沒做
    const ended = await sessionController.endSession()
    if (ended) showToast(m.sessionDock.ended, 'success')
  }

  // Ctrl/Cmd+Enter:與按鈕走同一個守衛(handler 為 null 時不掛 listener)
  useGlobalShortcut({ key: 'Enter' }, running ? () => void handleEnd() : canStart ? () => void handleStart() : null)

  if (running) {
    const holdSec = (session.holdProgress / 100) * (params.holdTimeMs / 1000)
    return (
      <div className="v3-dock running">
        <div className="v3-dock-stat">
          <span className="v3-dock-label">{m.sessionDock.completed}</span>
          <span className="v3-dock-value">
            {session.reps}
            <small>{m.sessionDock.repsUnit}</small>
          </span>
        </div>
        <div className="v3-dock-stat">
          <span className="v3-dock-label">{m.sessionDock.currentHold}</span>
          <span className="v3-dock-value">
            {formatNumber(locale, holdSec)}
            <small>{m.sessionDock.holdOf({ total: formatNumber(locale, params.holdTimeMs / 1000) })}</small>
          </span>
          <span className="v3-hold-bar" aria-hidden>
            <span style={{ width: `${Math.min(100, session.holdProgress)}%` }} />
          </span>
        </div>
        <div className="v3-dock-stat">
          <span className="v3-dock-label">{m.sessionDock.sessionTime}</span>
          <span className="v3-dock-value">{formatClock(session.elapsedSec)}</span>
        </div>
        <div className="v3-dock-actions">
          <button className="btn btn-primary v3-btn-lg" onClick={() => void handleEnd()}>
            {m.sessionDock.end}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="v3-dock">
      <div className="v3-dock-field v3-dock-action">
        <label htmlFor="dock-action">{m.sessionDock.action}</label>
        <GlassDropdown
          value={selectedActionId != null ? String(selectedActionId) : ''}
          placeholder={filtered.length === 0 ? m.sessionDock.noActions : m.sessionDock.selectAction}
          onChange={(v) => selectAction(v ? Number(v) : null)}
          options={filtered.map((a) => ({ value: String(a.id), label: a.name }))}
        />
      </div>
      {/* 鉗制在 blur 而非每次按鍵;真正的保證在 sessionController.currentConfig() */}
      <div className="v3-dock-field">
        <label htmlFor="dock-target">{m.sessionDock.target}</label>
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
        <label htmlFor="dock-tol">{m.sessionDock.tolerance}</label>
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
        <label htmlFor="dock-hold">{m.sessionDock.hold}</label>
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
        {blocker === 'notCalibrated' ? (
          <button className="btn btn-primary v3-btn-lg" onClick={onCalibrate}>
            {m.sessionDock.calibrate}
          </button>
        ) : (
          <button className="btn btn-primary v3-btn-lg" disabled={!canStart} onClick={() => void handleStart()}>
            {blocker == null
              ? m.sessionDock.start
              : blocker === 'firmwareUpdating' && fwStatus.phase === 'updating'
                ? m.sessionDock.firmwareUpdatingPct({ pct: fwStatus.percent ?? 0 })
                : m.sessionDock.blocker[blocker]}
          </button>
        )}
      </div>
    </div>
  )
}
