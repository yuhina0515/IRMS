// 即時監測(設計語言 v2 §8):以「狀態」為中心。deriveDashboardMode 決定目前是哪一種狀態,
// 主面板依狀態換構圖——不能量測時顯示阻斷面板而非量表、超限時整片轉為警報、保持中整圈 success。
// 右側控制欄是療程操作,下方證據層(趨勢圖/數值/姿態)可收合;專注模式只留主面板。
import { lazy, Suspense, useState } from 'react'
import { isProtocolSupported } from '@shared/types'
import { guidanceText, metricLabel, useT, type Messages } from '../i18n'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { computeMetricSample, computeMetricZone, metricInfo, type MetricSample, type MetricZone } from '../services/movementMetric'
import { computeGuidance } from '../services/guidance'
import { BLOCKING_MODES, deriveDashboardMode, valueTone, type DashboardMode } from '../services/dashboardState'
import { sessionController } from '../services/sessionController'
import { bluetoothService } from '../services/bluetooth'
import { useGlobalShortcut } from '../hooks/useGlobalShortcut'
import { AngleVisualizer } from '../components/AngleVisualizer'
import { MetricGauge } from '../components/MetricGauge'
import { ProgressRing } from '../components/ProgressRing'
import { SessionButton, SessionControlPanel, useSessionActions } from '../components/SessionControlPanel'
import { CalibrationWizard } from '../components/CalibrationWizard'
import { AlertIcon, ListIcon, MuteIcon, PlugIcon, SettingsIcon } from '../components/Icons'

// chart.js / three.js 都不小,且只在使用者打開對應分頁時才需要
const LiveChart = lazy(() => import('../components/LiveChart').then((m) => ({ default: m.LiveChart })))
const Leg3D = lazy(() => import('../components/Leg3D').then((m) => ({ default: m.Leg3D })))

type EvidenceTab = 'chart' | 'detail' | 'pose3d' | 'pose2d'

/** 視窗高度不足時證據層預設收合,把高度留給主面板(§8.2) */
const EVIDENCE_OPEN_MIN_HEIGHT = 900

const MODE_CLASS: Partial<Record<DashboardMode, string>> = {
  hardwareError: 'primary--error',
  stale: 'primary--warning',
  alarm: 'primary--alarm',
  silenced: 'primary--silenced',
  holding: 'primary--holding',
  inZone: 'primary--inzone'
}

// ── 阻斷面板 ──────────────────────────────────────────────────────────────────

function Blocker({ mode }: { mode: DashboardMode }): JSX.Element {
  const t = useT()
  const setView = useUiStore((s) => s.setView)
  const demoMode = useUiStore((s) => s.demoMode)
  const b = t.dashboard.blocked
  switch (mode) {
    case 'hardwareError':
      return (
        <div className="blocker blocker--danger" role="alert">
          <AlertIcon />
          <h2>{b.hardwareError.title}</h2>
          <p>{b.hardwareError.body}</p>
        </div>
      )
    case 'unsupported':
      return (
        <div className="blocker">
          <SettingsIcon />
          <h2>{b.unsupported.title}</h2>
          <p>{b.unsupported.body}</p>
          <button type="button" className="btn btn--primary btn--lg" onClick={() => setView('settings')}>
            {b.unsupported.action}
          </button>
        </div>
      )
    case 'noAction':
      return (
        <div className="blocker">
          <ListIcon />
          <h2>{b.noAction.title}</h2>
          <p>{b.noAction.body}</p>
          <button type="button" className="btn btn--lg" onClick={() => setView('actions')}>
            {b.noAction.action}
          </button>
        </div>
      )
    default:
      return (
        <div className="blocker">
          <PlugIcon />
          <h2>{b.disconnected.title}</h2>
          <p>{b.disconnected.body}</p>
          <button
            type="button"
            className="btn btn--primary btn--lg"
            disabled={demoMode}
            title={demoMode ? t.shell.demoConnectBlocked : undefined}
            onClick={() => void bluetoothService.connect()}
          >
            {b.disconnected.action}
          </button>
        </div>
      )
  }
}

// ── 專注模式的線性目標條 ────────────────────────────────────────────────────────

function LinearGauge({ sample, zone }: { sample: MetricSample | null; zone: MetricZone }): JSX.Element {
  const t = useT()
  const domainMax = zone.overLimit + 15
  const pct = (v: number): string => `${(Math.min(domainMax, Math.max(0, v)) / domainMax) * 100}%`
  const tone = valueTone(sample, zone)
  const bandMax = Math.min(zone.max, zone.overLimit)
  return (
    <div className="lgauge">
      <div className={`lgauge__value value--${tone}`}>{sample ? `${sample.value.toFixed(0)}°` : '--'}</div>
      <div className="lgauge__track" aria-hidden>
        <div className="lgauge__band" style={{ left: pct(zone.min), width: `calc(${pct(bandMax)} - ${pct(zone.min)})` }} />
        <div className="lgauge__limit" style={{ left: pct(zone.overLimit) }} />
        {sample && <div className={`lgauge__marker value--${tone}`} style={{ left: pct(sample.value) }} />}
      </div>
      <div className="gauge-legend">
        <span>{zone.max === Infinity ? t.dashboard.targetAtLeast(zone.min) : t.dashboard.target(zone.min, zone.max)}</span>
        <span className="is-limit">{t.dashboard.overLimitAt(zone.overLimit)}</span>
      </div>
    </div>
  )
}

// ── 證據層 ────────────────────────────────────────────────────────────────────

function DetailStats({ t }: { t: Messages }): JSX.Element {
  const angles = useStore((s) => s.angles)
  const hardwareError = useStore((s) => s.hardwareError)
  const fmt = (n: number | undefined): string => (hardwareError ? 'ERR' : n === undefined ? '--' : `${n.toFixed(1)}°`)
  const d = t.dashboard.detail
  const varus =
    hardwareError
      ? 'ERR'
      : angles == null
        ? '--'
        : `${Math.abs(angles.kneeRoll).toFixed(1)}° ${angles.kneeRoll >= 0 ? d.valgus : d.varus}`
  const stats: { label: string; value: string; swatch?: string; color?: string }[] = [
    { label: d.thigh, value: fmt(angles?.thigh), swatch: '', color: 'rgb(var(--color-thigh))' },
    { label: d.shin, value: fmt(angles?.shin), swatch: 'stat__swatch--dashed', color: 'rgb(var(--color-shin))' },
    { label: d.knee, value: fmt(angles?.knee), swatch: '', color: 'rgb(var(--color-knee))' },
    { label: d.thighRoll, value: fmt(angles?.thighRoll) },
    { label: d.shinRoll, value: fmt(angles?.shinRoll) },
    { label: d.varusValgus, value: varus, swatch: 'stat__swatch--dotted', color: 'rgb(var(--color-roll))' }
  ]
  return (
    <div className="stat-grid">
      {stats.map((s) => (
        <div key={s.label} className="stat">
          <div className="stat__label">
            {s.swatch !== undefined && <span className={`stat__swatch ${s.swatch}`} style={{ color: s.color }} />}
            {s.label}
          </div>
          <div className="stat__value">{s.value}</div>
        </div>
      ))}
    </div>
  )
}

function Evidence(): JSX.Element {
  const t = useT()
  const showTrendChart = useStore((s) => s.settings.showTrendChart)
  const show3D2DPose = useStore((s) => s.settings.show3D2DPose)
  const [open, setOpen] = useState(() => window.innerHeight >= EVIDENCE_OPEN_MIN_HEIGHT)
  const [tab, setTab] = useState<EvidenceTab>(showTrendChart ? 'chart' : 'detail')
  const tabs: EvidenceTab[] = [
    ...(showTrendChart ? (['chart'] as const) : []),
    'detail',
    ...(show3D2DPose ? (['pose3d', 'pose2d'] as const) : [])
  ]
  // 設定關掉某分頁時不額外同步 state,直接在渲染時退回可見的分頁
  const active = tabs.includes(tab) ? tab : 'detail'

  return (
    <section className="evidence" aria-label={t.dashboard.evidence}>
      <div className="evidence__bar">
        <span className="evidence__title">{t.dashboard.evidence}</span>
        <div className="tabs" role="tablist">
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="tab"
              aria-selected={open && active === id}
              onClick={() => {
                setTab(id)
                setOpen(true)
              }}
            >
              {t.dashboard.tabs[id]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? t.dashboard.hideEvidence : t.dashboard.showEvidence}
        </button>
      </div>
      {open && (
        <div className="evidence__body" role="tabpanel">
          {active === 'chart' && (
            <Suspense fallback={null}>
              <LiveChart />
            </Suspense>
          )}
          {active === 'detail' && <DetailStats t={t} />}
          {active === 'pose3d' && (
            <Suspense fallback={null}>
              <Leg3D />
            </Suspense>
          )}
          {active === 'pose2d' && <AngleVisualizer />}
        </div>
      )}
    </section>
  )
}

// ── 主畫面 ────────────────────────────────────────────────────────────────────

export function DashboardView(): JSX.Element {
  const t = useT()
  const angles = useStore((s) => s.angles)
  const hardwareError = useStore((s) => s.hardwareError)
  const session = useStore((s) => s.session)
  const params = useStore((s) => s.params)
  const isConnected = useStore((s) => s.isConnected)
  const reconnect = useStore((s) => s.reconnect)
  const lastCalibratedAt = useStore((s) => s.settings.lastCalibratedAt)
  const protocol = useStore((s) => s.settings.protocol)
  const focusMode = useStore((s) => s.settings.focusMode)
  const action = useStore((s) => s.customActions.find((a) => a.id === s.selectedActionId))
  const [wizardOpen, setWizardOpen] = useState(false)
  const actions = useSessionActions()

  // Ctrl/Cmd+Enter 開始或結束療程,與按鈕同一組守衛(見 useSessionActions)。
  // handler 為 null 時 hook 不掛 listener,「現在不可用」是結構性的。
  useGlobalShortcut(
    { key: 'Enter' },
    actions.running ? () => void actions.end() : actions.canStart ? () => void actions.start() : null
  )

  const triggerType = action?.triggerType ?? 'joint_angle'
  const info = metricInfo(triggerType)
  // 必須帶上動作的 safetyLimit,否則量表畫的超限刻線會與引擎實際判定的門檻不一致
  const zone = computeMetricZone({ ...params, triggerType, safetyLimit: action?.safetyLimit ?? null })
  const sample = angles && !hardwareError ? computeMetricSample(angles, triggerType, params.tolerance) : null
  const protocolOk = isProtocolSupported(protocol)
  const now = Date.now()
  const silencedUntil = sessionController.alarmSilencedUntilMs

  const mode = deriveDashboardMode({
    hardwareError: hardwareError != null,
    protocolSupported: protocolOk,
    isConnected,
    reconnecting: reconnect != null,
    hasAction: action != null,
    sessionRunning: session.running,
    alarmActive: session.alarmActive,
    alarmSilencedUntil: silencedUntil,
    now,
    phase: session.phase,
    sample,
    zone
  })
  const blocking = BLOCKING_MODES.has(mode)
  const guidance = computeGuidance(sample, zone, session.phase, session.holdProgress, params.holdTimeMs)
  const excess = sample ? Math.max(0, sample.value - zone.overLimit).toFixed(1) : null

  const primaryBody = blocking ? (
    <Blocker mode={mode} />
  ) : focusMode ? (
    <LinearGauge sample={sample} zone={zone} />
  ) : (
    <MetricGauge
      sample={sample}
      zone={zone}
      info={info}
      phase={session.phase}
      alarm={session.alarmActive}
      error={false}
      stale={mode === 'stale'}
    />
  )

  // 警報只出現在一處:視線所在的主面板(§8.3)
  const footer =
    mode === 'alarm' || mode === 'silenced' ? (
      <div className="alarm-bar" role="alert">
        <div className="alarm-bar__title">
          <AlertIcon />
          {excess != null && Number(excess) > 0 ? t.dashboard.alarmTitle(excess) : t.dashboard.alarmTitleNoValue}
        </div>
        {mode === 'alarm' ? (
          <button type="button" className="btn btn--danger btn--lg" onClick={() => sessionController.silenceAlarm()}>
            <MuteIcon />
            {t.dashboard.silence}
          </button>
        ) : (
          <button type="button" className="btn btn--lg" disabled>
            <MuteIcon />
            {t.dashboard.silenced(Math.max(0, Math.ceil((silencedUntil - now) / 1000)))}
          </button>
        )}
      </div>
    ) : blocking ? null : (
      <div
        className={`coach${mode === 'holding' || mode === 'inZone' ? ' coach--success' : mode === 'stale' ? ' coach--warning' : ''}`}
      >
        <span className={`phase-badge${session.phase === 'holding' ? ' phase-badge--holding' : ''}`}>
          {t.phase[session.phase]}
        </span>
        <span>{guidanceText(t, guidance, info)}</span>
      </div>
    )

  return (
    <div className={`dash${focusMode ? ' dash--focus' : ''}`}>
      {lastCalibratedAt == null && (
        <div className="notice notice--warning calib-strip">
          <AlertIcon />
          <span>{t.dashboard.notCalibrated}</span>
          <button type="button" className="btn btn--sm" onClick={() => setWizardOpen(true)}>
            {t.dashboard.startWizard}
          </button>
        </div>
      )}

      <div className="dash__grid">
        <section className={`primary ${MODE_CLASS[mode] ?? ''}`} aria-label={t.workspaces.dashboard.title}>
          <div className="primary__head">
            <div>
              <div className="primary__action">{action?.name ?? t.dashboard.noActionName}</div>
              <div className="primary__metric">{t.dashboard.metricLabel(metricLabel(t, info))}</div>
            </div>
            {focusMode && (
              <div className="primary__reps">
                <div className="label">{t.dashboard.reps}</div>
                <span className="num">{session.reps}</span>
              </div>
            )}
          </div>
          <div className="primary__body">{primaryBody}</div>
          {footer}
          {focusMode && (
            <div className="row row--end">
              <div style={{ width: 240 }}>
                <SessionButton actions={actions} size="md" />
              </div>
            </div>
          )}
        </section>

        {!focusMode && (
          <aside className="side" aria-label={t.session.action}>
            <div className="side__counts">
              <div className={`side__reps${session.reps > 0 ? ' side__reps--bump' : ''}`}>
                <div className="label">{t.dashboard.reps}</div>
                <span key={session.reps} className="num">
                  {session.reps}
                </span>
              </div>
              <ProgressRing percent={session.holdProgress} label={t.dashboard.hold} />
            </div>
            <SessionControlPanel actions={actions} />
          </aside>
        )}

        {!focusMode && <Evidence />}
      </div>

      {wizardOpen && <CalibrationWizard onClose={() => setWizardOpen(false)} />}
    </div>
  )
}
