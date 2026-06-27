// renderer/views/SettingsView.tsx
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { bluetoothService } from '../services/bluetooth'
import { buildSyncCommand } from '@shared/protocol'
import { JOINT_PROTOCOLS } from '@shared/types'
import type { Settings } from '../store/useStore'

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

  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void =>
    setSettings({ [key]: value } as Partial<Settings>)

  const quickZero = (): void => {
    if (!rawAngles) {
      showToast('尚無即時資料,無法歸零', 'warning')
      return
    }
    setSettings({
      thighOffset: -(rawAngles.thigh * (settings.thighInvert ? -1 : 1)),
      shinOffset: -(rawAngles.shin * (settings.shinInvert ? -1 : 1))
    })
    showToast('已套用快速歸零校準', 'success')
  }

  const syncToEsp = (): void => {
    void bluetoothService.send(buildSyncCommand(settings.thighOffset, settings.shinOffset))
    showToast('設定已同步至硬體', 'success')
  }

  return (
    <>
      <header className="page-header">
        <h2>Settings</h2>
        <p>感測器校準與系統參數</p>
      </header>

      <div className="panel glass" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 14 }}>Sensor Calibration 校準</h3>
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
          <button className="btn btn-primary" disabled={!isConnected} onClick={syncToEsp}>
            同步至 ESP32
          </button>
        </div>
      </div>

      <div className="panel glass">
        <h3 style={{ marginBottom: 14 }}>General 一般</h3>
        <div className="field">
          <label>Default Protocol 預設協定</label>
          <select value={settings.protocol} onChange={(e) => set('protocol', e.target.value as Settings['protocol'])}>
            {JOINT_PROTOCOLS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
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
