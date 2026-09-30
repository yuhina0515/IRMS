// components/TelemetryPanel.tsx
// 設定頁的「即時遙測上傳」面板。任何使用者都可以自行選擇開啟;預設關閉。
// 開關打開前先讓 Rust 驗證網址,驗證失敗就不存成開啟狀態——避免設定頁顯示
// 「已開啟」但實際上什麼都沒在傳。
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { configureTelemetry, getTelemetryStatus, type TelemetryStatus } from '../services/telemetry'
import { useT } from '../i18n'

const STATUS_POLL_MS = 2000

export function TelemetryPanel(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const showToast = useUiStore((s) => s.showToast)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const [endpoint, setEndpoint] = useState(settings.telemetryEndpoint)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<TelemetryStatus | null>(null)
  const enabled = settings.telemetryEnabled
  const m = useT()

  useEffect(() => {
    let alive = true
    const poll = (): void => {
      getTelemetryStatus()
        .then((s) => alive && setStatus(s))
        .catch(() => {})
    }
    poll()
    const timer = setInterval(poll, STATUS_POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const toggle = async (next: boolean): Promise<void> => {
    if (!next) {
      setSettings({ telemetryEnabled: false })
      return
    }
    // 動作名稱是使用者自己取的自由文字,會隨 session_start 一起上傳——這是唯一可能夾帶
    // 個人資料的欄位,所以在開啟的當下明確提醒,而不是只寫在面板說明裡。
    const agreed = await requestConfirm(m.telemetry.confirmTitle, m.telemetry.confirmBody)
    if (!agreed) return
    setBusy(true)
    try {
      await configureTelemetry({ telemetryEnabled: true, telemetryEndpoint: endpoint })
      setSettings({ telemetryEnabled: true, telemetryEndpoint: endpoint.trim() })
      showToast(m.telemetry.enabledToast, 'success')
    } catch (err) {
      showToast(String(err), 'warning')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel glass">
      <h3 style={{ marginBottom: 14 }}>{m.telemetry.heading}</h3>
      <p className="text-text-muted text-sm mb-3">{m.telemetry.intro}</p>
      <ul className="text-text-muted text-sm mb-3" style={{ paddingLeft: 18, listStyle: 'disc' }}>
        <li>{m.telemetry.sent}</li>
        <li>{m.telemetry.notSent}</li>
        <li>{m.telemetry.retention}</li>
      </ul>
      <label className="switch">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => void toggle(e.target.checked)}
        />
        {m.telemetry.toggle}
      </label>
      {status?.enabled && (
        <p className="field-hint" style={{ marginTop: 8 }} role="status">
          {m.telemetry.status({ sent: status.sent, pending: status.pending })}
          {status.dropped > 0 && m.telemetry.dropped({ n: status.dropped })}
          {status.lastError && m.telemetry.lastError({ error: status.lastError })}
          <br />
          {m.telemetry.runId({ id: status.runId })}
        </p>
      )}
      <details style={{ marginTop: 12 }}>
        <summary className="text-sm text-text-muted" style={{ cursor: 'pointer' }}>
          {m.common.advanced}
        </summary>
        <div className="field" style={{ marginTop: 8 }}>
          <label htmlFor="telemetry-endpoint">{m.telemetry.endpoint}</label>
          <input
            id="telemetry-endpoint"
            type="url"
            value={endpoint}
            disabled={enabled || busy}
            onChange={(e) => setEndpoint(e.target.value)}
          />
          <p className="field-hint" style={{ marginTop: 6 }}>
            {m.telemetry.endpointHint}
          </p>
        </div>
      </details>
    </div>
  )
}
