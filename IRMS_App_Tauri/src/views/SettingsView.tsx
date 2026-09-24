// 系統設定(設計語言 v2 §9):校準與一般設定形成首屏雙欄 workbench;軟體更新、韌體 OTA、
// 示範模式依風險與使用頻率向下排列為全寬區塊。危險操作的區塊標題帶「有風險」徽章。
import { useEffect, useState } from 'react'
import { JOINT_PROTOCOLS } from '@shared/types'
import type { FirmwareBinary, UpdateStatus } from '@shared/types'
import { LOCALE_OPTIONS, messagesFor, useT, type Locale, type Messages } from '../i18n'
import { useStore, type Settings } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { CalibrationWizard } from '../components/CalibrationWizard'
import { Dropdown } from '../components/Dropdown'
import { buildQuickZeroPatch } from '../services/calibration'
import { SCENARIOS } from '../services/simulation/scenarios'
import { deviceSimulator } from '../services/simulation/simulator'
import { bluetoothService, type OtaProgress } from '../services/bluetooth'
import { irms } from '../platform/irmsApi'
import { AlertIcon, CheckIcon, InfoIcon } from '../components/Icons'

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
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        className="input"
        type="number"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </label>
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
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}): JSX.Element {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const limbList = (t: Messages, proximal: boolean, distal: boolean): string =>
  [proximal && t.common.thigh, distal && t.common.shin].filter(Boolean).join(t.common.listSep)

export function SettingsView(): JSX.Element {
  const t = useT()
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const rawAngles = useStore((s) => s.rawAngles)
  const isConnected = useStore((s) => s.isConnected)
  const showToast = useUiStore((s) => s.showToast)
  const [wizardOpen, setWizardOpen] = useState(false)

  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void => setSettings({ [key]: value } as Partial<Settings>)

  // 校準在療程進行中凍結(見 store 的 CALIBRATION_KEYS):一場的資料必須全程由同一組轉換產生
  const calibrationLocked = useStore((s) => s.session.running)
  // MTU 沒協商上去時 roll 恆為 0,快速歸零對 roll 實質無效——提示不能再宣稱「含 Roll」
  const linkTruncated = useStore((s) => s.linkTruncated)

  const quickZero = (): void => {
    if (!rawAngles) {
      showToast(t.settings.quickZeroNoData, 'warning')
      return
    }
    setSettings(buildQuickZeroPatch(rawAngles, settings))
    showToast(linkTruncated ? t.settings.quickZeroPitchOnly : t.settings.quickZeroDone, linkTruncated ? 'warning' : 'success')
  }

  return (
    <section className="view">
      <p className="view__lead">{t.settings.subtitle}</p>

      <div className="workbench">
        <div className="panel">
          <h2 className="panel__title">{t.settings.calibration}</h2>
          <div className="stack">
            <p className="text-dim">
              {settings.lastCalibratedAt
                ? t.settings.lastCalibrated(new Date(settings.lastCalibratedAt).toLocaleString(settings.language))
                : t.settings.neverCalibrated}
            </p>
            {/* roll 不參與任何達標/超限判定,這條只說明「顯示方向」,語氣刻意不像判定風險 */}
            {settings.lastCalibratedAt != null && (!settings.proximalRollVerified || !settings.distalRollVerified) && (
              <div className="notice notice--info">
                <InfoIcon />
                {t.settings.rollUnverified(limbList(t, !settings.proximalRollVerified, !settings.distalRollVerified))}
              </div>
            )}
            <div>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!isConnected || calibrationLocked}
                onClick={() => setWizardOpen(true)}
              >
                {t.settings.startWizard}
              </button>
            </div>
            {/* 停用理由必須看得見——tooltip 要停留才出現,按鈕看起來只是「按了沒反應」 */}
            {!isConnected && <p className="field__hint">{t.settings.wizardNeedsConnection}</p>}
            {calibrationLocked && <p className="field__hint">{t.settings.calibrationLocked}</p>}

            <details className="fold">
              <summary>{t.settings.advanced}</summary>
              <div className="stack">
                <p className="field__hint">{t.settings.advancedHint}</p>
                <div className="fields">
                  <NumField label={t.settings.thighZero} value={settings.proximalZeroRaw} onChange={(v) => set('proximalZeroRaw', v)} disabled={calibrationLocked} />
                  <NumField label={t.settings.shinZero} value={settings.distalZeroRaw} onChange={(v) => set('distalZeroRaw', v)} disabled={calibrationLocked} />
                </div>
                <div className="row" style={{ gap: 'var(--sp-6)' }}>
                  <Toggle label={t.settings.invertThigh} checked={settings.proximalInvert} onChange={(v) => set('proximalInvert', v)} disabled={calibrationLocked} />
                  <Toggle label={t.settings.invertShin} checked={settings.distalInvert} onChange={(v) => set('distalInvert', v)} disabled={calibrationLocked} />
                </div>
                <div className="fields">
                  <NumField label={t.settings.thighRollZero} value={settings.proximalRollZeroRaw} onChange={(v) => set('proximalRollZeroRaw', v)} disabled={calibrationLocked} />
                  <NumField label={t.settings.shinRollZero} value={settings.distalRollZeroRaw} onChange={(v) => set('distalRollZeroRaw', v)} disabled={calibrationLocked} />
                </div>
                <div className="row" style={{ gap: 'var(--sp-6)' }}>
                  <Toggle label={t.settings.invertThighRoll} checked={settings.proximalRollInvert} onChange={(v) => set('proximalRollInvert', v)} disabled={calibrationLocked} />
                  <Toggle label={t.settings.invertShinRoll} checked={settings.distalRollInvert} onChange={(v) => set('distalRollInvert', v)} disabled={calibrationLocked} />
                </div>
                <div>
                  <button type="button" className="btn" disabled={calibrationLocked} onClick={quickZero}>
                    {t.settings.quickZero}
                  </button>
                </div>
                <p className="micro">{t.settings.appSideNote}</p>
              </div>
            </details>
          </div>
        </div>

        <div className="panel">
          <h2 className="panel__title">{t.settings.general}</h2>
          <div className="settings-group">
            <Segmented<Locale>
              label={t.settings.language}
              value={settings.language}
              // 每個語言以它自己的語言顯示名稱,看不懂目前語言的人也找得到切回去的按鈕
              options={LOCALE_OPTIONS.map((l) => ({ value: l, label: messagesFor(l).meta.languageName }))}
              onChange={(v) => set('language', v)}
            />
            <Segmented<Settings['themeMode']>
              label={t.settings.theme}
              value={settings.themeMode}
              options={[
                { value: 'system', label: t.settings.themeSystem },
                { value: 'light', label: t.settings.themeLight },
                { value: 'dark', label: t.settings.themeDark }
              ]}
              onChange={(v) => set('themeMode', v)}
            />
          </div>
          <div className="settings-group">
            <div className="field">
              <label className="field__label" htmlFor="settings-protocol">
                {t.settings.defaultProtocol}
              </label>
              <Dropdown
                id="settings-protocol"
                value={settings.protocol}
                onChange={(v) => set('protocol', v as Settings['protocol'])}
                options={JOINT_PROTOCOLS.map((p) => ({ value: p.value, label: t.protocols[p.value] }))}
              />
            </div>
            <div className="fields">
              <NumField label={t.settings.chartMaxPoints} value={settings.maxChartPoints} onChange={(v) => set('maxChartPoints', Math.max(10, Math.round(v)))} />
              <NumField label={t.settings.flushInterval} value={settings.flushIntervalSec} onChange={(v) => set('flushIntervalSec', Math.max(1, Math.round(v)))} />
            </div>
          </div>
          <div className="settings-group">
            <Toggle label={t.settings.showKneeRoll} checked={settings.showKneeRoll} onChange={(v) => set('showKneeRoll', v)} />
            <p className="field__hint">{t.settings.showKneeRollHint}</p>
            <Toggle label={t.settings.showTrendChart} checked={settings.showTrendChart} onChange={(v) => set('showTrendChart', v)} />
            <Toggle label={t.settings.show3D2DPose} checked={settings.show3D2DPose} onChange={(v) => set('show3D2DPose', v)} />
            <p className="field__hint">{t.settings.evidenceHint}</p>
          </div>
        </div>
      </div>

      {wizardOpen && <CalibrationWizard onClose={() => setWizardOpen(false)} />}

      <SoftwareUpdatePanel />
      <FirmwareOtaPanel />
      <DemoModePanel />
    </section>
  )
}

/** UpdateStatus → 目前語言的狀態文字。null = 從未檢查過,不顯示任何狀態列。 */
function describeUpdateStatus(t: Messages, status: UpdateStatus | null): string | null {
  if (!status) return null
  const u = t.settings.update
  switch (status.state) {
    case 'checking':
      return u.checking
    case 'available':
      return u.available(status.version)
    case 'downloading':
      return u.downloading(status.percent)
    case 'downloaded':
      return u.downloaded(status.version)
    case 'not-available':
      return u.upToDate
    case 'error':
      return u.error(status.message)
  }
}

/**
 * App 軟體更新面板。下載/重啟套用本身仍然靜默(UpdateBanner 只在已下載完成時出現),
 * 但「檢查」的結果(已是最新/失敗/發現新版本)必須有持續可見的出口——否則檢查失敗與
 * 沒有新版本在畫面上長得跟「按下去什麼都沒發生」一模一樣(2026-09-13 使用者實測回報)。
 */
function SoftwareUpdatePanel(): JSX.Element {
  const t = useT()
  const allowBetaUpdates = useStore((s) => s.settings.allowBetaUpdates)
  const setSettings = useStore((s) => s.setSettings)
  const [version, setVersion] = useState<string | null>(null)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const checking = status?.state === 'checking'

  useEffect(() => {
    irms.updates.getCurrentVersion().then(setVersion)
  }, [])

  useEffect(() => irms.updates.onStatusChange(setStatus), [])

  const statusText = describeUpdateStatus(t, status)

  return (
    <div className="panel">
      <h2 className="panel__title">{t.settings.update.title}</h2>
      <p className="panel__lead">{t.settings.update.body}</p>
      <div className="stack">
        <div className="row">
          {version && <span className="text-dim">{t.settings.update.current(version)}</span>}
          <button type="button" className="btn" disabled={checking} onClick={() => void irms.updates.checkNow()}>
            {checking ? t.settings.update.checking : t.settings.update.check}
          </button>
        </div>
        {statusText && (
          <p className="field__hint" role="status">
            {statusText}
          </p>
        )}
        <Toggle label={t.settings.update.beta} checked={allowBetaUpdates} onChange={(v) => setSettings({ allowBetaUpdates: v })} />
        <p className="field__hint">{t.settings.update.betaHint}</p>
      </div>
    </div>
  )
}

/**
 * 裝置韌體 OTA 更新面板。放在設定頁而非另開畫面——這是全 App 唯一一處直接操作硬體底層的
 * 危險操作,設定頁本來就是「系統層級設定」的既有心智模型。
 */
function FirmwareOtaPanel(): JSX.Element {
  const t = useT()
  const o = t.settings.ota
  const isConnected = useStore((s) => s.isConnected)
  const isSimulated = bluetoothService.isSimulated
  // 療程進行中鎖定:flash 寫入會讓 ESP32 兩顆核心短暫停頓,感測取樣與回饋都會卡頓——
  // 正在半蹲/外展的患者可能因回饋延遲而失去平衡。
  const sessionRunning = useStore((s) => s.session.running)
  const showToast = useUiStore((s) => s.showToast)
  const requestConfirm = useUiStore((s) => s.requestConfirm)

  const [deviceVersion, setDeviceVersion] = useState<string | null>(null)
  const [checkingVersion, setCheckingVersion] = useState(false)
  const [firmware, setFirmware] = useState<FirmwareBinary | null>(null)
  const [targetLabel, setTargetLabel] = useState('')
  const [progress, setProgress] = useState<OtaProgress | null>(null)
  const [busy, setBusy] = useState(false)

  const disabledReason = !isConnected ? o.needConnection : isSimulated ? o.demoBlocked : sessionRunning ? o.sessionBlocked : null

  const checkVersion = async (): Promise<void> => {
    setCheckingVersion(true)
    try {
      const v = await bluetoothService.getDeviceFirmwareVersion()
      setDeviceVersion(v)
      if (v == null) showToast(o.versionReadFailed, 'warning')
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
      showToast(o.readFailed(err instanceof Error ? err.message : String(err)), 'error')
    }
  }

  // 版本比對僅供確認用的提示——.bin 沒有可靠的版本中繼資料,標籤是使用者自己填的
  const versionsMatch = targetLabel.trim().length > 0 && deviceVersion != null && targetLabel.trim() === deviceVersion

  const startUpdate = async (): Promise<void> => {
    if (!firmware) return
    // 選到空檔案是使用者操作,不是 bug——在這裡先攔下來給看得懂的訊息
    if (firmware.size === 0) {
      showToast(o.emptyFile, 'error')
      return
    }
    const sizeKb = (firmware.size / 1024).toFixed(0)
    const ok = await requestConfirm(o.confirmTitle, o.confirmBody(sizeKb, versionsMatch ? o.sameVersion(deviceVersion!) : ''))
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
    showToast(o.abortSent, 'warning')
  }

  const pct = progress && progress.totalBytes > 0 ? Math.round((progress.bytesSent / progress.totalBytes) * 100) : 0
  const inFlight = progress != null && ['starting', 'transferring', 'finalizing'].includes(progress.phase)

  return (
    <div className="panel">
      <h2 className="panel__title">
        {o.title}
        <span className="badge badge--danger">{o.risk}</span>
      </h2>
      <p className="panel__lead">{o.body}</p>

      <div className="stack">
        {disabledReason && (
          <div className="notice">
            <InfoIcon />
            {disabledReason}
          </div>
        )}

        <div className="row">
          <button type="button" className="btn" disabled={!!disabledReason || checkingVersion || inFlight} onClick={() => void checkVersion()}>
            {checkingVersion ? o.checkingVersion : o.checkVersion}
          </button>
          {deviceVersion && <span>{o.deviceVersion(deviceVersion)}</span>}
        </div>

        <div className="row">
          <button type="button" className="btn" disabled={!!disabledReason || inFlight} onClick={() => void pickFile()}>
            {o.pickFile}
          </button>
          {firmware && (
            <span className="text-dim num">
              {firmware.path.split(/[\\/]/).pop()} · {(firmware.size / 1024).toFixed(0)} KB · MD5 {firmware.md5.slice(0, 8)}…
            </span>
          )}
        </div>

        {firmware && (
          <label className="field" style={{ maxWidth: 320 }}>
            <span className="field__label">{o.label}</span>
            <input
              className="input"
              type="text"
              value={targetLabel}
              disabled={inFlight}
              placeholder={o.labelPlaceholder}
              onChange={(e) => setTargetLabel(e.target.value)}
            />
          </label>
        )}

        {progress && (
          <div className="stack" style={{ gap: 'var(--sp-1)' }}>
            <div className="row row--between">
              <span className="row" style={{ gap: 'var(--sp-1)' }}>
                {progress.phase === 'done' && <CheckIcon className="icon text-success" />}
                {progress.phase === 'error' && <AlertIcon className="icon text-danger" />}
                <span>
                  {progress.phase === 'starting' && o.starting}
                  {progress.phase === 'transferring' && o.transferring(pct)}
                  {progress.phase === 'finalizing' && o.finalizing}
                  {progress.phase === 'done' && o.done}
                  {progress.phase === 'error' && (progress.message ?? o.failed)}
                  {progress.phase === 'aborted' && o.aborted}
                </span>
              </span>
              <span className="text-muted num">
                {(progress.bytesSent / 1024).toFixed(0)} / {(progress.totalBytes / 1024).toFixed(0)} KB
              </span>
            </div>
            <div className={`progress${progress.phase === 'error' ? ' progress--error' : ''}`}>
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        <div className="row">
          <button type="button" className="btn btn--primary" disabled={!!disabledReason || !firmware || busy} onClick={() => void startUpdate()}>
            {o.start}
          </button>
          {inFlight && (
            <button type="button" className="btn btn--danger-ghost" onClick={() => void abortUpdate()}>
              {o.abort}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 示範模式面板。這個模式會出貨,代價是模擬資料真的會寫進與療程紀錄同一個資料表。
 * 所以防護必須是結構性的:sessions.source CHECK 約束、進行中不可切換、紀錄/分析/CSV
 * 表頭/CSV 檔名四處標示、全域橫幅,以及這裡的一鍵清除。
 */
function DemoModePanel(): JSX.Element {
  const t = useT()
  const d = t.settings.demo
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
    if (!(await requestConfirm(d.confirmTitle, d.confirmBody))) return
    setDemoMode(true)
  }

  const purge = async (): Promise<void> => {
    if (!(await requestConfirm(d.purgeTitle, d.purgeBody))) return
    setBusy(true)
    try {
      const { deleted } = await irms.sessions.purgeDemo()
      showToast(deleted > 0 ? d.purged(deleted) : d.nothingToPurge, 'success')
    } catch (err) {
      showToast(d.purgeFailed((err as Error).message), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <h2 className="panel__title">{d.title}</h2>
      <p className="panel__lead">{d.body}</p>
      <div className="stack">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, minWidth: 260, maxWidth: 420 }}>
            <label className="field__label" htmlFor="demo-scenario">
              {d.scenario}
            </label>
            <Dropdown
              id="demo-scenario"
              value={scenarioId}
              disabled={demoMode}
              options={SCENARIOS.map((s) => ({ value: s.id, label: d.scenarios[s.id] ?? s.label }))}
              onChange={setScenarioId}
            />
          </div>
          <button
            type="button"
            className={demoMode ? 'btn btn--danger-ghost' : 'btn btn--primary'}
            disabled={sessionRunning}
            onClick={() => void toggleDemo()}
          >
            {demoMode ? d.disable : d.enable}
          </button>
          {demoMode && (
            <button type="button" className="btn" disabled={deviceSimulator.running} onClick={() => deviceSimulator.start(scenarioId)}>
              {d.play}
            </button>
          )}
        </div>
        {sessionRunning && <p className="field__hint">{d.sessionBlocked}</p>}
        <hr className="divider" />
        <div>
          <button type="button" className="btn btn--danger-ghost" disabled={busy} onClick={() => void purge()}>
            {d.purge}
          </button>
        </div>
        <p className="field__hint">{d.purgeHint}</p>
      </div>
    </div>
  )
}
