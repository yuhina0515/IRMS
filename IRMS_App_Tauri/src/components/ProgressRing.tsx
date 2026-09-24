// 保持進度環:未開始只有底環、保持中半透明 success、滿格實心 success(§3.1:accent 不表示「做對」)。
interface Props {
  percent: number
  label: string
}

const R = 40
const C = 2 * Math.PI * R

export function ProgressRing({ percent, label }: Props): JSX.Element {
  const p = Math.min(100, Math.max(0, percent))
  const color = p >= 100 ? 'rgb(var(--color-success))' : p > 0 ? 'rgb(var(--color-success) / 0.7)' : 'rgb(var(--color-border))'
  return (
    <div className="hold-ring" role="img" aria-label={`${label} ${Math.round(p)}%`}>
      <svg viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={R} fill="none" stroke="rgb(var(--color-border))" strokeWidth="8" />
        <circle
          cx="48"
          cy="48"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={C}
          strokeDashoffset={C - (p / 100) * C}
          style={{ transition: 'stroke-dashoffset var(--motion-data), stroke var(--motion-fast)' }}
        />
      </svg>
      <div className="hold-ring__label">
        <span className="num">{Math.round(p)}%</span>
        <span className="micro">{label}</span>
      </div>
    </div>
  )
}
