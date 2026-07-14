// renderer/components/AngleVisualizer.tsx
// 以 SVG 繪製大腿/小腿骨架與目標容錯弧。角度資料來自 store(無全域變數)。
import { useStore } from '../store/useStore'
import type { TriggerType } from '@shared/types'

const CENTER = 100

function polarToCartesian(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = ((90 - deg) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(CENTER, CENTER, r, endAngle)
  const end = polarToCartesian(CENTER, CENTER, r, startAngle)
  const largeArc = Math.abs(endAngle - startAngle) <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

export function AngleVisualizer(): JSX.Element {
  const angles = useStore((s) => s.angles)
  const params = useStore((s) => s.params)
  const inZone = useStore((s) => s.session.inZone)
  const action = useStore((s) => s.customActions.find((a) => a.id === s.selectedActionId))
  const triggerType: TriggerType = action?.triggerType ?? 'joint_angle'

  const thigh = angles?.thigh ?? 0
  const shin = angles?.shin ?? 0

  const thighRad = (thigh * Math.PI) / 180
  const shinRad = (shin * Math.PI) / 180
  const thighEnd = { x: CENTER + 60 * Math.sin(thighRad), y: CENTER - 60 * Math.cos(thighRad) }
  const shinEnd = { x: CENTER + 60 * Math.sin(shinRad), y: CENTER + 60 * Math.cos(shinRad) }

  // 螢幕極座標(0°=正上方,順時針):大腿線位於 thigh°,小腿線位於 180° - shin。
  // 目標弧必須畫在「達標時該肢段所在的螢幕角度」上:
  // - segment_elevation:大腿抬至 target → 弧在 target°
  // - segment_extension:大腿後擺至 -target → 弧在 -target°
  // - joint_angle:夾角達 target 時小腿位於 thigh - target → 弧在 180 - thigh + target
  const { targetAngle: target, tolerance: tol } = params
  let center: number
  let arcR = 48
  if (triggerType === 'segment_elevation') {
    center = target
    arcR = 52
  } else if (triggerType === 'segment_extension') {
    center = -target
    arcR = 52
  } else {
    center = 180 - thigh + target
  }
  const startA = center - tol
  const endA = center + tol
  const isSegment = triggerType !== 'joint_angle'

  return (
    <div className="visualizer">
      <svg viewBox="0 0 200 200">
        <circle cx={CENTER} cy={CENTER} r="6" fill="var(--accent)" />
        <path
          d={describeArc(arcR, startA, endA)}
          fill="none"
          stroke={inZone ? 'var(--success)' : 'var(--arc-idle)'}
          strokeWidth={isSegment ? 8 : 14}
          strokeLinecap="round"
        />
        <line
          x1={CENTER}
          y1={CENTER}
          x2={thighEnd.x}
          y2={thighEnd.y}
          stroke="var(--thigh)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <line
          x1={CENTER}
          y1={CENTER}
          x2={shinEnd.x}
          y2={shinEnd.y}
          stroke="var(--shin)"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
