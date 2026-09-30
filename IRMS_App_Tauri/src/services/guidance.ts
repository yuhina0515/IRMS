// --- 教練提示 (guidance) 純函式 ---
// 由主指標樣本 + 區間 + 引擎 phase 推導「使用者現在該做什麼」。
// UI 每幀計算(輸入皆來自 store 既有更新),引擎不需為此增加事件。
import { NO_LIMITS, type AngleLimits, type MetricInfo, type MetricSample, type MetricZone } from './movementMetric'
import type { EnginePhase } from './triggerEngine'
import { formatNumber, getLocale, t, type Locale } from '../i18n'

export type Guidance =
  | { kind: 'noData' }
  | { kind: 'overLimit'; excessDeg: number }
  | { kind: 'straightenKnee'; excessDeg: number }
  | { kind: 'raise'; deltaDeg: number }
  | { kind: 'lower'; deltaDeg: number }
  | { kind: 'hold'; heldSec: number; totalSec: number }
  | { kind: 'returnToRest'; deltaDeg: number }

export function computeGuidance(
  sample: MetricSample | null,
  zone: MetricZone,
  phase: EnginePhase,
  holdProgress: number,
  holdTimeMs: number,
  limits: AngleLimits = NO_LIMITS
): Guidance {
  if (!sample) return { kind: 'noData' }

  // 安全優先:膝角超過個人極限範圍時,無論 phase 一律先要求回落。
  // 超過舒適角度不在這裡處理——它只是提示,不該蓋掉「保持」等正常引導(由畫面另行顯示)。
  if (limits.limit != null && sample.knee > limits.limit) {
    return { kind: 'overLimit', excessDeg: sample.knee - limits.limit }
  }

  if (phase === 'restPending') {
    return { kind: 'returnToRest', deltaDeg: Math.max(0, sample.value - zone.rest) }
  }

  if (phase === 'holding') {
    const totalSec = holdTimeMs / 1000
    return { kind: 'hold', heldSec: (holdProgress / 100) * totalSec, totalSec }
  }

  // idle:先滿足前置條件(segment 類膝直),再引導主指標往目標帶
  if (!sample.kneeStraightOk && sample.kneeMax != null) {
    return { kind: 'straightenKnee', excessDeg: sample.knee - sample.kneeMax }
  }
  if (sample.value < zone.min) {
    return { kind: 'raise', deltaDeg: zone.min - sample.value }
  }
  // segment 類的 zone.max 是 Infinity(超標仍計 rep),落到這裡會算出 value - Infinity,
  // 渲染成「回降 -Infinity° 進入目標區」。可達路徑:引擎在腿仍抬高時被 reset
  // (例如保持中按下結束 Session),phase 回到 idle 而 value 仍高於 min。
  // 這種情況下正確的提示是「已在目標區,保持」而不是要求回降。
  if (!Number.isFinite(zone.max)) {
    return { kind: 'hold', heldSec: 0, totalSec: holdTimeMs / 1000 }
  }
  // joint_angle 已在目標帶內但引擎仍在 idle(引擎這一拍還沒轉進 holding,或療程尚未開始):
  // 同上,正確的提示是「保持」。少了這個分支會落到下面的 lower,算出負的差值,
  // 教練提示顯示「回降 -12.0° 進入目標區」。
  if (sample.value <= zone.max) {
    return { kind: 'hold', heldSec: 0, totalSec: holdTimeMs / 1000 }
  }
  // joint_angle 過頭但未超過極限範圍(value > max)
  return { kind: 'lower', deltaDeg: sample.value - zone.max }
}

/** 角度/秒數一律顯示一位小數;先四捨五入再交給 Intl,與舊版 toFixed 的結果逐字相同 */
const fmt = (locale: Locale, n: number): string => formatNumber(locale, Math.round(n * 10) / 10, 1)

/** 依目前介面語系產生提示字串(依 metric 語意選動詞)。語系可省略,預設讀 store 目前設定。 */
export function guidanceText(g: Guidance, info: MetricInfo, locale: Locale = getLocale()): string {
  const m = t(locale)
  switch (g.kind) {
    case 'noData':
      return m.guidance.noData
    case 'overLimit':
      return m.clinical.overLimit({ deg: fmt(locale, g.excessDeg) })
    case 'straightenKnee':
      return m.clinical.straightenKnee({ deg: fmt(locale, g.excessDeg) })
    case 'raise':
      return m.guidance.raise({ verb: m.clinical.movementVerb[info.key], deg: fmt(locale, g.deltaDeg) })
    case 'lower':
      return m.guidance.lower({ deg: fmt(locale, g.deltaDeg) })
    case 'hold':
      return m.guidance.hold({
        held: formatNumber(locale, g.heldSec, 1),
        total: formatNumber(locale, g.totalSec, 1)
      })
    case 'returnToRest':
      return g.deltaDeg > 0 ? m.guidance.returnToRest({ deg: fmt(locale, g.deltaDeg) }) : m.guidance.atRest
  }
}
