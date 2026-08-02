// --- 主指標 (movement metric) 層 ---
// 把三種 triggerType 的角度語意正規化為單一慣例:「value 越大越接近目標」。
// 統一符號慣例(由校準精靈保證):Pitch 0° = 站直,正值 = 向前抬。
// 偵測(TriggerEngine)、量表(MetricGauge)、教練提示(guidance)都以此層為單一真實來源。
import type { LiveAngles } from '@shared/protocol'
import type { TriggerType } from '@shared/types'

/** 動作判定設定(由選定動作 + 即時參數組成) */
export interface TriggerConfig {
  targetAngle: number
  tolerance: number
  holdTimeMs: number
  triggerType: TriggerType
  /**
   * 超限警報門檻(度),獨立於容錯。
   * null / undefined = 沿用舊的導出值 `target + tolerance + OVER_EXTENSION_MARGIN`。
   *
   * 為什麼要獨立:容錯回答的是「這樣算不算達標」,安全上限回答的是「這個關節不該
   * 超過幾度」。後者由解剖與醫囑決定,和處方寬鬆與否無關。綁在一起的話,治療師
   * 為了讓患者容易達標而把容錯從 10° 放寬到 25°,會在完全沒察覺的情況下把警報門檻
   * 一併往外推 15°(2026-08-01 會議意見清單 #19)。
   */
  safetyLimit?: number | null
}

/** 休息姿勢的放寬容錯(度),正規化空間中三種型別同構:value <= rest 即回位 */
export const REST_TOLERANCE = 30
/**
 * 休息門檻與達標下限之間必須保留的最小間距(度)。
 *
 * 狀態機隱含一個不變式:`rest < zone.min`。若違反,目標區會落在休息區內,
 * 於是 holding → restPending → idle → holding 在原地閉合成迴圈:一條完全靜止
 * 的腿每 holdTimeMs 就被計一次 rep 並發一次達標音,而那些捏造的次數會寫進
 * sessions.repsCompleted(2026-08-01 會議 F2)。
 *
 * 出貨預設 Backward Extension(target 20、segment_extension)就違反了它:
 * min = 20 ≤ 舊的固定 rest = 30。任何 min ≤ 30 的動作都會中,包含使用者自建的
 * 溫和早期復健動作。改由 min 導出 rest 之後,不變式成為結構性保證。
 */
export const REST_MARGIN = 5

/**
 * 由達標下限導出休息門檻,保證恆有 `rest ≤ min - REST_MARGIN < min`。
 * 一般情況下維持原本的 30°;只有在低目標角度的動作上才收緊。
 */
export function restThreshold(min: number): number {
  return Math.min(REST_TOLERANCE, min - REST_MARGIN)
}
/** 出區遲滯(度):進區用嚴格門檻,保持中判定區間向外放寬此值,防止邊界抖動 */
export const HYSTERESIS_DEG = 4
/** 出區寬限(ms):保持中短暫跳出(雜訊尖峰)不立即清進度,逾時才算真的離區 */
export const EXIT_GRACE_MS = 250
/** 超限警報的額外安全邊界(度),對齊 AI_CODING_RULES §4.4 */
export const OVER_EXTENSION_MARGIN = 10
/** segment 類動作判定膝近乎打直所允許的最大彎曲(度) */
export const SEGMENT_KNEE_MAX = 15

/** 每筆即時角度正規化後的主指標樣本 */
export interface MetricSample {
  /** 正規化主指標:越大越接近目標 */
  value: number
  /** segment 類前置條件「膝近直」是否滿足;joint_angle 恆為 true */
  kneeStraightOk: boolean
  /** 膝夾角(供膝直徽章顯示) */
  knee: number
  /** 膝直門檻 max(SEGMENT_KNEE_MAX, tol);joint_angle 為 null */
  kneeMax: number | null
}

/** 主指標的判定區間(正規化空間) */
export interface MetricZone {
  /** 達標下限:joint_angle 為 target-tol;segment 為 target */
  min: number
  /** 達標上限:joint_angle 為 target+tol;segment 為 Infinity(超標仍計 rep,警報並行) */
  max: number
  /** 超限警報門檻:target + tol + OVER_EXTENSION_MARGIN */
  overLimit: number
  /** 休息回位門檻:value <= rest 即視為回位 */
  rest: number
}

/** 主指標的顯示中繼資料 */
export interface MetricInfo {
  key: 'kneeAngle' | 'thighElevation' | 'thighExtension'
  label: string
  unit: '°'
}

export function metricInfo(triggerType: TriggerType): MetricInfo {
  switch (triggerType) {
    case 'segment_elevation':
      return { key: 'thighElevation', label: '大腿仰角', unit: '°' }
    case 'segment_extension':
      return { key: 'thighExtension', label: '大腿後伸', unit: '°' }
    case 'joint_angle':
    default:
      return { key: 'kneeAngle', label: '膝關節夾角', unit: '°' }
  }
}

export function computeMetricSample(
  angles: LiveAngles,
  triggerType: TriggerType,
  tolerance: number
): MetricSample {
  const kneeMax = triggerType === 'joint_angle' ? null : Math.max(SEGMENT_KNEE_MAX, tolerance)
  const value =
    triggerType === 'segment_elevation'
      ? angles.thigh
      : triggerType === 'segment_extension'
        ? -angles.thigh // 後伸量取正:thigh 往後(負)越多,value 越大
        : angles.knee
  return {
    value,
    knee: angles.knee,
    kneeMax,
    kneeStraightOk: kneeMax == null ? true : angles.knee <= kneeMax
  }
}

export function computeMetricZone(config: TriggerConfig): MetricZone {
  const { targetAngle, tolerance, triggerType, safetyLimit } = config
  // 明確設定的安全上限優先;未設定則沿用導出值(既有動作行為不變)
  const derived = targetAngle + tolerance + OVER_EXTENSION_MARGIN
  const overLimit =
    safetyLimit != null && Number.isFinite(safetyLimit)
      ? // 安全上限不得低於達標上限,否則患者一達標就觸發警報,警報等於失去意義
        Math.max(safetyLimit, targetAngle + tolerance)
      : derived
  if (triggerType === 'joint_angle') {
    const min = targetAngle - tolerance
    return { min, max: targetAngle + tolerance, overLimit, rest: restThreshold(min) }
  }
  return { min: targetAngle, max: Infinity, overLimit, rest: restThreshold(targetAngle) }
}
