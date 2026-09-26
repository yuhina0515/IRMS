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

const Leg3D = lazy(() => import('../components/Leg3D').then((m) => ({ default: m.Leg3D })))

type StageView = '2d' | '3d' | 'detail'

type Coach = { tone: 'neutral' | 'good' | 'warn' | 'danger'; mark: string; title: string; sub?: string }

function Diagnostics(): JSX.Element {
  const angles = useStore((s) => s.angles)
  const hardwareError = useStore((s) => s.hardwareError)
  const fmt = (n: number | undefined): string => (hardwareError ? '—' : n == null ? '—' : `${n.toFixed(1)}°`)
  const rows: [string, string, string][] = [
    ['大腿角度', '相對站直零位', fmt(angles?.thigh)],
    ['小腿角度', '相對站直零位', fmt(angles?.shin)],
    ['膝關節夾角', '大腿與小腿角度差', fmt(angles?.knee)],
    ['大腿感測器 Roll', '安裝／軸向排錯用', fmt(angles?.thighRoll)],
    ['小腿感測器 Roll', '安裝／軸向排錯用', fmt(angles?.shinRoll)],
    ['兩感測器 Roll 差', '未驗證,非內外翻量測', fmt(angles?.kneeRoll)]
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

  const triggerType = action?.triggerType ?? 'joint_angle'
  const info = metricInfo(triggerType)
  // 必須帶上動作的 safetyLimit,否則標尺上的超限線會與引擎實際判定的門檻不一致
  const zone = computeMetricZone({ ...params, triggerType, safetyLimit: action?.safetyLimit ?? null })
  const live = angles != null && hardwareError == null && isConnected
  const sample = live ? computeMetricSample(angles, triggerType, params.tolerance) : null
  const protocolOk = isProtocolSupported(protocol)
  const calibrated = lastCalibratedAt != null
  const guidance = computeGuidance(sample, zone, session.phase, session.holdProgress, params.holdTimeMs)
  const inZone = sample != null && sample.value >= zone.min && sample.value <= zone.max

  // State contract (PROPOSAL §5): fault / over-limit → blocking conditions → coaching.
  const coach: Coach = hardwareError
    ? { tone: 'danger', mark: '×', title: `感測器異常 · ${hardwareError}`, sub: '已停止回饋輸出,等待感測器復原;可隨時結束療程' }
    : session.alarmActive || guidance.kind === 'overLimit'
      ? {
          tone: 'danger',
          mark: '!',
          title: '超出上限,請停止加深',
          sub: sample ? `目前 ${sample.value.toFixed(0)}° · 上限 ${zone.overLimit.toFixed(0)}°` : undefined
        }
      : !protocolOk
        ? { tone: 'warn', mark: '!', title: '此協定尚未支援', sub: '判定目前只支援膝關節,請到設定切換回膝關節' }
        : !isConnected
          ? { tone: 'neutral', mark: '○', title: '裝置未連線', sub: '請從右上角連線裝置' }
          : !calibrated && !demoMode
            ? { tone: 'warn', mark: '!', title: '請先完成校準', sub: '未校準時角度方向與大小都可能不正確,完成校準後才能開始療程' }
            : !action
              ? { tone: 'neutral', mark: '○', title: '請選擇動作', sub: '在下方選擇動作處方' }
              : !session.running
                ? { tone: 'neutral', mark: '○', title: '準備開始', sub: '確認動作與參數後按「開始療程」' }
                : session.phase === 'holding'
                ? { tone: 'good', mark: '✓', title: '很好,保持這個位置', sub: `已進入目標區間,保持滿 ${(params.holdTimeMs / 1000).toFixed(1)} 秒` }
                : session.phase === 'restPending'
                  ? { tone: 'good', mark: '✓', title: '已完成,請回到起始位', sub: guidanceText(guidance, info) }
                  : { tone: 'neutral', mark: '→', title: guidanceText(guidance, info) }

  const holdRemain = Math.max(0, (params.holdTimeMs / 1000) * (1 - session.holdProgress / 100))
  const rulerMax = Math.max(160, Math.ceil((zone.overLimit + 20) / 10) * 10)
  const pct = (v: number): string => `${Math.min(100, Math.max(0, (v / rulerMax) * 100))}%`
  const zoneText = Number.isFinite(zone.max)
    ? `${zone.min.toFixed(0)}–${zone.max.toFixed(0)}°`
    : `≥ ${zone.min.toFixed(0)}°`

  return (
    <div className="v3-page">
      <div className="v3-page-head">
        <div>
          <h1>{action?.name ?? '即時監測'}</h1>
          <p>
            {info.label} · {TRIGGER_SHORT[triggerType]} · 目標 {zoneText} · 保持 {(params.holdTimeMs / 1000).toFixed(1)} 秒
          </p>
        </div>
        <div className="v3-page-actions">
          {calibrated ? (
            <button className="v3-chip good" onClick={() => setWizardOpen(true)} title="重新校準">
              ✓ 校準完成 ·{' '}
              {new Date(lastCalibratedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
            </button>
          ) : (
            <button className="v3-chip warn" onClick={() => setWizardOpen(true)}>
              ! 尚未校準 · 開始校準
            </button>
          )}
        </div>
      </div>

      <section className={`v3-sheet v3-live tone-${coach.tone}`} aria-label="即時監測">
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
              <strong>再保持 {holdRemain.toFixed(1)} 秒</strong>
              <span>第 {session.reps + 1} 次</span>
            </div>
          )}
          {!protocolOk && (
            <button className="btn btn-secondary btn-sm" onClick={() => setView('settings')}>
              前往設定
            </button>
          )}
        </div>

        <div className="v3-stage">
          <div className="v3-metric">
            <span className="v3-metric-label">主指標 · {info.label}</span>
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
              <strong>{zoneText}</strong> 目標區間 · 超限門檻 {zone.overLimit.toFixed(0)}°
            </span>
            {sample && triggerType !== 'joint_angle' && (
              <span className={`v3-chip ${sample.kneeStraightOk ? 'good' : 'warn'}`}>
                {sample.kneeStraightOk ? '✓' : '!'} 膝蓋需保持近直(≤ {sample.kneeMax}°)
              </span>
            )}
            <div className="v3-ruler" aria-hidden>
              <span className="v3-ruler-track" />
              <span
                className="v3-ruler-zone"
                style={{ left: pct(zone.min), width: `calc(${pct(Number.isFinite(zone.max) ? zone.max : rulerMax)} - ${pct(zone.min)})` }}
              />
              <span className="v3-ruler-limit" style={{ left: pct(zone.overLimit) }} />
              {sample && <span className="v3-ruler-now" style={{ left: pct(sample.value) }} />}
            </div>
            <div className="v3-ruler-scale" aria-hidden>
              <span>0°</span>
              <span style={{ left: pct(zone.min) }}>{zone.min.toFixed(0)}</span>
              <span style={{ left: pct(zone.overLimit) }}>{zone.overLimit.toFixed(0)} 超限</span>
              <span>{rulerMax}°</span>
            </div>
          </div>

          <div className="v3-pose">
            <div className="v3-pose-head">
              <strong>{stage === 'detail' ? '感測器數值' : '動作姿態'}</strong>
              <div className="v3-segmented" role="group" aria-label="姿態顯示">
                <button
                  aria-pressed={stage === '2d'}
                  onClick={() => {
                    setDetail(false)
                    setSettings({ poseView: '2d' })
                  }}
                >
                  2D 側面
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
                  數值
                </button>
              </div>
            </div>
            <div className="v3-pose-body">
              {stage === '2d' && <PoseSide triggerType={triggerType} targetMin={zone.min} inZone={inZone} />}
              {stage === '3d' && (
                <Suspense fallback={<span className="v3-pose-caption">載入 3D…</span>}>
                  <Leg3D />
                </Suspense>
              )}
              {stage === 'detail' && <Diagnostics />}
            </div>
            <p className="v3-pose-caption">
              {calibrated ? '✓ 零位與屈曲軸已建立' : '! 尚未校準'} · 側向角度未驗證
              {stage === '3d' ? ' · 姿態為方向示意' : stage === 'detail' ? ' · Roll 僅供安裝排錯' : ''}
            </p>
          </div>
        </div>

        <SessionDock onCalibrate={() => setWizardOpen(true)} />
      </section>

      {wizardOpen && <CalibrationWizard onClose={() => setWizardOpen(false)} />}
    </div>
  )
}
