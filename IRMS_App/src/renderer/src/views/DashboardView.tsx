// renderer/views/DashboardView.tsx
import { useStore } from '../store/useStore'
import { LiveChart } from '../components/LiveChart'
import { AngleVisualizer } from '../components/AngleVisualizer'
import { ProgressRing } from '../components/ProgressRing'
import { SessionControlPanel } from '../components/SessionControlPanel'

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

  const fmt = (n: number | undefined): string =>
    hardwareError ? 'ERR' : n === undefined ? '--' : `${n.toFixed(1)}°`

  return (
    <>
      <header className="page-header">
        <h2>Real-time Monitoring</h2>
        <p>即時追蹤關節角度與復健達標進度</p>
      </header>

      <div className="grid cards" style={{ marginBottom: 16 }}>
        <Stat label="Thigh 大腿" value={fmt(angles?.thigh)} cls="color-thigh" />
        <Stat label="Shin 小腿" value={fmt(angles?.shin)} cls="color-shin" />
        <Stat label="Knee 夾角" value={fmt(angles?.knee)} cls="color-accent" />
        <Stat label="Varus/Valgus 內外翻" value={fmt(angles?.kneeRoll)} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'start' }}>
        <div className="grid" style={{ gap: 16 }}>
          <div className="panel glass">
            <LiveChart />
          </div>
          <div className="panel glass">
            <AngleVisualizer />
          </div>
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
    </>
  )
}
