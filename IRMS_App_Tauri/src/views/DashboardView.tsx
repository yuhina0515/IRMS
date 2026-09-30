// renderer/views/DashboardView.tsx
// UI v3 live monitoring (doc/ui-v3-gpt/PROPOSAL.md §4–§6): one coaching band, one judged
// metric beside a large pose stage, and a bottom dock. The six-value strip is gone — thigh/
// shin/roll live in an explicitly opened diagnostics view with honest labels (2026-09-25
// real-device finding: roll mostly reflects mounting, not anatomy).
import { lazy, Suspense, useState } from 'react'
import { isProtocolSupported } from '@shared/types'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { computeMetricSample, computeMetricZone, metricInfo } from '../services/movementMetric'
import { computeGuidance, guidanceText } from '../services/guidance'
import { PoseSide } from '../components/PoseSide'
import { SessionDock } from '../components/SessionDock'
import { CalibrationWizard } from '../components/CalibrationWizard'
import { TRIGGER_SHORT } from './actionLabels'
import { TIME_MINUTES, formatDateTime, formatNumber, useLocale, useT } from '../i18n'

const Leg3D = lazy(() => import('../components/Leg3D').then((m) => ({ default: m.Leg3D })))

type StageView = '2d' | '3d' | 'detail'

type Coach = { tone: 'neutral' | 'good' | 'warn' | 'danger'; mark: string; title: string; sub?: string }

function Diagnostics(): JSX.Element {
  const angles = useStore((s) => s.angles)
  const hardwareError = useStore((s) => s.hardwareError)
  const locale = useLocale()
  const d = useT().clinical.diagnostics
  const fmt = (n: number | undefined): string =>
    hardwareError ? '—' : n == null ? '—' : `${formatNumber(locale, n)}°`
  const rows: [string, string, string][] = [
    [d.thigh, d.relativeToZero, fmt(angles?.thigh)],
    [d.shin, d.relativeToZero, fmt(angles?.shin)],
    [d.knee, d.kneeNote, fmt(angles?.knee)],
    [d.thighRoll, d.rollNote, fmt(angles?.thighRoll)],
    [d.shinRoll, d.rollNote, fmt(angles?.shinRoll)],
    [d.rollDiff, d.rollDiffNote, fmt(angles?.kneeRoll)]
  ]
  return (
    <table className="v3-diag">
      <tbody>
        {rows.map(([name, note, value]) => (
          <tr key={name}>
            <th scope="row">
              {name}
              <span>{note}</span>
            </th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function DashboardView(): JSX.Element {
  const angles = useStore((s) => s.angles)
  const hardwareError = useStore((s) => s.hardwareError)
  const session = useStore((s) => s.session)
  const params = useStore((s) => s.params)
  const isConnected = useStore((s) => s.isConnected)
  const lastCalibratedAt = useStore((s) => s.settings.lastCalibratedAt)
  const protocol = useStore((s) => s.settings.protocol)
  const poseView = useStore((s) => s.settings.poseView)
  const setSettings = useStore((s) => s.setSettings)
  const action = useStore((s) => s.customActions.find((a) => a.id === s.selectedActionId))
  const demoMode = useUiStore((s) => s.demoMode)
  const setView = useUiStore((s) => s.setView)
  const [detail, setDetail] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const stage: StageView = detail ? 'detail' : poseView
  const m = useT()
  const c = m.clinical.dashboard
  const locale = useLocale()
  const n0 = (v: number): string => formatNumber(locale, v, 0)
  const n1 = (v: number): string => formatNumber(locale, v, 1)

  const angleRange = useStore((s) => s.angleRange)
  const triggerType = action?.triggerType ?? 'joint_angle'
  const info = metricInfo(triggerType, locale)
  const zone = computeMetricZone({ ...params, triggerType })
  // 個人舒適角度/極限範圍(膝角);未量測為 null,不顯示任何預設值
  const limits = { comfort: angleRange?.comfortAngle ?? null, limit: angleRange?.limitAngle ?? null }
  // 標尺畫的是主指標;只有膝屈曲類的主指標就是膝角,才能把個人範圍畫在同一把尺上
  const rulerShowsKnee = triggerType === 'joint_angle'
  const live = angles != null && hardwareError == null && isConnected
  const sample = live ? computeMetricSample(angles, triggerType, params.tolerance) : null
  const protocolOk = isProtocolSupported(protocol)
  const calibrated = lastCalibratedAt != null
  const guidance = computeGuidance(sample, zone, session.phase, session.holdProgress, params.holdTimeMs, limits)
  const inZone = sample != null && sample.value >= zone.min && sample.value <= zone.max

  // State contract (PROPOSAL §5): fault / beyond personal limit → blocking conditions → coaching.
  const coach: Coach = hardwareError
    ? { tone: 'danger', mark: '×', title: c.sensorFault({ code: hardwareError }), sub: c.sensorFaultSub }
    : session.alarmActive || guidance.kind === 'overLimit'
      ? {
          tone: 'danger',
          mark: '!',
          title: c.overLimitTitle,
          sub:
            sample && limits.limit != null
              ? c.overLimitSub({ knee: n0(sample.knee), limit: n0(limits.limit) })
              : undefined
        }
      : !protocolOk
        ? { tone: 'warn', mark: '!', title: m.dashboard.protocolUnsupported, sub: c.protocolUnsupportedSub }
        : !isConnected
          ? { tone: 'neutral', mark: '○', title: m.dashboard.notConnected, sub: m.dashboard.notConnectedSub }
          : !calibrated && !demoMode
            ? { tone: 'warn', mark: '!', title: m.dashboard.notCalibrated, sub: m.dashboard.notCalibratedSub }
            : !action
              ? { tone: 'neutral', mark: '○', title: m.dashboard.selectAction, sub: m.dashboard.selectActionSub }
              : !session.running
                ? { tone: 'neutral', mark: '○', title: m.dashboard.ready, sub: m.dashboard.readySub }
                : session.phase === 'holding'
                ? { tone: 'good', mark: '✓', title: c.holding, sub: c.holdingSub({ sec: n1(params.holdTimeMs / 1000) }) }
                : session.phase === 'restPending'
                  ? { tone: 'good', mark: '✓', title: c.restPending, sub: guidanceText(guidance, info) }
                  : { tone: 'neutral', mark: '→', title: guidanceText(guidance, info) }

  const holdRemain = Math.max(0, (params.holdTimeMs / 1000) * (1 - session.holdProgress / 100))
  const rulerTop = Math.max(Number.isFinite(zone.max) ? zone.max : zone.min, rulerShowsKnee ? (limits.limit ?? limits.comfort ?? 0) : 0)
  const rulerMax = Math.max(160, Math.ceil((rulerTop + 20) / 10) * 10)
  const pct = (v: number): string => `${Math.min(100, Math.max(0, (v / rulerMax) * 100))}%`
  const zoneText = Number.isFinite(zone.max) ? `${n0(zone.min)}–${n0(zone.max)}°` : `≥ ${n0(zone.min)}°`

  return (
    <div className="v3-page">
      <div className="v3-page-head">
        <div>
          <h1>{action?.name ?? m.dashboard.title}</h1>
          <p>
            {m.dashboard.subtitle({
              metric: info.label,
              trigger: TRIGGER_SHORT[triggerType],
              zone: zoneText,
              hold: n1(params.holdTimeMs / 1000)
            })}
          </p>
        </div>
        <div className="v3-page-actions">
          {calibrated ? (
            <button className="v3-chip good" onClick={() => setWizardOpen(true)} title={m.dashboard.recalibrate}>
              {m.dashboard.calibratedChip({ time: formatDateTime(locale, new Date(lastCalibratedAt), TIME_MINUTES) })}
            </button>
          ) : (
            <button className="v3-chip warn" onClick={() => setWizardOpen(true)}>
              {m.dashboard.notCalibratedChip}
            </button>
          )}
        </div>
      </div>

      <section className={`v3-sheet v3-live tone-${coach.tone}`} aria-label={m.dashboard.liveAria}>
        <div className="v3-coach" role={coach.tone === 'danger' ? 'alert' : 'status'}>
          <span className="v3-coach-mark" aria-hidden>
            {coach.mark}
          </span>
          <div className="v3-coach-text">
            <strong>{coach.title}</strong>
            {coach.sub && <span>{coach.sub}</span>}
          </div>
          {session.running && session.phase === 'holding' && (
            <div className="v3-coach-side">
              <strong>{m.dashboard.holdRemain({ sec: n1(holdRemain) })}</strong>
              <span>{m.dashboard.repNumber({ n: session.reps + 1 })}</span>
            </div>
          )}
          {!protocolOk && (
            <button className="btn btn-secondary btn-sm" onClick={() => setView('settings')}>
              {m.common.goToSettings}
            </button>
          )}
        </div>

        <div className="v3-stage">
          <div className="v3-metric">
            <span className="v3-metric-label">{m.dashboard.metricLabel({ label: info.label })}</span>
            <span className="v3-metric-value" aria-live="off">
              {sample ? (
                <>
                  {Math.round(sample.value)}
                  <sup>°</sup>
                </>
              ) : (
                <span className="v3-metric-none">—</span>
              )}
            </span>
            <span className="v3-metric-zone">
              <strong>{zoneText}</strong>
              {m.dashboard.zoneSuffix}
              {limits.comfort != null
                ? c.rangeComfort({ deg: n0(limits.comfort) }) +
                  (limits.limit != null ? c.rangeLimit({ deg: n0(limits.limit) }) : '')
                : c.rangeNotMeasured}
            </span>
            {session.overComfort && !session.alarmActive && sample && (
              <span className="v3-chip warn" role="status">
                {c.overComfort({
                  knee: n0(sample.knee),
                  comfort: limits.comfort != null ? n0(limits.comfort) : ''
                })}
              </span>
            )}
            {sample && triggerType !== 'joint_angle' && (
              <span className={`v3-chip ${sample.kneeStraightOk ? 'good' : 'warn'}`}>
                {sample.kneeStraightOk ? '✓' : '!'} {c.kneeStraight({ max: String(sample.kneeMax) })}
              </span>
            )}
            <div className="v3-ruler" aria-hidden>
              <span className="v3-ruler-track" />
              <span
                className="v3-ruler-zone"
                style={{ left: pct(zone.min), width: `calc(${pct(Number.isFinite(zone.max) ? zone.max : rulerMax)} - ${pct(zone.min)})` }}
              />
              {rulerShowsKnee && limits.comfort != null && (
                <span className="v3-ruler-comfort" style={{ left: pct(limits.comfort) }} />
              )}
              {rulerShowsKnee && limits.limit != null && <span className="v3-ruler-limit" style={{ left: pct(limits.limit) }} />}
              {sample && <span className="v3-ruler-now" style={{ left: pct(sample.value) }} />}
            </div>
            <div className="v3-ruler-scale" aria-hidden>
              <span>0°</span>
              <span style={{ left: pct(zone.min) }}>{zone.min.toFixed(0)}</span>
              {rulerShowsKnee && limits.comfort != null && (
                <span style={{ left: pct(limits.comfort) }}>{c.rulerComfort({ deg: n0(limits.comfort) })}</span>
              )}
              {rulerShowsKnee && limits.limit != null && (
                <span style={{ left: pct(limits.limit) }}>{c.rulerLimit({ deg: n0(limits.limit) })}</span>
              )}
              <span>{rulerMax}°</span>
            </div>
          </div>

          <div className="v3-pose">
            <div className="v3-pose-head">
              <strong>{stage === 'detail' ? m.dashboard.sensorValues : m.dashboard.poseTitle}</strong>
              <div className="v3-segmented" role="group" aria-label={m.dashboard.poseAria}>
                <button
                  aria-pressed={stage === '2d'}
                  onClick={() => {
                    setDetail(false)
                    setSettings({ poseView: '2d' })
                  }}
                >
                  {m.dashboard.view2d}
                </button>
                <button
                  aria-pressed={stage === '3d'}
                  onClick={() => {
                    setDetail(false)
                    setSettings({ poseView: '3d' })
                  }}
                >
                  3D
                </button>
                <button aria-pressed={stage === 'detail'} onClick={() => setDetail(true)}>
                  {m.dashboard.values}
                </button>
              </div>
            </div>
            <div className="v3-pose-body">
              {stage === '2d' && <PoseSide triggerType={triggerType} targetMin={zone.min} inZone={inZone} />}
              {stage === '3d' && (
                <Suspense fallback={<span className="v3-pose-caption">{m.dashboard.loading3d}</span>}>
                  <Leg3D />
                </Suspense>
              )}
              {stage === 'detail' && <Diagnostics />}
            </div>
            <p className="v3-pose-caption">
              {calibrated ? c.captionAxes : m.dashboard.notCalibratedCaption}
              {c.captionLateral}
              {stage === '3d' ? c.caption3d : stage === 'detail' ? c.captionRoll : ''}
            </p>
          </div>
        </div>

        <SessionDock onCalibrate={() => setWizardOpen(true)} />
      </section>

      {wizardOpen && <CalibrationWizard onClose={() => setWizardOpen(false)} />}
    </div>
  )
}
