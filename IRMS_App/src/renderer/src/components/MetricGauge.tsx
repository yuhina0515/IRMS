// 主指標弧形量表:目前值大字 + 半圓量表(目標帶/超限刻線/休息刻線)。
// 一切以 movementMetric 的正規化空間繪製——量表上的值就是判定用的值。
import type { EnginePhase } from '../services/triggerEngine'
import type { MetricInfo, MetricSample, MetricZone } from '../services/movementMetric'

const CX = 120
const CY = 122
const R = 92

interface Props {
  sample: MetricSample | null
  zone: MetricZone
  info: MetricInfo
  phase: EnginePhase
  alarm: boolean
  error: boolean
  /**
   * 資料是否已過期(斷線中)。斷線後 store 的 angles 不會被清掉,所以量表會繼續
   * 顯示最後一筆數值長達 15 秒的重連期間,看起來完全像即時值——使用者無從得知
   * 那條腿現在到底在哪裡(2026-08-01 意見清單 #29)。
   */
  stale?: boolean
}

function point(valueDeg: number, r: number, domainMax: number): { x: number; y: number } {
  const a = ((-90 + (valueDeg / domainMax) * 180) * Math.PI) / 180
  return { x: CX + r * Math.sin(a), y: CY - r * Math.cos(a) }
}

function arc(v1: number, v2: number, r: number, domainMax: number): string {
  const s = point(v1, r, domainMax)
  const e = point(v2, r, domainMax)
  return `M ${s.x} ${s.y} A ${r} ${r} 0 0 1 ${e.x} ${e.y}`
}

function tick(v: number, domainMax: number): string {
  const a = point(v, R - 13, domainMax)
  const b = point(v, R + 13, domainMax)
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`
}

export function MetricGauge({ sample, zone, info, phase, alarm, error, stale = false}: Props): JSX.Element {
  const domainMax = zone.overLimit + 15
  const clamp = (v: number): number => Math.min(domainMax, Math.max(0, v))
  const value = sample ? clamp(sample.value) : 0
  const bandMax = Math.min(zone.max, zone.overLimit)

  const valueColor = error || alarm ? 'var(--danger)' : phase === 'holding' ? 'var(--success)' : 'var(--accent)'
  // 大字取整數:0.1° 位在即時流下每筆都在變,只會傳達「不穩」而非資訊
  const display = error ? 'ERR' : sample ? sample.value.toFixed(0) : '--'
  const targetText =
    zone.max === Infinity ? `目標 ≥ ${zone.min}°` : `目標 ${zone.min}–${zone.max}°`

  return (
    <div className={`metric-gauge${stale ? ' stale' : ''}`}>
      <svg viewBox="0 0 240 150">
        <path d={arc(0, domainMax, R, domainMax)} fill="none" stroke="var(--gauge-track)" strokeWidth="14" strokeLinecap="round" />
        <path d={arc(clamp(zone.min), clamp(bandMax), R, domainMax)} fill="none" stroke="var(--gauge-band)" strokeWidth="14" strokeLinecap="butt" />
        {value > 0 && (
          <path d={arc(0, value, R, domainMax)} fill="none" stroke={valueColor} strokeWidth="7" strokeLinecap="round" />
        )}
        <path d={tick(clamp(zone.rest), domainMax)} stroke="var(--text-dim)" strokeWidth="2" strokeDasharray="3 3" />
        <path d={tick(clamp(zone.overLimit), domainMax)} stroke="var(--danger)" strokeWidth="3" />
        <text x={CX} y={92} textAnchor="middle" fontSize="34" fontWeight="700" fill={valueColor}>
          {display}
        </text>
        <text x={CX} y={116} textAnchor="middle" fontSize="12" fill="var(--text-dim)">
          {info.label}(°)
        </text>
        <text x={CX} y={140} textAnchor="middle" fontSize="12" fill="var(--text-dim)">
          {targetText} · 回位 ≤ {zone.rest}° · <tspan fill="var(--danger)">超限 {zone.overLimit}°</tspan>
        </text>
      </svg>
      {sample?.kneeMax != null && (
        <div className={`knee-badge${sample.kneeStraightOk ? ' ok' : ''}`}>
          膝直前置:{sample.knee.toFixed(0)}° / 需 ≤ {sample.kneeMax}°
        </div>
      )}
    </div>
  )
}
