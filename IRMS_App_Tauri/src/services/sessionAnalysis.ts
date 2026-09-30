// services/sessionAnalysis.ts
// History 分析視窗的摘要統計。先前「分析」只有圖和匯出 CSV,督導得自己離線算;這裡把
// 回顧一場訓練最常問的幾個問題直接算出來:動到多大、有多少時間在目標區、
// 有多少時間超出個人的舒適角度與極限範圍。
//
// 一律以全量讀數計算,不用圖表的 LTTB 抽樣資料:LTTB 保留峰值但不保留時間分佈,拿它算
// 「在目標區的時間比例」會系統性偏向極值。
import type { AngleLimits, MetricZone } from './movementMetric'
import { sessionAnalyzer } from './moduleFeatures'

export interface MetricPoint {
  /** epoch ms */
  t: number
  /** 這場實際判定的指標值;缺值(舊資料或該肢段無讀數)為 null */
  v: number | null
  /** 膝夾角;舒適角度/極限範圍一律與它比較(與判定引擎一致) */
  k?: number | null
}

export interface SessionAnalysis {
  /** 有效量測時間(秒),不含斷線造成的空窗 */
  activeSec: number
  peak: number | null
  mean: number | null
  /** 在目標區間內的時間佔有效量測時間的比例 (0–1);無目標設定時為 null */
  inZoneRatio: number | null
  /** 膝角越過極限範圍的次數(每次從範圍內 → 超出算一次);未設定極限為 0 */
  overLimitEvents: number
  overLimitSec: number
  /** 膝角超出舒適角度的時間(秒);這場沒有舒適角度快照時為 null */
  overComfortSec: number | null
}

/**
 * 兩筆讀數間隔超過這個值就視為斷線/暫停空窗,不計入任何時間:25Hz 正常間隔 40ms,
 * 1 秒已經是 25 個封包沒到,不是正常取樣抖動。
 */
export const MAX_SAMPLE_GAP_MS = 1000

/** 膝角相對個人舒適角度/極限範圍的時間統計;與目標區統計分開算,不交給外部分析模組 */
function rangeStats(points: MetricPoint[], limits: AngleLimits): Pick<SessionAnalysis, 'overLimitEvents' | 'overLimitSec' | 'overComfortSec'> {
  const valid = points.filter((p): p is { t: number; v: number | null; k: number } => p.k != null && Number.isFinite(p.k))
  let events = 0
  let overMs = 0
  let comfortMs = 0
  let wasOver = false
  for (let i = 0; i < valid.length; i++) {
    const { t, k } = valid[i]
    const over = limits.limit != null && k > limits.limit
    if (over && !wasOver) events++
    wasOver = over
    const next = valid[i + 1]
    if (!next) continue
    const dt = next.t - t
    if (dt <= 0 || dt > MAX_SAMPLE_GAP_MS) continue
    if (over) overMs += dt
    if (limits.comfort != null && k > limits.comfort) comfortMs += dt
  }
  return {
    overLimitEvents: events,
    overLimitSec: overMs / 1000,
    overComfortSec: limits.comfort == null ? null : comfortMs / 1000
  }
}

export function analyzeSession(points: MetricPoint[], zone: MetricZone | null, limits: AngleLimits = { comfort: null, limit: null }): SessionAnalysis {
  const range = rangeStats(points, limits)
  const provider = sessionAnalyzer()
  if (provider) {
    try {
      const result = { ...provider(points.map(p => ({ t: p.t, v: p.v })), zone ? { ...zone } : null), ...range }
      const nonnegative = (value: number): boolean => Number.isFinite(value) && value >= 0
      if (nonnegative(result.activeSec) && nonnegative(result.overLimitSec)
        && Number.isInteger(result.overLimitEvents) && result.overLimitEvents >= 0
        && (result.peak === null || Number.isFinite(result.peak))
        && (result.mean === null || Number.isFinite(result.mean))
        && (result.inZoneRatio === null || (nonnegative(result.inZoneRatio) && result.inZoneRatio <= 1))) return result
    } catch { /* Keep History usable if the independently delivered module fails. */ }
  }
  return { ...analyzeSessionBuiltin(points, zone), ...range }
}

export function analyzeSessionBuiltin(points: MetricPoint[], zone: MetricZone | null): SessionAnalysis {
  const valid = points.filter((p): p is { t: number; v: number } => p.v != null && Number.isFinite(p.v))
  let activeMs = 0
  let inZoneMs = 0
  let weightedSum = 0
  let peak: number | null = null

  for (let i = 0; i < valid.length; i++) {
    const { t, v } = valid[i]
    if (peak == null || v > peak) peak = v

    // 每筆讀數代表「到下一筆為止」的這段時間;最後一筆沒有下一筆,不計時間
    const next = valid[i + 1]
    if (!next) continue
    const dt = next.t - t
    if (dt <= 0 || dt > MAX_SAMPLE_GAP_MS) continue
    activeMs += dt
    weightedSum += v * dt
    if (zone != null && v >= zone.min && v <= zone.max) inZoneMs += dt
  }

  return {
    activeSec: activeMs / 1000,
    peak,
    mean: activeMs > 0 ? weightedSum / activeMs : null,
    inZoneRatio: zone != null && activeMs > 0 ? inZoneMs / activeMs : null,
    overLimitEvents: 0,
    overLimitSec: 0,
    overComfortSec: null
  }
}
