// renderer/views/DashboardView.tsx
// 引導式 Dashboard:畫面圍繞「選定動作的主指標」——量表 + 教練提示 + 進度;
// 折線圖 / 3D / 2D / 詳細數值收進次要 tab(單一掛載,省 GPU/CPU)。
import { useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { computeMetricSample, computeMetricZone, metricInfo } from '../services/movementMetric'
import { computeGuidance, guidanceText } from '../services/guidance'
import { LiveChart } from '../components/LiveChart'
import { AngleVisualizer } from '../components/AngleVisualizer'
import { Leg3D } from '../components/Leg3D'
import { MetricGauge } from '../components/MetricGauge'
import { CoachHint } from '../components/CoachHint'
import { ProgressRing } from '../components/ProgressRing'
import { SessionControlPanel } from '../components/SessionControlPanel'
import { CalibrationWizard } from '../components/CalibrationWizard'
import { useLiquidKnob } from '../components/LiquidKnob'

type Tab = 'chart' | '3d' | '2d' | 'detail'

const TABS: { id: Tab; label: string }[] = [
  { id: 'chart', label: '趨勢圖' },
  { id: '3d', label: '3D 姿態' },
  { id: '2d', label: '2D 姿態' },
  { id: 'detail', label: '詳細數值' }
]

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }): JSX.Element {
  return (
    <div className="panel glass stat">
      <div className="label">{label}</div>
      <div className={`value ${cls ?? ''}`}>{value}</div>
    </div>
  )
}

export function DashboardView(): JSX.Element {
  const angles = useStore((s) => s.angles)
  const hardwareError = useStore((s) => s.hardwareError)
  const session = useStore((s) => s.session)
  const params = useStore((s) => s.params)
  const isConnected = useStore((s) => s.isConnected)
  const lastCalibratedAt = useStore((s) => s.settings.lastCalibratedAt)
  const action = useStore((s) => s.customActions.find((a) => a.id === s.selectedActionId))

  const [tab, setTab] = useState<Tab>('chart')
  const [wizardOpen, setWizardOpen] = useState(false)
  const tabsRef = useRef<HTMLDivElement>(null)
  const { knobElement, getItemProps } = useLiquidKnob({
    containerRef: tabsRef,
    activeKey: tab,
    orientation: 'horizontal',
    onSelect: (key) => setTab(key as Tab)
  })

  const triggerType = action?.triggerType ?? 'joint_angle'
  const info = metricInfo(triggerType)
  const zone = computeMetricZone({ ...params, triggerType })
  const sample = angles && !hardwareError ? computeMetricSample(angles, triggerType, params.tolerance) : null

  const guidance = computeGuidance(sample, zone, session.phase, session.holdProgress, params.holdTimeMs)
  const hintText = hardwareError
    ? '硬體異常,等待感測器復原…'
    : !isConnected
      ? '請先於頂部連線裝置'
      : !action
        ? '請先選擇復健動作'
        : guidanceText(guidance, info)
  const tone: 'normal' | 'success' | 'danger' =
    hardwareError || session.alarmActive ? 'danger' : session.phase === 'holding' ? 'success' : 'normal'

  const fmt = (n: number | undefined): string =>
    hardwareError ? 'ERR' : n === undefined ? '--' : `${n.toFixed(1)}°`

  return (
    <>
      <header className="page-header">
        <h2>Guided Monitoring</h2>
        <p>圍繞當前動作的主指標即時引導復健</p>
      </header>

      {lastCalibratedAt == null && (
        <div className="calib-chip" onClick={() => setWizardOpen(true)}>
          ⚠ 感測器尚未校準——偵測與顯示方向可能不正確,點此啟動校準精靈
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'start' }}>
        <div className="panel glass">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <div className="metric-action">{action?.name ?? '未選擇動作'}</div>
              <div className="metric-sub">主指標:{info.label}</div>
            </div>
          </div>
          <MetricGauge
            sample={sample}
            zone={zone}
            info={info}
            phase={session.phase}
            alarm={session.alarmActive}
            error={hardwareError != null}
          />
          <CoachHint phase={session.phase} text={hintText} tone={tone} />
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <div className="panel glass" style={{ textAlign: 'center' }}>
            <ProgressRing percent={session.holdProgress} reps={session.reps} />
            {session.alarmActive && (
              <p style={{ color: 'var(--danger)', marginTop: 10, fontWeight: 600 }}>⚠ 超限警報</p>
            )}
          </div>
          <SessionControlPanel />
        </div>
      </div>

      <div className="panel glass" style={{ marginTop: 16 }}>
        <div className="tabs" ref={tabsRef}>
          {knobElement}
          {TABS.map((t) => (
            <button
              key={t.id}
              data-knob-key={t.id}
              className={`tab-btn${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
              {...getItemProps(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'chart' && <LiveChart />}
        {tab === '3d' && <Leg3D />}
        {tab === '2d' && <AngleVisualizer />}
        {tab === 'detail' && (
          <div className="grid cards">
            <Stat label="Thigh 大腿" value={fmt(angles?.thigh)} cls="color-thigh" />
            <Stat label="Shin 小腿" value={fmt(angles?.shin)} cls="color-shin" />
            <Stat label="Knee 夾角" value={fmt(angles?.knee)} cls="color-accent" />
            <Stat label="Thigh Roll" value={fmt(angles?.thighRoll)} />
            <Stat label="Shin Roll" value={fmt(angles?.shinRoll)} />
            <Stat
              label="Varus/Valgus 內外翻"
              value={
                hardwareError
                  ? 'ERR'
                  : angles == null
                    ? '--'
                    : `${Math.abs(angles.kneeRoll).toFixed(1)}° ${angles.kneeRoll >= 0 ? '外翻' : '內翻'}`
              }
            />
          </div>
        )}
      </div>

      {wizardOpen && <CalibrationWizard onClose={() => setWizardOpen(false)} />}
    </>
  )
}
