// renderer/views/SettingsView.tsx
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { JOINT_PROTOCOLS } from '@shared/types'
import type { FirmwareBinary, UpdateStatus } from '@shared/types'
import type { Settings } from '../store/useStore'
import { CalibrationWizard } from '../components/CalibrationWizard'
import { TelemetryPanel } from '../components/TelemetryPanel'
import { ModulesPanel } from '../components/ModulesPanel'
import { GlassDropdown } from '../components/GlassDropdown'
import { buildQuickZeroPatch } from '../services/calibration'
import { SCENARIOS } from '../services/simulation/scenarios'
import { deviceSimulator } from '../services/simulation/simulator'
import { bluetoothService, type OtaProgress } from '../services/bluetooth'
import { irms } from '../platform/irmsApi'
import { useFirmwareAutoStore, type AutoUpdatePhase } from '../services/firmwareAutoUpdate'

const AUTO_PHASE_TEXT: Record<AutoUpdatePhase, string> = {
  idle: '連線裝置後自動檢查',
  checking: '檢查最新韌體中…',
  up_to_date: '已是最新版',
  deferred: 'Session 進行中,結束後再檢查',
  incompatible: '最新韌體需要較新的 App',
  downloading: '下載並驗證韌體中…',
  updating: '傳輸到裝置中',
  done: '更新完成,裝置重新啟動中',
  error: '自動更新失敗'
}

/** 閒置自動更新的狀態(services/firmwareAutoUpdate.ts);手動更新流程保留在下方不變 */
function AutoFirmwareStatusLine(): JSX.Element {
  const status = useFirmwareAutoStore((s) => s.status)
  const versions =
    status.latestVersion != null
      ? ` · 裝置 ${status.deviceVersion ?? '未知(舊韌體)'} / 最新 ${status.latestVersion}`
      : ''
  const pct = status.phase === 'updating' ? ` ${status.percent ?? 0}%` : ''
  return (
    <p className={`field-hint${status.phase === 'error' ? ' text-warning' : ''}`} style={{ marginBottom: 12 }}>
      自動更新(閒置時):{AUTO_PHASE_TEXT[status.phase]}
      {pct}
      {versions}
      {status.phase === 'error' && status.message ? ` — ${status.message}` : ''}
    </p>
  )
}

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

type SettingsCategory = 'device' | 'calibration' | 'display' | 'software' | 'modules' | 'privacy' | 'demo'

const CATEGORIES: { id: SettingsCategory; label: string; title: string; hint: string }[] = [
  { id: 'device', label: '裝置與連線', title: '裝置與連線', hint: '連線狀態與判定協定' },
  { id: 'calibration', label: '校準', title: '感測器校準', hint: '零位、屈曲軸與佩戴方向' },
  { id: 'display', label: '顯示', title: '顯示', hint: '主題、姿態預設與圖表' },
  { id: 'software', label: '軟體與韌體', title: '軟體與韌體更新', hint: 'App 更新頻道與裝置韌體' },
  { id: 'modules', label: '模組', title: '功能模組', hint: '第一方模組與啟用狀態' },
  { id: 'privacy', label: '資料與隱私', title: '資料與隱私', hint: '即時遙測上傳(預設關閉)' },
  { id: 'demo', label: '示範模式', title: '示範模式', hint: '不需硬體的完整流程演練' }
]

function DevicePane(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const isConnected = useStore((s) => s.isConnected)
  const deviceName = useStore((s) => s.deviceName)
  const statusText = useStore((s) => s.statusText)
  const hardwareError = useStore((s) => s.hardwareError)
  const running = useStore((s) => s.session.running)
  const demoMode = useUiStore((s) => s.demoMode)
  return (
    <>
      <div className="v3-set-row">
        <div>
          <strong>裝置</strong>
          <p>
            {isConnected ? `已連線 · ${deviceName ?? 'IRMS Device'}` : statusText}
            {hardwareError ? ` · 感測器異常 ${hardwareError}` : ''}
          </p>
        </div>
        <button
          className={`btn ${isConnected ? 'btn-secondary' : 'btn-primary'}`}
          disabled={demoMode}
          onClick={() => void bluetoothService.connect()}
        >
          {demoMode ? '示範模式中' : isConnected ? '中斷連線' : '連線裝置'}
        </button>
      </div>
      <p className="field-hint">連線只代表收得到資料;角度是否可信取決於校準。</p>
      <div className="field" style={{ maxWidth: 360, marginTop: 20 }}>
        <label>判定協定</label>
        <GlassDropdown
          value={settings.protocol}
          disabled={running}
          onChange={(v) => setSettings({ protocol: v as Settings['protocol'] })}
          options={JOINT_PROTOCOLS.map((p) => ({ value: p.value, label: p.label }))}
        />
        <p className="field-hint">判定目前只支援膝關節;其他協定會擋下開始療程。</p>
      </div>
    </>
  )
}

function CalibrationPane(): JSX.Element {
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
  const calibrationLocked = useStore((s) => s.session.running)
  // MTU 沒協商上去時 roll 恆為 0,快速歸零仍會寫入 roll 的 zeroRaw(寫入 0,實質無效)。
  const linkTruncated = useStore((s) => s.linkTruncated)

  const quickZero = (): void => {
    if (!rawAngles) {
      showToast('尚無即時資料,無法歸零', 'warning')
      return
    }
    setSettings(buildQuickZeroPatch(rawAngles, settings))
    showToast(
      linkTruncated ? '已套用快速歸零校準(僅 Pitch:BLE 未送達 roll 資料)' : '已套用快速歸零校準(含 Roll)',
      linkTruncated ? 'warning' : 'success'
    )
  }
  const scope: [string, boolean][] = [
    ['零位已捕捉', settings.proximalZeroAccel != null && settings.distalZeroAccel != null],
    ['大腿軸已建立', settings.proximalHingeAxis != null],
    ['小腿軸已建立', settings.distalHingeAxis != null],
    ['側向方向已驗證', settings.proximalRollVerified && settings.distalRollVerified]
  ]

  return (
    <>
      <div className="v3-set-row">
        <div>
          <strong>校準精靈</strong>
          <p>
            {settings.lastCalibratedAt
              ? `上次校準:${new Date(settings.lastCalibratedAt).toLocaleString()}`
              : '尚未校準——未校準時無法開始療程'}
          </p>
        </div>
        <button className="btn btn-primary" disabled={!isConnected || calibrationLocked} onClick={() => setWizardOpen(true)}>
          {settings.lastCalibratedAt ? '重新校準' : '開始校準'}
        </button>
      </div>
      <ul className="v3-scope">
        {scope.map(([label, ok]) => (
          <li key={label} className={ok ? 'ok' : ''}>
            {ok ? '✓' : '○'} {label}
          </li>
        ))}
      </ul>
      <p className="field-hint">
        感測器不需要貼得很正:精靈會從「抬大腿」與「勾小腿」兩個動作算出各自的屈曲軸。抬大腿至少 20°
        (建議 40–60°),勾小腿時大腿保持不動。側向方向只影響 3D 與診斷數值,不影響達標與超限判定。
      </p>
      {!isConnected && <p className="field-hint">校準需要即時感測器數值,請先連線裝置。</p>}
      {calibrationLocked && (
        <p className="field-hint">療程進行中無法變更校準——一場的資料必須全程由同一組轉換產生。請先結束療程。</p>
      )}

      <details className="adv-fold">
        <summary>進階手動校準(一般情況請使用精靈)</summary>
        <p className="field-hint">
          Zero 欄位是「站直姿勢當下,感測器的原始讀值」,不是要加減的偏移量——多數情況請用「快速歸零」。
        </p>
        <div className="row">
          <NumField label="Thigh Zero (raw °)" value={settings.proximalZeroRaw} onChange={(v) => set('proximalZeroRaw', v)} disabled={calibrationLocked} />
          <NumField label="Shin Zero (raw °)" value={settings.distalZeroRaw} onChange={(v) => set('distalZeroRaw', v)} disabled={calibrationLocked} />
        </div>
        <div className="row" style={{ gap: 24, marginBottom: 14 }}>
          <Toggle label="Invert Thigh 反相" checked={settings.proximalInvert} onChange={(v) => set('proximalInvert', v)} disabled={calibrationLocked} />
          <Toggle label="Invert Shin 反相" checked={settings.distalInvert} onChange={(v) => set('distalInvert', v)} disabled={calibrationLocked} />
        </div>
        <div className="row">
          <NumField label="Thigh Roll Zero (raw °)" value={settings.proximalRollZeroRaw} onChange={(v) => set('proximalRollZeroRaw', v)} disabled={calibrationLocked} />
          <NumField label="Shin Roll Zero (raw °)" value={settings.distalRollZeroRaw} onChange={(v) => set('distalRollZeroRaw', v)} disabled={calibrationLocked} />
        </div>
        <div className="row" style={{ gap: 24, marginBottom: 16 }}>
          <Toggle label="Invert Thigh Roll" checked={settings.proximalRollInvert} onChange={(v) => set('proximalRollInvert', v)} disabled={calibrationLocked} />
          <Toggle label="Invert Shin Roll" checked={settings.distalRollInvert} onChange={(v) => set('distalRollInvert', v)} disabled={calibrationLocked} />
        </div>
        <button className="btn btn-secondary" disabled={calibrationLocked} onClick={quickZero}>
          快速歸零
        </button>
      </details>
      {wizardOpen && <CalibrationWizard onClose={() => setWizardOpen(false)} />}
    </>
  )
}

function DisplayPane(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  return (
    <>
      <div className="field" style={{ maxWidth: 360 }}>
        <label>主題</label>
        <GlassDropdown
          value={settings.themeMode}
          onChange={(v) => setSettings({ themeMode: v as Settings['themeMode'] })}
          options={[
            { value: 'system', label: '跟隨系統' },
            { value: 'light', label: '日間' },
            { value: 'dark', label: '夜間' }
          ]}
        />
      </div>
      <div className="field" style={{ maxWidth: 360 }}>
        <label>即時監測姿態預設</label>
        <GlassDropdown
          value={settings.poseView}
          onChange={(v) => setSettings({ poseView: v as Settings['poseView'] })}
          options={[
            { value: '2d', label: '2D 側面(建議)' },
            { value: '3d', label: '3D' }
          ]}
        />
        <p className="field-hint">2D 只呈現判定平面的屈伸;3D 的側向角度尚未驗證,僅作方向示意。</p>
      </div>
      <details className="adv-fold">
        <summary>進階</summary>
        <div className="row">
          <NumField
            label="即時圖表最大點數"
            value={settings.maxChartPoints}
            onChange={(v) => setSettings({ maxChartPoints: Math.max(10, Math.round(v)) })}
          />
          <NumField
            label="資料寫入間隔 (秒)"
            value={settings.flushIntervalSec}
            onChange={(v) => setSettings({ flushIntervalSec: Math.max(1, Math.round(v)) })}
          />
        </div>
      </details>
    </>
  )
}

export function SettingsView(): JSX.Element {
  const [category, setCategory] = useState<SettingsCategory>('device')
  const meta = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0]
  const setView = useUiStore((s) => s.setView)

  return (
    <div className="v3-page">
      <div className="v3-page-head">
        <div>
          <h1>系統設定</h1>
          <p>裝置準備、資料選擇,都有各自的位置。</p>
        </div>
      </div>
      <section className="v3-sheet v3-settings">
        <nav className="v3-settings-index" aria-label="設定分類">
          {CATEGORIES.map((c) => (
            <button key={c.id} aria-current={c.id === category ? 'page' : undefined} onClick={() => setCategory(c.id)}>
              {c.label}
              <span aria-hidden>›</span>
            </button>
          ))}
        </nav>
        <div className="v3-settings-pane">
          <header className="v3-settings-head">
            <h2>{meta.title}</h2>
            <p>{meta.hint}</p>
          </header>
          <div className="v3-settings-body v3-scroll">
            {category === 'device' && <DevicePane />}
            {category === 'calibration' && <CalibrationPane />}
            {category === 'display' && <DisplayPane />}
            {category === 'software' && (
              <>
                <SoftwareUpdatePanel />
                <FirmwareOtaPanel />
              </>
            )}
            {category === 'modules' && <ModulesPanel />}
            {category === 'privacy' && <TelemetryPanel />}
            {category === 'demo' && <DemoModePanel />}
          </div>
          <footer className="v3-settings-foot">
            <span>設定會立即儲存於本機</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setView('dashboard')}>
              返回監測
            </button>
          </footer>
        </div>
      </section>
    </div>
  )
}

/** UpdateStatus → 人看得懂的中文狀態文字。null = 從未檢查過,不顯示任何狀態列。 */
function describeUpdateStatus(status: UpdateStatus | null): string | null {
  if (!status) return null
  switch (status.state) {
    case 'checking':
      return '檢查中…'
    case 'available':
      return `發現新版本 ${status.version},準備下載…`
    case 'downloading':
      return `下載中…${status.percent}%`
    case 'downloaded':
      return `新版本 ${status.version} 已下載完成,見下方橫幅重新啟動套用`
    case 'not-available':
      return '已是最新版本'
    case 'error':
      return `檢查失敗:${status.message}`
  }
}

/**
 * App 軟體更新面板。下載/重啟套用本身仍然靜默——見 `UpdateBanner.tsx`,只有
 * 「已下載完成」才會在畫面下方冒出來。但「檢查」這一步本身的結果(已是最新版/
 * 失敗/發現新版本)過去完全沒有出口:`checkNow()` 只丟一句固定文案的 toast,不管
 * `performCheck()` 實際結果是什麼——2026-09-13 使用者實測回報「按下去之後就沒有任何
 * 提示了」正是這個缺口:如果檢查失敗(網路錯誤/manifest 抓不到)或單純沒有新版本,
 * 畫面上長得跟「按下去什麼都沒發生」一模一樣,無從分辨兩者。改成訂閱
 * `onStatusChange` 顯示一行持續可見的狀態文字,取代原本那句不管結果都一樣的 toast。
 */
function SoftwareUpdatePanel(): JSX.Element {
  const allowBetaUpdates = useStore((s) => s.settings.allowBetaUpdates)
  const setSettings = useStore((s) => s.setSettings)
  const [version, setVersion] = useState<string | null>(null)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const checking = status?.state === 'checking'

  useEffect(() => {
    irms.updates.getCurrentVersion().then(setVersion)
  }, [])

  useEffect(() => irms.updates.onStatusChange(setStatus), [])

  const checkNow = async (): Promise<void> => {
    await irms.updates.checkNow()
  }

  const statusText = describeUpdateStatus(status)

  return (
    <div className="panel glass">
      <h3 style={{ marginBottom: 14 }}>Software Update 軟體更新</h3>
      <p className="text-text-muted text-sm mb-3">
        新版本會在背景自動下載,不會跳出安裝精靈;下載完成後畫面下方會出現提示,按下重啟即可套用
        (或直接關閉 App,下次啟動時自動套用)。
      </p>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        {version && <span className="text-sm text-text-muted">目前版本:{version}</span>}
        <button className="btn btn-secondary" disabled={checking} onClick={() => void checkNow()}>
          {checking ? '檢查中…' : '立即檢查更新'}
        </button>
      </div>
      {statusText && (
        <p className="field-hint" style={{ marginTop: 8 }} role="status">
          {statusText}
        </p>
      )}
      <div style={{ marginTop: 12 }}>
        <Toggle
          label="接收 Beta 版更新"
          checked={allowBetaUpdates}
          onChange={(v) => setSettings({ allowBetaUpdates: v })}
        />
        <p className="field-hint" style={{ marginTop: 6 }}>
          關閉後只會收到正式版推播;已安裝的版本不受影響,只影響「下一次」自動更新推的是哪一種版本。
        </p>
      </div>
    </div>
  )
}

/**
 * 裝置韌體 OTA 更新面板。
 *
 * 放在 Settings 而非另開一個畫面/導覽項目——這是全 App 唯一一處直接操作硬體底層的
 * 危險操作(校準精靈之外),Settings 本來就是「系統層級設定」的既有心智模型,
 * 使用者不需要為了一個低頻功能多學一個新的導覽入口。
 */
function FirmwareOtaPanel(): JSX.Element {
  const isConnected = useStore((s) => s.isConnected)
  const isSimulated = bluetoothService.isSimulated
  // 比照本檔 calibrationLocked/sessionRunning 的既有慣例:Session 進行中鎖定危險操作。
  // OTA 特有的理由更硬——Update.write() 觸發的 flash 寫入會讓 ESP32 兩顆核心短暫
  // 停頓(SPI flash 操作需要暫停 cache),Task_Sensor 的 50Hz 取樣與 Task_Comm 的
  // 25Hz BLE 推播都會跟著卡頓。療程進行中出現這種卡頓,輕則資料出現偽影,重則
  // 讓正在半蹲/外展的患者因為回饋延遲而失去平衡——這是本檔其他鎖定沒有的傷害路徑。
  const sessionRunning = useStore((s) => s.session.running)
  const showToast = useUiStore((s) => s.showToast)
  const requestConfirm = useUiStore((s) => s.requestConfirm)

  const [deviceVersion, setDeviceVersion] = useState<string | null>(null)
  const [checkingVersion, setCheckingVersion] = useState(false)
  const [firmware, setFirmware] = useState<FirmwareBinary | null>(null)
  const [targetLabel, setTargetLabel] = useState('')
  const [progress, setProgress] = useState<OtaProgress | null>(null)
  const [busy, setBusy] = useState(false)

  const disabledReason = !isConnected
    ? '需要先於頂部連線真實裝置'
    : isSimulated
      ? 'Demo 模式沒有真實裝置,無法更新韌體'
      : sessionRunning
        ? 'Session 進行中無法更新韌體——flash 寫入會讓感測器取樣與回饋短暫卡頓,患者仍佩戴著裝置時不能冒這個險。請先結束 Session。'
        : null

  const checkVersion = async (): Promise<void> => {
    setCheckingVersion(true)
    try {
      const v = await bluetoothService.getDeviceFirmwareVersion()
      setDeviceVersion(v)
      if (v == null) {
        showToast('讀取失敗,裝置可能是舊韌體(尚未支援 OTA)', 'warning')
      }
    } finally {
      setCheckingVersion(false)
    }
  }

  const pickFile = async (): Promise<void> => {
    try {
      const picked = await irms.firmware.pickBinary()
      if (picked == null) return
      setFirmware(picked)
      setProgress(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      showToast(`讀取韌體失敗：${message}`, 'error')
    }
  }

  // 版本比對僅供使用者確認用的提示,不是自動判斷「要不要更新」的硬性關卡——
  // .bin 本身沒有可靠讀出的版本中繼資料,標籤是使用者自己填的,不能拿來做程式判斷。
  const versionsMatch =
    targetLabel.trim().length > 0 && deviceVersion != null && targetLabel.trim() === deviceVersion

  const startUpdate = async (): Promise<void> => {
    if (!firmware) return
    // 空檔案交給韌體端的 OTA:ERROR:BAD_START 擋也擋得住,但那則訊息寫的是「App 端 bug,
    // 不應該發生」——選到空檔案是使用者操作,不是 bug,在這裡先攔下來給看得懂的訊息。
    if (firmware.size === 0) {
      showToast('選擇的檔案是空的,請重新選擇 .bin', 'error')
      return
    }
    const sizeKb = (firmware.size / 1024).toFixed(0)
    const warnLine = versionsMatch
      ? `\n⚠ 填寫的版本標籤與裝置目前版本相同(${deviceVersion}),確定仍要重新燒錄?`
      : ''
    const ok = await requestConfirm(
      '開始更新裝置韌體?',
      `即將透過 BLE 傳送 ${sizeKb} KB 的韌體到已連線裝置。傳輸中請勿關閉 App 或讓裝置斷電——` +
        `中途中斷不會讓裝置變磚(新韌體寫入未啟用的分區,失敗時自動維持原本可開機的版本),` +
        `但這次更新會失敗,需要重新開始。${warnLine}`
    )
    if (!ok) return

    setBusy(true)
    setProgress({ phase: 'starting', bytesSent: 0, totalBytes: firmware.size })
    const result = await bluetoothService.performOtaUpdate(firmware, setProgress)
    setBusy(false)
    showToast(result.message, result.ok ? 'success' : 'error')
  }

  const abortUpdate = async (): Promise<void> => {
    await bluetoothService.abortOtaUpdate()
    setBusy(false)
    setProgress(null)
    showToast('已送出中止指令', 'warning')
  }

  const pct = progress && progress.totalBytes > 0 ? Math.round((progress.bytesSent / progress.totalBytes) * 100) : 0
  const inFlight = progress != null && ['starting', 'transferring', 'finalizing'].includes(progress.phase)

  return (
    <div className="panel glass">
      <h3 style={{ marginBottom: 14 }}>Firmware Update 裝置韌體更新</h3>
      <p className="text-text-muted text-sm mb-3">
        透過既有 BLE 連線把新韌體推送到 ESP32,取代原本每次都要拆開裝置、接 USB 到 COM7
        手動燒錄的流程。傳輸協定與安全性說明見專案文件 OPTIMIZATION.md 的 OTA 條目。
      </p>
      <AutoFirmwareStatusLine />

      {disabledReason && <p className="field-hint" style={{ marginBottom: 12 }}>{disabledReason}</p>}

      <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <button
          className="btn btn-secondary"
          disabled={!!disabledReason || checkingVersion || inFlight}
          onClick={() => void checkVersion()}
        >
          {checkingVersion ? '查詢中…' : '查詢裝置目前版本'}
        </button>
        {deviceVersion && <span className="text-sm">裝置目前版本:{deviceVersion}</span>}
      </div>

      <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <button className="btn btn-secondary" disabled={!!disabledReason || inFlight} onClick={() => void pickFile()}>
          選擇韌體檔案 (.bin)
        </button>
        {firmware && (
          <span className="text-sm text-text-muted">
            {firmware.path.split(/[\\/]/).pop()} · {(firmware.size / 1024).toFixed(0)} KB · MD5 {firmware.md5.slice(0, 8)}…
          </span>
        )}
      </div>

      {firmware && (
        <div className="field" style={{ maxWidth: 280, marginBottom: 12 }}>
          <label>這個檔案的版本標籤(選填,僅供比對提示)</label>
          <input
            type="text"
            value={targetLabel}
            disabled={inFlight}
            placeholder="例如 1.0.1"
            onChange={(e) => setTargetLabel(e.target.value)}
          />
        </div>
      )}

      {progress && (
        <div style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="text-sm">
              {progress.phase === 'starting' && '啟動更新…'}
              {progress.phase === 'transferring' && `傳輸中… ${pct}%`}
              {progress.phase === 'finalizing' && '寫入完成,裝置驗證中…'}
              {progress.phase === 'done' && '✅ 完成,裝置重新開機中'}
              {progress.phase === 'error' && `❌ ${progress.message ?? '更新失敗'}`}
              {progress.phase === 'aborted' && '已中止'}
            </span>
            <span className="text-sm text-text-muted">
              {(progress.bytesSent / 1024).toFixed(0)} / {(progress.totalBytes / 1024).toFixed(0)} KB
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                background: progress.phase === 'error' ? 'var(--danger)' : 'var(--accent)',
                transition: 'width 150ms linear'
              }}
            />
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10 }}>
        <button
          className="btn btn-primary"
          disabled={!!disabledReason || !firmware || busy}
          onClick={() => void startUpdate()}
        >
          開始更新
        </button>
        {inFlight && (
          <button className="btn btn-danger-ghost" onClick={() => void abortUpdate()}>
            中止
          </button>
        )}
      </div>
    </div>
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
      const { deleted } = await irms.sessions.purgeDemo()
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
      <p className="text-text-muted text-sm mb-3">
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

      <hr className="my-4 border-0 border-t border-border" />
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
