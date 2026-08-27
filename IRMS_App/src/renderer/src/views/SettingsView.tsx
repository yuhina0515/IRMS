// renderer/views/SettingsView.tsx
import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { JOINT_PROTOCOLS } from '@shared/types'
import type { Settings } from '../store/useStore'
import { CalibrationWizard } from '../components/CalibrationWizard'
import { GlassDropdown } from '../components/GlassDropdown'
import { buildQuickZeroPatch } from '../services/calibration'
import { SCENARIOS } from '../services/simulation/scenarios'
import { deviceSimulator } from '../services/simulation/simulator'

function NumField({
  label,
  value,
  onChange,
  disabled = false
}: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <div className="field" style={{ flex: 1 }}>
      <label>{label}</label>
      <input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
  disabled = false
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}

export function SettingsView(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const rawAngles = useStore((s) => s.rawAngles)
  const isConnected = useStore((s) => s.isConnected)
  const showToast = useUiStore((s) => s.showToast)
  const [wizardOpen, setWizardOpen] = useState(false)

  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void =>
    setSettings({ [key]: value } as Partial<Settings>)

  // 校準在 Session 進行中凍結(見 store 的 CALIBRATION_KEYS):一場的資料必須
  // 全程由同一組轉換產生,sessions.calibration 那個單一快照才不是謊報。
  // 這裡把入口直接關掉,而不是讓使用者按下去之後在日誌裡才發現被忽略。
  const calibrationLocked = useStore((s) => s.session.running)
  // MTU 沒協商上去時 roll 恆為 0,快速歸零仍會寫入 roll 的 zeroRaw(寫入 0,實質無效)。
  // 功能不擋——pitch 的歸零仍然有效且有用——但提示不能再宣稱「含 Roll」。
  const linkTruncated = useStore((s) => s.linkTruncated)

  const quickZero = (): void => {
    if (!rawAngles) {
      showToast('尚無即時資料,無法歸零', 'warning')
      return
    }
    setSettings(buildQuickZeroPatch(rawAngles, settings))
    showToast(
      linkTruncated
        ? '已套用快速歸零校準(僅 Pitch:BLE 未送達 roll 資料)'
        : '已套用快速歸零校準(含 Roll)',
      linkTruncated ? 'warning' : 'success'
    )
  }

  return (
    <>
      <header className="page-header">
        <h2>Settings</h2>
        <p>感測器校準與系統參數</p>
      </header>

      <div className="panel glass" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 14 }}>Sensor Calibration 校準</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 12 }}>
          {settings.lastCalibratedAt
            ? `上次精靈校準:${new Date(settings.lastCalibratedAt).toLocaleString()}`
            : '尚未執行校準精靈——建議先跑一次,自動判斷佩戴方向並歸零'}
        </p>
        {/* 語意由「方向未驗證(暗示判定不可信)」改為「僅影響顯示」:
            roll 不參與任何達標/超限判定,外展步驟校準的是 3D 模型與圖表的正負號。
            外展是全精靈唯一需要單腳站立的步驟,對平衡受限的患者最困難——
            不該用一個看起來像判定風險的警告去催促他們反覆嘗試。 */}
        {settings.lastCalibratedAt != null &&
          (!settings.thighRollVerified || !settings.shinRollVerified) && (
            <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 12 }}>
              ℹ 內外翻(roll)顯示方向未經外展步驟驗證:
              {!settings.thighRollVerified && '大腿'}
              {!settings.thighRollVerified && !settings.shinRollVerified && '、'}
              {!settings.shinRollVerified && '小腿'}
              ——<strong>不影響達標與超限判定</strong>,僅可能讓 3D 姿態、內外翻數值與圖表的
              正負方向相反。若不需要這些顯示,可以直接略過外展步驟。
            </p>
          )}
        <button
          className="btn btn-primary"
          disabled={!isConnected || calibrationLocked}
          onClick={() => setWizardOpen(true)}
        >
          啟動校準精靈
        </button>
        {/* 停用理由必須看得見。原本只放在 title 裡:tooltip 要滑鼠停留才出現、觸控
            裝置根本叫不出來、螢幕閱讀器也不一定會念,於是按鈕看起來只是「按了沒反應」。
            App 其他地方(Record Pose、未支援協定的開始鈕)都已改用可見說明,這裡跟上。 */}
        {!isConnected && (
          <p className="field-hint" style={{ marginTop: 8 }}>
            校準需要即時感測器數值,請先於頂部連線裝置。
          </p>
        )}
        {calibrationLocked && (
          <p className="field-hint" style={{ marginTop: 8 }}>
            Session 進行中無法變更校準——這一場的資料必須全程由同一組轉換產生,
            紀錄裡才存得下一份說得通的校準快照。請先結束 Session。
          </p>
        )}

        <details className="adv-fold">
          <summary>進階手動校準(一般情況請使用精靈)</summary>
        <p className="field-hint">
          Zero 欄位是「站直姿勢當下,感測器的原始讀值」,不是要加減的偏移量——多數情況請用下方
          「快速歸零」按當下姿勢自動填入,手動輸入需先知道目前的原始讀值。
        </p>
        <div className="row">
          <NumField label="Thigh Zero (raw °)" value={settings.thighZeroRaw} onChange={(v) => set('thighZeroRaw', v)} disabled={calibrationLocked} />
          <NumField label="Shin Zero (raw °)" value={settings.shinZeroRaw} onChange={(v) => set('shinZeroRaw', v)} disabled={calibrationLocked} />
        </div>
        <div className="row" style={{ gap: 24, marginBottom: 14 }}>
          <Toggle label="Invert Thigh 反相" checked={settings.thighInvert} onChange={(v) => set('thighInvert', v)} disabled={calibrationLocked} />
          <Toggle label="Invert Shin 反相" checked={settings.shinInvert} onChange={(v) => set('shinInvert', v)} disabled={calibrationLocked} />
        </div>
        <div className="row">
          <NumField label="Thigh Roll Zero (raw °)" value={settings.thighRollZeroRaw} onChange={(v) => set('thighRollZeroRaw', v)} disabled={calibrationLocked} />
          <NumField label="Shin Roll Zero (raw °)" value={settings.shinRollZeroRaw} onChange={(v) => set('shinRollZeroRaw', v)} disabled={calibrationLocked} />
        </div>
        <div className="row" style={{ gap: 24, marginBottom: 16 }}>
          <Toggle label="Invert Thigh Roll" checked={settings.thighRollInvert} onChange={(v) => set('thighRollInvert', v)} disabled={calibrationLocked} />
          <Toggle label="Invert Shin Roll" checked={settings.shinRollInvert} onChange={(v) => set('shinRollInvert', v)} disabled={calibrationLocked} />
        </div>
        <div className="row">
          <button className="btn btn-secondary" disabled={calibrationLocked} onClick={quickZero}>
            快速歸零
          </button>
        </div>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 8 }}>
          校準完全在 App 端套用;韌體僅回傳原始角度,無需同步。
        </p>
        </details>
      </div>

      {wizardOpen && <CalibrationWizard onClose={() => setWizardOpen(false)} />}

      <div className="panel glass">
        <h3 style={{ marginBottom: 14 }}>General 一般</h3>
        <div className="field">
          <label>Default Protocol 預設協定</label>
          <GlassDropdown
            value={settings.protocol}
            onChange={(v) => set('protocol', v as Settings['protocol'])}
            options={JOINT_PROTOCOLS.map((p) => ({ value: p.value, label: p.label }))}
          />
        </div>
        <div className="row">
          <NumField
            label="Chart Max Points 圖表最大點數"
            value={settings.maxChartPoints}
            onChange={(v) => set('maxChartPoints', Math.max(10, Math.round(v)))}
          />
          <NumField
            label="Flush Interval 寫入間隔 (秒)"
            value={settings.flushIntervalSec}
            onChange={(v) => set('flushIntervalSec', Math.max(1, Math.round(v)))}
          />
        </div>
      </div>

      <DemoModePanel />
    </>
  )
}

/**
 * 示範模式面板。
 *
 * 這個模式**會出貨**,理由是不帶硬體也要能把完整流程演示給人看。代價是模擬資料
 * 真的會寫進與療程紀錄同一個資料表(demo 需要真的 sessionId 才跑得完緩衝、reps
 * 持久化、History 與 CSV)。所以防護不能只是一個 UI 標籤,必須是結構性的:
 *   - sessions.source 欄位帶 CHECK 約束,型別層設為必填(migration 7)
 *   - Session 進行中不可切換,source 在 start() 戳定一次
 *   - History 列表、分析 modal、CSV 表頭、CSV 檔名四處標示
 *   - 全域橫幅(App.tsx),讓截圖也分得出來
 *   - 一鍵清除,讓「這個資料庫乾不乾淨」是個回答得了的問題
 */
function DemoModePanel(): JSX.Element {
  const demoMode = useUiStore((s) => s.demoMode)
  const setDemoMode = useUiStore((s) => s.setDemoMode)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const showToast = useUiStore((s) => s.showToast)
  const sessionRunning = useStore((s) => s.session.running)
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id)
  const [busy, setBusy] = useState(false)

  const toggleDemo = async (): Promise<void> => {
    if (demoMode) {
      deviceSimulator.stop()
      setDemoMode(false)
      return
    }
    const ok = await requestConfirm(
      '啟用示範模式?',
      '此模式的資料由模擬器產生,不是真實量測。產生的 Session 會標記為「示範資料」並寫入資料庫,' +
        '可隨時以下方按鈕清除。示範模式期間無法連線真實裝置。'
    )
    if (!ok) return
    setDemoMode(true)
  }

  const purge = async (): Promise<void> => {
    const ok = await requestConfirm(
      '清除所有示範紀錄?',
      '將永久刪除所有標記為「示範資料」的 Session 及其感測資料。真實量測的紀錄不受影響。'
    )
    if (!ok) return
    setBusy(true)
    try {
      const { deleted } = await window.irms.sessions.purgeDemo()
      showToast(deleted > 0 ? `已清除 ${deleted} 筆示範紀錄` : '沒有示範紀錄需要清除', 'success')
    } catch (err) {
      showToast(`清除失敗:${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel glass">
      <h3 style={{ marginBottom: 14 }}>Demo Mode 示範模式</h3>
      <p style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 12 }}>
        不需要硬體即可演練完整流程:即時量表、達標判定、超限警報、校準精靈、歷史與匯出。
        資料由模擬器產生並明確標記,不會被誤認為真實量測。
      </p>

      <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label>情境</label>
          <GlassDropdown
            value={scenarioId}
            disabled={demoMode}
            options={SCENARIOS.map((s) => ({ value: s.id, label: s.label }))}
            onChange={setScenarioId}
          />
        </div>
        <button
          className={demoMode ? 'btn btn-danger-ghost' : 'btn btn-primary'}
          disabled={sessionRunning}
          onClick={() => void toggleDemo()}
        >
          {demoMode ? '結束示範模式' : '啟用示範模式'}
        </button>
        {demoMode && (
          <button
            className="btn btn-secondary"
            disabled={deviceSimulator.running}
            onClick={() => deviceSimulator.start(scenarioId)}
          >
            開始播放
          </button>
        )}
      </div>

      {/* 停用理由必須看得見,不能只是一個按不動的按鈕(沿用本檔既有慣例) */}
      {sessionRunning && (
        <p className="field-hint" style={{ marginTop: 8 }}>
          Session 進行中無法切換示範模式——一場紀錄的來源必須全程一致,否則資料庫裡會出現
          前半真實、後半模擬卻只有單一標記的 Session。請先結束 Session。
        </p>
      )}

      <hr style={{ margin: '16px 0', border: 0, borderTop: '1px solid var(--border)' }} />
      <button className="btn btn-danger-ghost" disabled={busy} onClick={() => void purge()}>
        清除所有示範紀錄
      </button>
      <p className="field-hint" style={{ marginTop: 8 }}>
        示範紀錄刻意不從歷史列表隱藏——藏起來的資料在任何一份資料庫副本裡依然存在,只是更難察覺。
        這個按鈕讓「資料庫裡還有沒有假資料」變成一個回答得了的問題。
      </p>
    </div>
  )
}
