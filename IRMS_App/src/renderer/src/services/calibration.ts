// --- 校準精靈純數學(v3:外展 roll invert 逐軸解耦)---
// 由四次靜態捕捉(站直 / 前抬大腿 / 站立後勾小腿 / 腿向外側擺)推導:
// 1. axisSwap —— 感測器貼歪 90° 時,彎曲動作出現在 roll 軸 → 軟體對調 pitch/roll
// 2. invert  —— pitch 依前抬/後勾方向、roll 依外展方向自動判定(大腿/小腿獨立,見下)
// 3. offset  —— 以站直姿勢四軸歸零
// 統一慣例(校準後):Pitch 正 = 向前抬;Roll 正 = 向外側傾;kneeRoll 正 = 外翻。
// 產出的 patch 直接餵 applyCalibration,偵測 / 3D / 2D 全域同步生效。
import type { RawAngles } from '@shared/protocol'
import type { Settings } from '../store/useStore'

/** 捕捉期間允許的最大標準差(度)——超過視為晃動 */
export const CAPTURE_STD_LIMIT = 3
/** 外展步驟專用的標準差上限——單腳站立本身晃動較大,略放寬於一般步驟 */
export const CAPTURE_STD_LIMIT_ABDUCTION = 4
/** 判斷 pitch invert 所需的最小動作幅度(度) */
export const CAPTURE_DELTA_MIN = 20
/** 判斷 roll invert(外展)所需的最小動作幅度(度)——大腿/小腿分別獨立判定 */
export const CAPTURE_ROLL_DELTA_MIN = 15

export interface CaptureStats {
  mean: RawAngles
  /** 四軸中最大的標準差,用於「保持靜止」驗證 */
  maxStdDev: number
}

const AXES: (keyof RawAngles)[] = ['thigh', 'shin', 'thighRoll', 'shinRoll']

export function computeCaptureStats(samples: RawAngles[]): CaptureStats {
  const n = samples.length
  const mean: RawAngles = { thigh: 0, shin: 0, thighRoll: 0, shinRoll: 0 }
  let maxStdDev = 0
  for (const k of AXES) {
    const m = samples.reduce((acc, s) => acc + s[k], 0) / n
    mean[k] = m
    const variance = samples.reduce((acc, s) => acc + (s[k] - m) ** 2, 0) / n
    maxStdDev = Math.max(maxStdDev, Math.sqrt(variance))
  }
  return { mean, maxStdDev }
}

export interface AxisMapping {
  thighAxisSwap: boolean
  shinAxisSwap: boolean
}

/** 依軸對調設定取得「有效」raw 值(swap 後的 pitch/roll) */
export function effectiveRaw(raw: RawAngles, m: AxisMapping): RawAngles {
  return {
    thigh: m.thighAxisSwap ? raw.thighRoll : raw.thigh,
    thighRoll: m.thighAxisSwap ? raw.thigh : raw.thighRoll,
    shin: m.shinAxisSwap ? raw.shinRoll : raw.shin,
    shinRoll: m.shinAxisSwap ? raw.shin : raw.shinRoll
  }
}

/**
 * 軸對調偵測:預期的彎曲動作若主要出現在 roll 軸,代表感測器貼歪了 90°。
 * 回傳該肢段的 swap 判定與實際最大幅度(供幅度驗證)。
 */
export function detectAxisSwap(
  baseline: RawAngles,
  moved: RawAngles,
  limb: 'thigh' | 'shin'
): { swap: boolean; delta: number } {
  const dPitch = Math.abs(moved[limb] - baseline[limb])
  const rollKey = limb === 'thigh' ? 'thighRoll' : 'shinRoll'
  const dRoll = Math.abs(moved[rollKey] - baseline[rollKey])
  return { swap: dRoll > dPitch, delta: Math.max(dPitch, dRoll) }
}

export type CalibrationError = 'unstable' | 'thighDeltaTooSmall' | 'shinDeltaTooSmall'

export type CalibrationResult =
  | { ok: true; patch: Partial<Settings> }
  | { ok: false; error: CalibrationError }

/**
 * 整合捕捉 → 方向校正 → settings patch。
 * @param abduction 外展捕捉(選配);null 表示使用者跳過。大腿/小腿 roll 方向獨立判定——
 *   跳過或某一軸擺動幅度不足以信任正負號時,該軸沿用現有 invert 設定且 verified 維持不變。
 */
export function buildCalibrationPatch(
  baseline: CaptureStats,
  thighRaise: CaptureStats,
  kneeFlex: CaptureStats,
  abduction: CaptureStats | null,
  current: Settings
): CalibrationResult {
  if ([baseline, thighRaise, kneeFlex].some((c) => c.maxStdDev > CAPTURE_STD_LIMIT)) {
    return { ok: false, error: 'unstable' }
  }
  if (abduction && abduction.maxStdDev > CAPTURE_STD_LIMIT_ABDUCTION) {
    return { ok: false, error: 'unstable' }
  }

  // 1. 軸對調偵測(先於一切符號判定)
  const thighAxis = detectAxisSwap(baseline.mean, thighRaise.mean, 'thigh')
  if (thighAxis.delta < CAPTURE_DELTA_MIN) return { ok: false, error: 'thighDeltaTooSmall' }
  const shinAxis = detectAxisSwap(baseline.mean, kneeFlex.mean, 'shin')
  if (shinAxis.delta < CAPTURE_DELTA_MIN) return { ok: false, error: 'shinDeltaTooSmall' }
  const mapping: AxisMapping = { thighAxisSwap: thighAxis.swap, shinAxisSwap: shinAxis.swap }

  // 2. 以「有效軸」判定 pitch invert:
  //    前抬大腿 → 慣例下 thigh 應變大;站立後勾小腿 → shin 應變小
  const effBase = effectiveRaw(baseline.mean, mapping)
  const effRaise = effectiveRaw(thighRaise.mean, mapping)
  const effFlex = effectiveRaw(kneeFlex.mean, mapping)
  const thighInvert = effRaise.thigh - effBase.thigh < 0
  const shinInvert = effFlex.shin - effBase.shin > 0

  // 3. roll invert:腿向外側擺 → 慣例下(正 = 向外)兩肢段 roll 皆應變大。
  //    大腿/小腿獨立判定——單腳站立時膝蓋未必鎖死,兩肢段擺動幅度可能不同步;
  //    哪一軸幅度不足以信任正負號,就沿用該軸原設定,不因單軸不足讓整步失敗重捕。
  let thighRollInvert = current.thighRollInvert
  let shinRollInvert = current.shinRollInvert
  let thighRollVerified = current.thighRollVerified
  let shinRollVerified = current.shinRollVerified
  if (abduction) {
    const effAbd = effectiveRaw(abduction.mean, mapping)
    const dThigh = effAbd.thighRoll - effBase.thighRoll
    const dShin = effAbd.shinRoll - effBase.shinRoll
    if (Math.abs(dThigh) >= CAPTURE_ROLL_DELTA_MIN) {
      thighRollInvert = dThigh < 0
      thighRollVerified = true
    }
    if (Math.abs(dShin) >= CAPTURE_ROLL_DELTA_MIN) {
      shinRollInvert = dShin < 0
      shinRollVerified = true
    }
  }

  // 4. offset:站直四軸歸零(以有效軸 + 已定符號計算)
  const patch: Partial<Settings> = {
    ...mapping,
    thighInvert,
    shinInvert,
    thighRollInvert,
    shinRollInvert,
    thighRollVerified,
    shinRollVerified,
    thighOffset: -(effBase.thigh * (thighInvert ? -1 : 1)),
    shinOffset: -(effBase.shin * (shinInvert ? -1 : 1)),
    thighRollOffset: -(effBase.thighRoll * (thighRollInvert ? -1 : 1)),
    shinRollOffset: -(effBase.shinRoll * (shinRollInvert ? -1 : 1))
  }
  return { ok: true, patch }
}
