// 主指標弧形量表(設計語言 v2 §8.2)。一切以 movementMetric 的正規化空間繪製——
// 量表上的值就是判定用的值。數值移出 SVG 改為 HTML 文字,字級才能精確套用 display token。
// 上色:目標區外中性、區內 success、超限/錯誤 danger;accent 不用來表示「做對」。
import { metricLabel, useT } from '../i18n'
import type { EnginePhase } from '../services/triggerEngine'
import type { MetricInfo, MetricSample, MetricZone } from '../services/movementMetric'
import { valueTone } from '../services/dashboardState'

const CX = 120
const CY = 132
const R = 100

interface Props {
  sample: MetricSample | null
  zone: MetricZone
  info: MetricInfo
  phase: EnginePhase
  alarm: boolean
  error: boolean
  /**
   * 資料是否已過期(斷線中)。斷線後 store 的 angles 不會被清掉,量表會繼續顯示最後一筆
   * 數值長達整個重連期間,看起來完全像即時值。
   */
  stale?: boolean
  /** 目前協定的判定是否尚未支援——量表是畫面上最像「正在運作」的元件,不能讓它代表一個不會發生的量測 */
  unsupported?: boolean
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

function tick(v: number, domainMax: number, inner: number, outer: number): string {
  const a = point(v, R - inner, domainMax)
  const b = point(v, R + outer, domainMax)
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`
}

const TONE_COLOR = {
  out: 'rgb(var(--color-text-dim))',
  in: 'rgb(var(--color-success))',
  over: 'rgb(var(--color-danger))'
} as const

export function MetricGauge({ sample, zone, info, phase, alarm, error, stale = false, unsupported = false }: Props): JSX.Element {
  const t = useT()
  // 「殘值」必須真的有一個值才能殘:冷開機從未連線過時 sample 是 null,掛上「已過期」
  // 是在警告一個不存在的數字——假警告會訓練使用者忽略真警告。
  const showStale = stale && sample != null
  // 未支援優先於過期:協定根本不會被量測,「數值過期」是次要且誤導的說法
  const notice = unsupported ? t.dashboard.unsupportedGauge(metricLabel(t, info)) : showStale ? t.dashboard.stale : null

  const domainMax = zone.overLimit + 15
  const clamp = (v: number): number => Math.min(domainMax, Math.max(0, v))
  const value = sample ? clamp(sample.value) : 0
  const bandMax = Math.min(zone.max, zone.overLimit)
  const tone = error || alarm ? 'over' : phase === 'holding' ? 'in' : valueTone(sample, zone)
  const muted = notice != null
  // 大字取整數:0.1° 位在即時流下每筆都在變,只會傳達「不穩」而非資訊
  const display = error ? 'ERR' : sample ? sample.value.toFixed(0) : '--'
  const targetText = zone.max === Infinity ? t.dashboard.targetAtLeast(zone.min) : t.dashboard.target(zone.min, zone.max)

  return (
    <div className="stack" style={{ alignItems: 'center', gap: 'var(--sp-3)', width: '100%' }}>
      <div className={`gauge${muted ? ' gauge--muted' : ''}`}>
        <svg viewBox="0 0 240 150" role="img" aria-label={`${metricLabel(t, info)} ${display}°`}>
          <path d={arc(0, domainMax, R, domainMax)} fill="none" stroke="rgb(var(--color-border))" strokeWidth="14" strokeLinecap="round" />
          <path
            d={arc(clamp(zone.min), clamp(bandMax), R, domainMax)}
            fill="none"
            stroke="rgb(var(--color-success) / 0.28)"
            strokeWidth="14"
          />
          {value > 0 && (
            <path
              d={arc(0, value, R, domainMax)}
              fill="none"
              stroke={muted ? 'rgb(var(--color-text-muted))' : TONE_COLOR[tone]}
              strokeWidth="6"
              strokeLinecap="round"
            />
          )}
          <path d={tick(clamp(zone.rest), domainMax, 12, 12)} stroke="rgb(var(--color-text-muted))" strokeWidth="2" strokeDasharray="3 3" />
          <path d={tick(clamp(zone.overLimit), domainMax, 14, 14)} stroke="rgb(var(--color-danger))" strokeWidth="3" />
        </svg>
        <div className="gauge__readout">
          <span>
            <span className={`gauge__value value--${muted ? 'out' : tone}`}>{display}</span>
            {display !== 'ERR' && display !== '--' && (
              <span className={`gauge__deg value--${muted ? 'out' : tone}`} aria-hidden>
                °
              </span>
            )}
          </span>
          {!muted && tone === 'in' && (
            <span className="badge badge--success gauge__state">✓ {t.dashboard.inZone}</span>
          )}
        </div>
      </div>
      <div className="gauge-legend">
        <span>{targetText}</span>
        <span>{t.dashboard.rest(zone.rest)}</span>
        <span className="is-limit">{t.dashboard.overLimitAt(zone.overLimit)}</span>
      </div>
      {notice && <div className="notice notice--warning">{notice}</div>}
      {sample?.kneeMax != null && (
        <span className={`badge knee-gate ${sample.kneeStraightOk ? 'badge--success' : 'badge--warning'}`}>
          {t.dashboard.kneeGate(sample.knee.toFixed(0), sample.kneeMax)}
        </span>
      )}
    </div>
  )
}
