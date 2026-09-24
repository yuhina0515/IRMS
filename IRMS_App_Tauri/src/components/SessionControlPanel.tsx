// 療程控制:指定動作、即時參數、計時與開始/結束。開始/結束的條件集中在 useSessionActions,
// 讓按鈕、專注模式的結束鈕與 Ctrl+Enter 快捷鍵走完全相同的守衛——快捷鍵若自己再判斷一次,
// 兩邊遲早會分歧,而分歧的方向通常是快捷鍵比較寬鬆(例如繞過未支援協定的封鎖)。
import { isProtocolSupported } from '@shared/types'
import {
  HOLD_TIME_BOUND,
  TARGET_ANGLE_BOUND,
  TOLERANCE_BOUND,
  clampHoldTimeMs,
  clampTargetAngle,
  clampTolerance
} from '@shared/validation'
import { useT } from '../i18n'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { sessionController } from '../services/sessionController'
import { Dropdown } from './Dropdown'

function formatClock(sec: number): string {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0')
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export interface SessionActions {
  running: boolean
  canStart: boolean
  protocolOk: boolean
  isConnected: boolean
  start: () => Promise<void>
  end: () => Promise<void>
}

export function useSessionActions(): SessionActions {
  const t = useT()
  const isConnected = useStore((s) => s.isConnected)
  const protocol = useStore((s) => s.settings.protocol)
  const selectedActionId = useStore((s) => s.selectedActionId)
  const running = useStore((s) => s.session.running)
  const showToast = useUiStore((s) => s.showToast)
  // elbow / shoulder 的判定管線尚未泛化(仍讀腿部感測器),擋在這裡而不是讓它產生
  // 一場資料與標籤對不上的「肩關節」紀錄
  const protocolOk = isProtocolSupported(protocol)
  const canStart = isConnected && selectedActionId != null && !running && protocolOk

  return {
    running,
    canStart,
    protocolOk,
    isConnected,
    start: async () => {
      try {
        await sessionController.startSession()
        showToast(t.session.started, 'success')
      } catch {
        showToast(t.session.startFailed, 'error')
      }
    },
    end: async () => {
      // 早退時不得謊報「已儲存」:雙擊,或與斷線自動收尾競爭時,這裡其實什麼也沒做
      const ended = await sessionController.endSession()
      if (ended) showToast(t.session.endedSaved, 'success')
    }
  }
}

export function SessionButton({ actions, size = 'lg' }: { actions: SessionActions; size?: 'lg' | 'md' }): JSX.Element {
  const t = useT()
  const sizeClass = size === 'lg' ? ' btn--lg' : ''
  if (actions.running) {
    return (
      <button type="button" className={`btn btn--danger-ghost btn--block${sizeClass}`} onClick={() => void actions.end()}>
        {t.session.end}
      </button>
    )
  }
  return (
    <button
      type="button"
      className={`btn btn--primary btn--block${sizeClass}`}
      disabled={!actions.canStart}
      title={t.session.shortcutHint}
      onClick={() => void actions.start()}
    >
      {!actions.protocolOk ? t.session.unsupported : actions.isConnected ? t.session.start : t.session.connectFirst}
    </button>
  )
}

export function SessionControlPanel({ actions }: { actions: SessionActions }): JSX.Element {
  const t = useT()
  const params = useStore((s) => s.params)
  const setParams = useStore((s) => s.setParams)
  const protocol = useStore((s) => s.settings.protocol)
  const allActions = useStore((s) => s.customActions)
  const selectedActionId = useStore((s) => s.selectedActionId)
  const selectAction = useStore((s) => s.selectAction)
  const elapsedSec = useStore((s) => s.session.elapsedSec)
  const filtered = allActions.filter((a) => a.protocol === protocol)
  const { running } = actions

  return (
    <>
      <div className="field">
        <label className="field__label" htmlFor="session-action">
          {t.session.action}
        </label>
        <Dropdown
          id="session-action"
          value={selectedActionId != null ? String(selectedActionId) : ''}
          disabled={running}
          placeholder={filtered.length === 0 ? t.session.noActionsInProtocol : t.session.chooseAction}
          onChange={(v) => selectAction(v ? Number(v) : null)}
          options={filtered.map((a) => ({ value: String(a.id), label: a.name }))}
        />
      </div>

      {/* 鉗制在 blur 而非每次按鍵:打字打到一半的中間值不該被跳改。真正的保證在
          sessionController.currentConfig(),引擎永遠拿不到超出界限的參數。 */}
      <div className="fields">
        <label className="field">
          <span className="field__label">{t.session.target}</span>
          <input
            className="input"
            type="number"
            min={TARGET_ANGLE_BOUND.min}
            max={TARGET_ANGLE_BOUND.max}
            value={params.targetAngle}
            disabled={running}
            onChange={(e) => setParams({ targetAngle: parseFloat(e.target.value) })}
            onBlur={(e) => setParams({ targetAngle: clampTargetAngle(parseFloat(e.target.value)) })}
          />
        </label>
        <label className="field">
          <span className="field__label">{t.session.tolerance}</span>
          <input
            className="input"
            type="number"
            min={TOLERANCE_BOUND.min}
            max={TOLERANCE_BOUND.max}
            value={params.tolerance}
            disabled={running}
            onChange={(e) => setParams({ tolerance: parseFloat(e.target.value) })}
            onBlur={(e) => setParams({ tolerance: clampTolerance(parseFloat(e.target.value)) })}
          />
        </label>
        <label className="field">
          <span className="field__label">{t.session.holdMs}</span>
          <input
            className="input"
            type="number"
            min={HOLD_TIME_BOUND.min}
            max={HOLD_TIME_BOUND.max}
            step={100}
            value={params.holdTimeMs}
            disabled={running}
            onChange={(e) => setParams({ holdTimeMs: parseInt(e.target.value, 10) })}
            onBlur={(e) => setParams({ holdTimeMs: clampHoldTimeMs(parseInt(e.target.value, 10)) })}
          />
        </label>
      </div>

      <div className="side__foot">
        {running && (
          <div className="side__clock">
            <span className="text-dim">{t.session.recording}</span>
            <span className="num">{formatClock(elapsedSec)}</span>
          </div>
        )}
        <SessionButton actions={actions} />
        {!running && !actions.protocolOk && <p className="field__hint">{t.session.unsupportedHint}</p>}
      </div>
    </>
  )
}
