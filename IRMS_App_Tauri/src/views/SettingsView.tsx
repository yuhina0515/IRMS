// renderer/views/SettingsView.tsx
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { JOINT_PROTOCOLS } from '@shared/types'
import type { FirmwareBinary, UpdateStatus } from '@shared/types'
import type { Settings } from '../store/useStore'
import { CalibrationWizard } from '../components/CalibrationWizard'
import { CalibrationWizardB } from '../components/CalibrationWizardB'
import { TelemetryPanel } from '../components/TelemetryPanel'
import { ModulesPanel } from '../components/ModulesPanel'
import { GlassDropdown } from '../components/GlassDropdown'
import { buildQuickZeroPatch } from '../services/calibration'
import { SCENARIOS } from '../services/simulation/scenarios'
import { deviceSimulator } from '../services/simulation/simulator'
import { bluetoothService, type OtaProgress } from '../services/bluetooth'
import { irms } from '../platform/irmsApi'
import { useFirmwareAutoStore } from '../services/firmwareAutoUpdate'
import {
  DATE_TIME,
  connectionStatusText,
  formatDateTime,
  useLocale,
  useT,
  type LanguageSetting,
  type Messages
} from '../i18n'
const IS_ANDROID = typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent)

/**
 * Language names are endonyms (each written in its own language) and deliberately not translated:
 * a user who cannot read the current UI language must still be able to find their own.
 */
const LANGUAGE_NAMES: Record<Exclude<LanguageSetting, 'system'>, string> = {
  'zh-Hant': '繁體中文',
  en: 'English'
}

/** 閒置自動更新的狀態(services/firmwareAutoUpdate.ts);手動更新流程保留在下方不變 */
function AutoFirmwareStatusLine(): JSX.Element {
  const status = useFirmwareAutoStore((s) => s.status)
  const m = useT()
  const versions =
    status.latestVersion != null
      ? m.settings.autoVersions({
          device: status.deviceVersion ?? m.settings.unknownOldFirmware,
          latest: status.latestVersion
        })
      : ''
  const pct = status.phase === 'updating' ? ` ${status.percent ?? 0}%` : ''
  return (
    <p className={`field-hint${status.phase === 'error' ? ' text-warning' : ''}`} style={{ marginBottom: 12 }}>
      {m.settings.autoLabel}
      {m.settings.autoPhase[status.phase]}
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

const CATEGORIES: SettingsCategory[] = ['device', 'calibration', 'display', 'software', 'modules', 'privacy', 'demo']

function DevicePane(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const isConnected = useStore((s) => s.isConnected)
  const deviceName = useStore((s) => s.deviceName)
  const connectionStatus = useStore((s) => s.connectionStatus)
  const hardwareError = useStore((s) => s.hardwareError)
  const running = useStore((s) => s.session.running)
  const demoMode = useUiStore((s) => s.demoMode)
  const m = useT()
  return (
    <>
      <div className="v3-set-row">
        <div>
          <strong>{m.settings.device.heading}</strong>
          <p>
            {isConnected
              ? m.connection.connected({ name: deviceName ?? 'IRMS Device' })
              : connectionStatusText(m, connectionStatus)}
            {hardwareError ? m.settings.device.sensorFault({ code: hardwareError }) : ''}
          </p>
        </div>
        <button
          className={`btn ${isConnected ? 'btn-secondary' : 'btn-primary'}`}
          disabled={demoMode}
          onClick={() => void bluetoothService.connect()}
        >
          {demoMode ? m.common.demoModeActive : isConnected ? m.common.disconnect : m.common.connectDevice}
        </button>
      </div>
      <p className="field-hint">{m.settings.device.connectHint}</p>
      <div className="field" style={{ maxWidth: 360, marginTop: 20 }}>
        <label>{m.settings.device.protocol}</label>
        <GlassDropdown
          value={settings.protocol}
          disabled={running}
          onChange={(v) => setSettings({ protocol: v as Settings['protocol'] })}
          options={JOINT_PROTOCOLS.map((p) => ({ value: p.value, label: m.clinical.protocol[p.value] }))}
        />
        <p className="field-hint">{m.settings.device.protocolHint}</p>
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
  const [wizardBOpen, setWizardBOpen] = useState(false)
  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void =>
    setSettings({ [key]: value } as Partial<Settings>)
  // 校準在 Session 進行中凍結(見 store 的 CALIBRATION_KEYS):一場的資料必須
  // 全程由同一組轉換產生,sessions.calibration 那個單一快照才不是謊報。
  const calibrationLocked = useStore((s) => s.session.running)
  // MTU 沒協商上去時 roll 恆為 0,快速歸零仍會寫入 roll 的 zeroRaw(寫入 0,實質無效)。
  const linkTruncated = useStore((s) => s.linkTruncated)
  const m = useT()
  const mc = m.settings.calibration
  const locale = useLocale()

  const quickZero = (): void => {
    if (!rawAngles) {
      showToast(mc.noLiveData, 'warning')
      return
    }
    setSettings(buildQuickZeroPatch(rawAngles, settings))
    showToast(
      linkTruncated ? mc.quickZeroPitchOnly : mc.quickZeroFull,
      linkTruncated ? 'warning' : 'success'
    )
  }
  const scope: [string, boolean][] = [
    [mc.zeroCaptured, settings.proximalZeroAccel != null && settings.distalZeroAccel != null],
    [mc.thighAxis, settings.proximalHingeAxis != null],
    [mc.shinAxis, settings.distalHingeAxis != null],
    [mc.rollVerified, settings.proximalRollVerified && settings.distalRollVerified]
  ]

  return (
    <>
      <div className="v3-set-row">
        <div>
          <strong>{mc.wizard}</strong>
          <p>
            {settings.lastCalibratedAt
              ? mc.lastCalibrated({ time: formatDateTime(locale, new Date(settings.lastCalibratedAt), DATE_TIME) })
              : mc.notCalibrated}
          </p>
        </div>
        <button className="btn btn-primary" disabled={!isConnected || calibrationLocked} onClick={() => setWizardOpen(true)}>
          {settings.lastCalibratedAt ? mc.recalibrate : mc.start}
        </button>
      </div>
      <button
        className="btn btn-secondary"
        data-testid="calib-b-open"
        disabled={!isConnected || calibrationLocked}
        onClick={() => setWizardBOpen(true)}
      >
        {m.calibrationB.title} ({m.calibrationB.beta})
      </button>
      <ul className="v3-scope">
        {scope.map(([label, ok]) => (
          <li key={label} className={ok ? 'ok' : ''}>
            {ok ? '✓' : '○'} {label}
          </li>
        ))}
      </ul>
      <p className="field-hint">{m.clinical.calibration.wizardHint}</p>
      {!isConnected && <p className="field-hint">{mc.needConnection}</p>}
      {calibrationLocked && <p className="field-hint">{mc.locked}</p>}

      <details className="adv-fold">
        <summary>{mc.manualSummary}</summary>
        <p className="field-hint">{mc.manualHint}</p>
        <div className="row">
          <NumField label="Thigh Zero (raw °)" value={settings.proximalZeroRaw} onChange={(v) => set('proximalZeroRaw', v)} disabled={calibrationLocked} />
          <NumField label="Shin Zero (raw °)" value={settings.distalZeroRaw} onChange={(v) => set('distalZeroRaw', v)} disabled={calibrationLocked} />
        </div>
        <div className="row" style={{ gap: 24, marginBottom: 14 }}>
          <Toggle label={mc.invertThigh} checked={settings.proximalInvert} onChange={(v) => set('proximalInvert', v)} disabled={calibrationLocked} />
          <Toggle label={mc.invertShin} checked={settings.distalInvert} onChange={(v) => set('distalInvert', v)} disabled={calibrationLocked} />
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
          {mc.quickZero}
        </button>
      </details>
      {wizardOpen && <CalibrationWizard onClose={() => setWizardOpen(false)} />}
      {wizardBOpen && <CalibrationWizardB onClose={() => setWizardBOpen(false)} />}
    </>
  )
}

function DisplayPane(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const m = useT()
  const md = m.settings.display
  return (
    <>
      <div className="field" style={{ maxWidth: 360 }}>
        <label>{md.language}</label>
        <GlassDropdown
          value={settings.language}
          onChange={(v) => setSettings({ language: v as LanguageSetting })}
          options={[
            { value: 'system', label: m.common.followSystem },
            { value: 'zh-Hant', label: LANGUAGE_NAMES['zh-Hant'] },
            { value: 'en', label: LANGUAGE_NAMES.en }
          ]}
        />
        <p className="field-hint">{md.languageHint}</p>
      </div>
      <div className="field" style={{ maxWidth: 360 }}>
        <label>{md.theme}</label>
        <GlassDropdown
          value={settings.themeMode}
          onChange={(v) => setSettings({ themeMode: v as Settings['themeMode'] })}
          options={[
            { value: 'system', label: m.common.followSystem },
            { value: 'light', label: md.light },
            { value: 'dark', label: md.dark }
          ]}
        />
      </div>
      <div className="field" style={{ maxWidth: 360 }}>
        <label>{md.poseDefault}</label>
        <GlassDropdown
          value={settings.poseView}
          onChange={(v) => setSettings({ poseView: v as Settings['poseView'] })}
          options={[
            { value: '2d', label: md.pose2d },
            { value: '3d', label: '3D' }
          ]}
        />
        <p className="field-hint">{md.poseHint}</p>
      </div>
      <details className="adv-fold">
        <summary>{m.common.advanced}</summary>
        <div className="row">
          <NumField
            label={md.maxChartPoints}
            value={settings.maxChartPoints}
            onChange={(v) => setSettings({ maxChartPoints: Math.max(10, Math.round(v)) })}
          />
          <NumField
            label={md.flushInterval}
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
  const [navOpen, setNavOpen] = useState(false)
  const setView = useUiStore((s) => s.setView)
  const m = useT()
  const meta = m.settings.categories[category]

  return (
    <div className="v3-page">
      <div className="v3-page-head">
        <div>
          <h1>{m.settings.title}</h1>
          <p>{m.settings.subtitle}</p>
        </div>
      </div>
      <section className="v3-sheet v3-settings">
        {navOpen && <div className="v3-settings-scrim" onClick={() => setNavOpen(false)} />}
        <nav className={`v3-settings-index${navOpen ? ' is-open' : ''}`} aria-label={m.settings.indexAria}>
          {CATEGORIES.map((id) => (
            <button key={id} aria-current={id === category ? 'page' : undefined} onClick={() => { setCategory(id); setNavOpen(false) }}>
              {m.settings.categories[id].label}
              <span aria-hidden>›</span>
            </button>
          ))}
        </nav>
        <div className="v3-settings-pane">
          <header className="v3-settings-head">
            <button
              type="button"
              className="v3-settings-menu"
              aria-label={m.settings.indexAria}
              aria-expanded={navOpen}
              onClick={() => setNavOpen((o) => !o)}
            >
              ☰
            </button>
            <div>
              <h2>{meta.title}</h2>
              <p>{meta.hint}</p>
            </div>
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
            <span>{m.settings.footer}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setView('dashboard')}>
              {m.settings.back}
            </button>
          </footer>
        </div>
      </section>
    </div>
  )
}

/** UpdateStatus → 人看得懂的狀態文字。null = 從未檢查過,不顯示任何狀態列。 */
function describeUpdateStatus(m: Messages, status: UpdateStatus | null): string | null {
  if (!status) return null
  const u = m.settings.updateStatus
  switch (status.state) {
    case 'checking':
      return u.checking
    case 'available':
      return u.available({ version: status.version })
    case 'downloading':
      return u.downloading({ pct: status.percent })
    case 'downloaded':
      return u.downloaded({ version: status.version })
    case 'apk-available':
      return u.apkAvailable({ version: status.version })
    case 'not-available':
      return u.notAvailable
    case 'error':
      return u.error({ message: status.message })
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
  const checking = status != null && ['checking', 'available', 'downloading', 'downloaded', 'apk-available'].includes(status.state)
  const m = useT()
  const ms = m.settings.software

  useEffect(() => {
    irms.updates.getCurrentVersion().then(setVersion)
  }, [])

  useEffect(() => irms.updates.onStatusChange(setStatus), [])

  const checkNow = async (): Promise<void> => {
    await irms.updates.checkNow()
  }

  const statusText = describeUpdateStatus(m, status)

  return (
    <div className="panel glass">
      <h3 style={{ marginBottom: 14 }}>{ms.heading}</h3>
      <p className="text-text-muted text-sm mb-3">{IS_ANDROID ? ms.introAndroid : ms.intro}</p>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        {version && <span className="text-sm text-text-muted">{ms.currentVersion({ version })}</span>}
        <button className="btn btn-secondary" disabled={checking} onClick={() => void checkNow()}>
          {status?.state === 'downloaded' ? ms.downloadedWaiting : checking ? ms.processing : ms.checkNow}
        </button>
      </div>
      {statusText && (
        <p className="field-hint" style={{ marginTop: 8 }} role="status">
          {statusText}
        </p>
      )}
      <div style={{ marginTop: 12 }}>
        <Toggle
          label={ms.beta}
          checked={allowBetaUpdates}
          onChange={(v) => setSettings({ allowBetaUpdates: v })}
        />
        <p className="field-hint" style={{ marginTop: 6 }}>
          {ms.betaHint}
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
  const m = useT()
  const mf = m.settings.firmware

  const disabledReason = !isConnected
    ? mf.needDevice
    : isSimulated
      ? mf.demoNoFirmware
      : sessionRunning
        ? m.clinical.firmwareSessionLock
        : null

  const checkVersion = async (): Promise<void> => {
    setCheckingVersion(true)
    try {
      const v = await bluetoothService.getDeviceFirmwareVersion()
      setDeviceVersion(v)
      if (v == null) {
        showToast(mf.readFailedOld, 'warning')
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
      showToast(mf.readFileFailed({ message }), 'error')
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
      showToast(mf.emptyFile, 'error')
      return
    }
    const sizeKb = (firmware.size / 1024).toFixed(0)
    const warnLine = versionsMatch && deviceVersion != null ? mf.sameVersionWarn({ version: deviceVersion }) : ''
    const ok = await requestConfirm(mf.confirmTitle, mf.confirmBody({ kb: sizeKb, warn: warnLine }))
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
    showToast(mf.abortSent, 'warning')
  }

  const pct = progress && progress.totalBytes > 0 ? Math.round((progress.bytesSent / progress.totalBytes) * 100) : 0
  const inFlight = progress != null && ['starting', 'transferring', 'finalizing'].includes(progress.phase)

  return (
    <div className="panel glass">
      <h3 style={{ marginBottom: 14 }}>{mf.heading}</h3>
      <p className="text-text-muted text-sm mb-3">{mf.intro}</p>
      <AutoFirmwareStatusLine />

      {disabledReason && <p className="field-hint" style={{ marginBottom: 12 }}>{disabledReason}</p>}

      <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <button
          className="btn btn-secondary"
          disabled={!!disabledReason || checkingVersion || inFlight}
          onClick={() => void checkVersion()}
        >
          {checkingVersion ? mf.querying : mf.queryVersion}
        </button>
        {deviceVersion && <span className="text-sm">{mf.deviceVersion({ version: deviceVersion })}</span>}
      </div>

      <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <button className="btn btn-secondary" disabled={!!disabledReason || inFlight} onClick={() => void pickFile()}>
          {mf.pickFile}
        </button>
        {firmware && (
          <span className="text-sm text-text-muted">
            {firmware.path.split(/[\\/]/).pop()} · {(firmware.size / 1024).toFixed(0)} KB · MD5 {firmware.md5.slice(0, 8)}…
          </span>
        )}
      </div>

      {firmware && (
        <div className="field" style={{ maxWidth: 280, marginBottom: 12 }}>
          <label>{mf.labelField}</label>
          <input
            type="text"
            value={targetLabel}
            disabled={inFlight}
            placeholder={mf.labelPlaceholder}
            onChange={(e) => setTargetLabel(e.target.value)}
          />
        </div>
      )}

      {progress && (
        <div style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="text-sm">
              {progress.phase === 'starting' && mf.starting}
              {progress.phase === 'transferring' && mf.transferring({ pct })}
              {progress.phase === 'finalizing' && mf.finalizing}
              {progress.phase === 'done' && mf.done}
              {progress.phase === 'error' && `❌ ${progress.message ?? mf.failed}`}
              {progress.phase === 'aborted' && mf.aborted}
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
          {mf.start}
        </button>
        {inFlight && (
          <button className="btn btn-danger-ghost" onClick={() => void abortUpdate()}>
            {mf.abort}
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
  const scenarioId = useUiStore((s) => s.demoScenarioId)
  const setScenarioId = useUiStore((s) => s.setDemoScenario)
  const playingId = useUiStore((s) => s.demoPlayingId)
  const [busy, setBusy] = useState(false)
  const m = useT()
  const md = m.settings.demo

  const toggleDemo = async (): Promise<void> => {
    if (demoMode) {
      deviceSimulator.stop()
      setDemoMode(false)
      return
    }
    const ok = await requestConfirm(md.confirmTitle, md.confirmBody)
    if (!ok) return
    setDemoMode(true)
  }

  const purge = async (): Promise<void> => {
    const ok = await requestConfirm(md.purgeTitle, md.purgeBody)
    if (!ok) return
    setBusy(true)
    try {
      const { deleted } = await irms.sessions.purgeDemo()
      showToast(deleted > 0 ? md.purged({ n: deleted }) : md.nothingToPurge, 'success')
    } catch (err) {
      showToast(md.purgeFailed({ message: (err as Error).message }), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel glass">
      <h3 style={{ marginBottom: 14 }}>{md.heading}</h3>
      <p className="text-text-muted text-sm mb-3">{md.intro}</p>

      <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label>{md.scenario}</label>
          <GlassDropdown
            value={scenarioId}
            disabled={playingId != null}
            options={SCENARIOS.map((s) => ({ value: s.id, label: s.label }))}
            onChange={setScenarioId}
          />
        </div>
        <button
          className={demoMode ? 'btn btn-danger-ghost' : 'btn btn-primary'}
          disabled={sessionRunning}
          onClick={() => void toggleDemo()}
        >
          {demoMode ? md.end : md.start}
        </button>
        {demoMode && (
          <button
            className="btn btn-secondary"

            onClick={() => (playingId != null ? deviceSimulator.stop() : deviceSimulator.start(scenarioId))}
          >
            {playingId != null ? md.stopPlayback : md.startPlayback}
          </button>
        )}
      </div>

      {/* 停用理由必須看得見,不能只是一個按不動的按鈕(沿用本檔既有慣例) */}
      {sessionRunning && (
        <p className="field-hint" style={{ marginTop: 8 }}>
          {md.sessionLock}
        </p>
      )}

      <hr className="my-4 border-0 border-t border-border" />
      <button className="btn btn-danger-ghost" disabled={busy} onClick={() => void purge()}>
        {md.purgeButton}
      </button>
      <p className="field-hint" style={{ marginTop: 8 }}>
        {md.purgeHint}
      </p>
    </div>
  )
}
