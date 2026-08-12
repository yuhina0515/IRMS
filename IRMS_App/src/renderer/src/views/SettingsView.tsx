// renderer/views/SettingsView.tsx
import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { JOINT_PROTOCOLS } from '@shared/types'
import type { Settings } from '../store/useStore'
import { CalibrationWizard } from '../components/CalibrationWizard'
import { GlassDropdown } from '../components/GlassDropdown'
import { buildQuickZeroPatch } from '../services/calibration'

function NumField({
  label,
  value,
  onChange
}: {
  label: string
  value: number
  onChange: (v: number) => void
}): JSX.Element {
  return (
    <div className="field" style={{ flex: 1 }}>
      <label>{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
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

  const quickZero = (): void => {
    if (!rawAngles) {
      showToast('尚無即時資料,無法歸零', 'warning')
      return
    }
    setSettings(buildQuickZeroPatch(rawAngles, settings))
    showToast('已套用快速歸零校準(含 Roll)', 'success')
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
        <button className="btn btn-primary" disabled={!isConnected} onClick={() => setWizardOpen(true)}>
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

        <details className="adv-fold">
          <summary>進階手動校準(一般情況請使用精靈)</summary>
        <div className="row">
          <NumField label="Thigh Offset (°)" value={settings.thighOffset} onChange={(v) => set('thighOffset', v)} />
          <NumField label="Shin Offset (°)" value={settings.shinOffset} onChange={(v) => set('shinOffset', v)} />
        </div>
        <div className="row" style={{ gap: 24, marginBottom: 14 }}>
          <Toggle label="Invert Thigh 反相" checked={settings.thighInvert} onChange={(v) => set('thighInvert', v)} />
          <Toggle label="Invert Shin 反相" checked={settings.shinInvert} onChange={(v) => set('shinInvert', v)} />
        </div>
        <div className="row">
          <NumField label="Thigh Roll Offset (°)" value={settings.thighRollOffset} onChange={(v) => set('thighRollOffset', v)} />
          <NumField label="Shin Roll Offset (°)" value={settings.shinRollOffset} onChange={(v) => set('shinRollOffset', v)} />
        </div>
        <div className="row" style={{ gap: 24, marginBottom: 16 }}>
          <Toggle label="Invert Thigh Roll" checked={settings.thighRollInvert} onChange={(v) => set('thighRollInvert', v)} />
          <Toggle label="Invert Shin Roll" checked={settings.shinRollInvert} onChange={(v) => set('shinRollInvert', v)} />
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={quickZero}>
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
    </>
  )
}
