// services/sessionAnalysis.ts
// History 分析視窗的摘要統計。先前「分析」只有圖和匯出 CSV,督導得自己離線算;這裡把
// 回顧一場訓練最常問的幾個問題直接算出來:動到多大、有多少時間在目標區、有沒有超限。
//
// 一律以全量讀數計算,不用圖表的 LTTB 抽樣資料:LTTB 保留峰值但不保留時間分佈,拿它算
// 「在目標區的時間比例」會系統性偏向極值。
import type { MetricZone } from './movementMetric'
import { sessionAnalyzer } from './moduleFeatures'

export interface MetricPoint {
  /** epoch ms */
  t: number
  /** 這場實際判定的指標值;缺值(舊資料或該肢段無讀數)為 null */
  v: number | null
}

export interface SessionAnalysis {
  /** 有效量測時間(秒),不含斷線造成的空窗 */
  activeSec: number
  peak: number | null
  mean: number | null
  /** 在目標區間內的時間佔有效量測時間的比例 (0–1);無目標設定時為 null */
  inZoneRatio: number | null
  /** 越過安全上限的次數(每次從未超限 → 超限算一次) */
  overLimitEvents: number
  overLimitSec: number
}

/**
 * 兩筆讀數間隔超過這個值就視為斷線/暫停空窗,不計入任何時間:25Hz 正常間隔 40ms,
 * 1 秒已經是 25 個封包沒到,不是正常取樣抖動。
 */
export const MAX_SAMPLE_GAP_MS = 1000

export function analyzeSession(points: MetricPoint[], zone: MetricZone | null): SessionAnalysis {
  const provider = sessionAnalyzer()
  if (provider) {
    try {
      const result = provider(points.map(p => ({ ...p })), zone ? { ...zone } : null)
      const nonnegative = (value: number): boolean => Number.isFinite(value) && value >= 0
      if (nonnegative(result.activeSec) && nonnegative(result.overLimitSec)
        && Number.isInteger(result.overLimitEvents) && result.overLimitEvents >= 0
        && (result.peak === null || Number.isFinite(result.peak))
        && (result.mean === null || Number.isFinite(result.mean))
        && (result.inZoneRatio === null || (nonnegative(result.inZoneRatio) && result.inZoneRatio <= 1))) return result
    } catch { /* Keep History usable if the independently delivered module fails. */ }
  }
  return analyzeSessionBuiltin(points, zone)
}

export function analyzeSessionBuiltin(points: MetricPoint[], zone: MetricZone | null): SessionAnalysis {
  const valid = points.filter((p): p is { t: number; v: number } => p.v != null && Number.isFinite(p.v))
  let activeMs = 0
  let inZoneMs = 0
  let overMs = 0
  let overEvents = 0
  let wasOver = false
  let weightedSum = 0
  let peak: number | null = null

  for (let i = 0; i < valid.length; i++) {
    const { t, v } = valid[i]
    if (peak == null || v > peak) peak = v
    const over = zone != null && v >= zone.overLimit
    if (over && !wasOver) overEvents++
    wasOver = over

    // 每筆讀數代表「到下一筆為止」的這段時間;最後一筆沒有下一筆,不計時間
    const next = valid[i + 1]
    if (!next) continue
    const dt = next.t - t
    if (dt <= 0 || dt > MAX_SAMPLE_GAP_MS) continue
    activeMs += dt
    weightedSum += v * dt
    if (over) overMs += dt
    if (zone != null && v >= zone.min && v <= zone.max) inZoneMs += dt
  }

  return {
    activeSec: activeMs / 1000,
    peak,
    mean: activeMs > 0 ? weightedSum / activeMs : null,
    inZoneRatio: zone != null && activeMs > 0 ? inZoneMs / activeMs : null,
    overLimitEvents: overEvents,
    overLimitSec: overMs / 1000
  }
}
