// components/TelemetryPanel.tsx
// 設定頁的「實機測試資料上傳」面板。開關打開前先讓 Rust 驗證網址與金鑰,驗證失敗
// 就不存成開啟狀態——避免設定頁顯示「已開啟」但實際上什麼都沒在傳。
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
  const [token, setToken] = useState(settings.telemetryToken)
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
      await configureTelemetry({
        telemetryEnabled: true,
        telemetryEndpoint: endpoint,
        telemetryToken: token
      })
      setSettings({ telemetryEnabled: true, telemetryEndpoint: endpoint.trim(), telemetryToken: token.trim() })
      showToast('已開啟測試資料上傳', 'success')
    } catch (err) {
      showToast(String(err), 'warning')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel glass">
      <h3 style={{ marginBottom: 14 }}>Test Telemetry 測試資料上傳</h3>
      <p className="text-text-muted text-sm mb-3">
        實機測試時開啟,會把原始感測封包、連線狀態、OTA 狀態、Session 開始/結束與 App
        日誌上傳到開發者的伺服器,方便遠端分析問題。本機紀錄照常保存,上傳失敗不影響量測。
        不含姓名等個人資料;測試結束請關閉。
      </p>
      <div className="field">
        <label htmlFor="telemetry-endpoint">伺服器網址</label>
        <input
          id="telemetry-endpoint"
          type="url"
          value={endpoint}
          disabled={enabled || busy}
          onChange={(e) => setEndpoint(e.target.value)}
        />
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label htmlFor="telemetry-token">上傳金鑰</label>
        <input
          id="telemetry-token"
          type="password"
          autoComplete="off"
          value={token}
          disabled={enabled || busy}
          placeholder="向開發者索取"
          onChange={(e) => setToken(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="switch">
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => void toggle(e.target.checked)}
          />
          上傳測試資料
        </label>
        <p className="field-hint" style={{ marginTop: 6 }}>
          開啟中無法修改網址與金鑰,請先關閉再修改。
        </p>
      </div>
      {status?.enabled && (
        <p className="field-hint" style={{ marginTop: 8 }} role="status">
          已上傳 {status.sent} 筆 · 待傳 {status.pending} 筆
          {status.dropped > 0 && ` · 已捨棄 ${status.dropped} 筆`}
          {status.lastError && ` · 上次失敗:${status.lastError}`}
          <br />
          本次執行 ID:{status.runId}
        </p>
      )}
    </div>
  )
}
