// components/TelemetryPanel.tsx
// 設定頁的「即時遙測上傳」面板。任何使用者都可以自行選擇開啟;預設關閉。
// 開關打開前先讓 Rust 驗證網址,驗證失敗就不存成開啟狀態——避免設定頁顯示
// 「已開啟」但實際上什麼都沒在傳。
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { configureTelemetry, getTelemetryStatus, type TelemetryStatus } from '../services/telemetry'

const STATUS_POLL_MS = 2000

export function TelemetryPanel(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const showToast = useUiStore((s) => s.showToast)
  const [endpoint, setEndpoint] = useState(settings.telemetryEndpoint)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<TelemetryStatus | null>(null)
  const enabled = settings.telemetryEnabled

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
    setBusy(true)
    try {
      await configureTelemetry({ telemetryEnabled: true, telemetryEndpoint: endpoint })
      setSettings({ telemetryEnabled: true, telemetryEndpoint: endpoint.trim() })
      showToast('已開啟即時遙測上傳', 'success')
    } catch (err) {
      showToast(String(err), 'warning')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel glass">
      <h3 style={{ marginBottom: 14 }}>Telemetry 即時遙測上傳</h3>
      <p className="text-text-muted text-sm mb-3">
        開啟後,App 會把即時資料上傳到 IRMS 開發團隊的伺服器,用來分析感測器與連線問題、改善
        App。你可以隨時關閉,關閉時尚未送出的資料會直接捨棄。
      </p>
      <ul className="text-text-muted text-sm mb-3" style={{ paddingLeft: 18, listStyle: 'disc' }}>
        <li>會上傳:感測器原始角度封包、連線/斷線狀態、韌體更新狀態、訓練開始與結束(含動作名稱、目標參數、校準參數)、App 日誌。</li>
        <li>不會上傳:姓名、帳號、電腦名稱或其他可直接識別你的資料。每次啟動 App 使用一組新的隨機 ID。</li>
        <li>伺服器保留 90 天後自動刪除。本機紀錄照常保存,上傳失敗不影響量測。</li>
      </ul>
      <label className="switch">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => void toggle(e.target.checked)}
        />
        上傳即時遙測資料
      </label>
      {status?.enabled && (
        <p className="field-hint" style={{ marginTop: 8 }} role="status">
          已上傳 {status.sent} 筆 · 待傳 {status.pending} 筆
          {status.dropped > 0 && ` · 已捨棄 ${status.dropped} 筆`}
          {status.lastError && ` · 上次失敗:${status.lastError}`}
          <br />
          本次執行 ID:{status.runId}(回報問題時可提供給開發者)
        </p>
      )}
      <details style={{ marginTop: 12 }}>
        <summary className="text-sm text-text-muted" style={{ cursor: 'pointer' }}>
          進階
        </summary>
        <div className="field" style={{ marginTop: 8 }}>
          <label htmlFor="telemetry-endpoint">伺服器網址</label>
          <input
            id="telemetry-endpoint"
            type="url"
            value={endpoint}
            disabled={enabled || busy}
            onChange={(e) => setEndpoint(e.target.value)}
          />
          <p className="field-hint" style={{ marginTop: 6 }}>
            一般不需要修改。開啟上傳時無法變更,請先關閉。
          </p>
        </div>
      </details>
    </div>
  )
}
