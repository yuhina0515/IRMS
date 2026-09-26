// renderer/components/PoseSide.tsx
// UI v3 2D pose (PROPOSAL §6): orthographic sagittal view — hip, knee, ankle — driven only by the
// calibrated thigh/shin flexion angles (0 = standing, + = forward). Roll/yaw never move this
// view: it shows the judged movement plane, not a claim about lateral anatomy.
import { useStore } from '../store/useStore'
import type { TriggerType } from '@shared/types'

const HIP = { x: 150, y: 48 }
const THIGH = 118
const SHIN = 118
const GROUND = 292

function point(from: { x: number; y: number }, deg: number, len: number): { x: number; y: number } {
  const r = (deg * Math.PI) / 180
  // 0° points straight down; positive swings toward the front (+x)
  return { x: from.x + len * Math.sin(r), y: from.y + len * Math.cos(r) }
}

interface Props {
  triggerType: TriggerType
  /** Main-metric zone lower bound (for segment actions: the target elevation/extension). */
  targetMin: number
  inZone: boolean
}

export function PoseSide({ triggerType, targetMin, inZone }: Props): JSX.Element {
  const angles = useStore((s) => s.angles)
  const hardwareError = useStore((s) => s.hardwareError)
  const isConnected = useStore((s) => s.isConnected)
  const live = angles != null && hardwareError == null && isConnected

  const thigh = live ? angles.thigh : 0
  const shin = live ? angles.shin : 0
  const knee = point(HIP, thigh, THIGH)
  const ankle = point(knee, shin, SHIN)
  const foot = point(ankle, shin + 90, 34)
  const kneeAngle = live ? angles.knee : null

  // Knee actions: small arc at the knee between the thigh's extension line and the shin.
  // Segment actions: the target direction from the hip as a dashed ghost.
  const ext = point(knee, thigh, 38)
  const shinRef = point(knee, shin, 38)
  const sweep = shin < thigh ? 1 : 0
  const ghost =
    triggerType === 'segment_elevation'
      ? point(HIP, targetMin, THIGH)
      : triggerType === 'segment_extension'
        ? point(HIP, -targetMin, THIGH)
        : null
  const stroke = 'rgb(var(--color-accent))'

  return (
    <svg viewBox="0 0 300 300" className="v3-pose-svg" role="img" aria-label="側面姿態示意">
      <line x1="30" y1={GROUND} x2="270" y2={GROUND} stroke="rgb(var(--color-border))" strokeWidth="2" />
      <line x1={HIP.x} y1="20" x2={HIP.x} y2={GROUND} stroke="rgb(var(--color-border))" strokeDasharray="4 6" />
      <text x="290" y="24" textAnchor="end" className="v3-pose-label">
        前方 →
      </text>
      {ghost && (
        <line
          x1={HIP.x}
          y1={HIP.y}
          x2={ghost.x}
          y2={ghost.y}
          stroke={inZone ? 'rgb(var(--color-success))' : 'rgb(var(--color-edge))'}
          strokeWidth="3"
          strokeDasharray="6 6"
          strokeLinecap="round"
        />
      )}
      {/* 沒有即時資料時不畫腿:凍結但看起來正常的姿態會被誤讀成真實狀態(PROPOSAL §6) */}
      {live ? (
        <g>
          <line x1={HIP.x} y1={HIP.y} x2={knee.x} y2={knee.y} stroke={stroke} strokeWidth="18" strokeLinecap="round" />
          <line x1={knee.x} y1={knee.y} x2={ankle.x} y2={ankle.y} stroke={stroke} strokeWidth="16" strokeLinecap="round" />
          <line x1={ankle.x} y1={ankle.y} x2={foot.x} y2={foot.y} stroke={stroke} strokeWidth="12" strokeLinecap="round" />
          <circle cx={HIP.x} cy={HIP.y} r="11" fill="rgb(var(--color-surface))" stroke={stroke} strokeWidth="4" />
          <circle cx={knee.x} cy={knee.y} r="11" fill="rgb(var(--color-surface))" stroke={stroke} strokeWidth="4" />
          {triggerType === 'joint_angle' && kneeAngle != null && kneeAngle > 3 && (
            <>
              <path
                d={`M ${ext.x} ${ext.y} A 38 38 0 0 ${sweep} ${shinRef.x} ${shinRef.y}`}
                fill="none"
                stroke={inZone ? 'rgb(var(--color-success))' : 'rgb(var(--color-text-muted))'}
                strokeWidth="3"
              />
              <text x={knee.x + 22} y={knee.y + 48} className="v3-pose-angle">
                {Math.round(kneeAngle)}°
              </text>
            </>
          )}
        </g>
      ) : (
        <text x="150" y="160" textAnchor="middle" className="v3-pose-unavailable">
          {hardwareError ? '感測器異常 · 姿態不可用' : '尚無即時資料'}
        </text>
      )}
    </svg>
  )
}
