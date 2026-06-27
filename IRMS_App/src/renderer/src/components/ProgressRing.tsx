// renderer/components/ProgressRing.tsx
interface Props {
  percent: number
  reps: number
}

const RADIUS = 78
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ProgressRing({ percent, reps }: Props): JSX.Element {
  const offset = CIRCUMFERENCE - (Math.min(100, Math.max(0, percent)) / 100) * CIRCUMFERENCE
  const color = percent >= 100 ? 'var(--success)' : percent > 0 ? 'var(--accent)' : 'rgba(255,255,255,0.18)'

  return (
    <div className="ring-wrap">
      <svg viewBox="0 0 180 180">
        <circle cx="90" cy="90" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
        <circle
          cx="90"
          cy="90"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 90 90)"
          style={{ transition: 'stroke-dashoffset 0.2s ease, stroke 0.2s ease' }}
        />
      </svg>
      <div className="pct">
        <span>{Math.round(percent)}%</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{reps} reps</span>
      </div>
    </div>
  )
}
