// --- 校準精靈純數學(v3:外展 roll invert 逐軸解耦)---
// 由四次靜態捕捉(站直 / 前抬大腿 / 站立後勾小腿 / 腿向外側擺)推導:
// 1. axisSwap —— 感測器貼歪 90° 時,彎曲動作出現在 roll 軸 → 軟體對調 pitch/roll
// 2. invert  —— pitch 依前抬/後勾方向、roll 依外展方向自動判定(大腿/小腿獨立,見下)
// 3. offset  —— 以站直姿勢四軸歸零
// 統一慣例(校準後):Pitch 正 = 向前抬;Roll 正 = 向外側傾;kneeRoll 正 = 外翻。
// 產出的 patch 直接餵 applyCalibration,偵測 / 3D / 2D 全域同步生效。
import type { CalibrationSnapshot } from '@shared/types'
import type { RawAngles } from '@shared/protocol'
import { CALIBRATION_KEYS, CALIBRATION_TRANSFORM_KEYS, type Settings } from '../store/useStore'
import { circularMeanDeg, circularStdDevDeg, shortestArcDelta } from './angleMath'

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

/** 前後向動作(前抬 / 後勾)看 pitch 兩軸 */
export const PITCH_AXES = ['thigh', 'shin'] as const
/** 外展看 roll 兩軸 */
export const ROLL_AXES = ['thighRoll', 'shinRoll'] as const

/**
 * 相對基準姿勢,在**指定軸**上的最大位移量(度)。
 *
 * 免手擷取用它判斷「患者確實做了這一步要求的動作」。軸必須指定,不能一律取四軸
 * 最大——外展步驟的門檻是 roll 門檻,若把 pitch 也算進來,免手流程會直接自我觸發:
 * 上一步(後勾小腿)擷取完成的瞬間,患者仍維持著勾腿姿勢,pitch 相對站直基準
 * 早已遠超門檻,於是外展步驟在患者根本沒有外展的情況下就判定「動過了」而擷取。
 * 後果是外展步驟被靜默消耗、roll 方向永遠處於未驗證,且每次重跑精靈都會再踩一次。
 */
export function maxAxisDelta(
  baseline: RawAngles,
  current: RawAngles,
  axes: readonly (keyof RawAngles)[]
): number {
  if (axes.length === 0) return 0
  return Math.max(...axes.map((k) => Math.abs(shortestArcDelta(baseline[k], current[k]))))
}

/**
 * 四軸的環形平均與最大環形標準差。
 * 必須用環形統計而非算術平均:角度是環不是實數線,若某肢段的靜止姿勢落在
 * ±180 分支切點,線性版本會把 0.6° 的抖動算成 stdDev ≈ 180,精靈永遠回報
 * 「偵測到晃動」而無法完成校準(2026-08-01 會議 F4)。
 */
export function computeCaptureStats(samples: RawAngles[]): CaptureStats {
  const mean: RawAngles = { thigh: 0, shin: 0, thighRoll: 0, shinRoll: 0 }
  let maxStdDev = 0
  for (const k of AXES) {
    const series = samples.map((s) => s[k])
    mean[k] = circularMeanDeg(series)
    maxStdDev = Math.max(maxStdDev, circularStdDevDeg(series))
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
  // 最短弧差:掛載方向可能讓某軸的靜止姿勢落在 ±180 切點,線性相減會把 2° 的
  // 實際動作算成 358°,足以偽造出「幅度足夠」並且正負號相反
  const dPitch = Math.abs(shortestArcDelta(baseline[limb], moved[limb]))
  const rollKey = limb === 'thigh' ? 'thighRoll' : 'shinRoll'
  const dRoll = Math.abs(shortestArcDelta(baseline[rollKey], moved[rollKey]))
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
  const thighInvert = shortestArcDelta(effBase.thigh, effRaise.thigh) < 0
  const shinInvert = shortestArcDelta(effBase.shin, effFlex.shin) > 0

  // 3. roll invert:腿向外側擺 → 慣例下(正 = 向外)兩肢段 roll 皆應變大。
  //    大腿/小腿獨立判定——單腳站立時膝蓋未必鎖死,兩肢段擺動幅度可能不同步;
  //    哪一軸幅度不足以信任正負號,就沿用該軸原設定,不因單軸不足讓整步失敗重捕。
  let thighRollInvert = current.thighRollInvert
  let shinRollInvert = current.shinRollInvert
  let thighRollVerified = current.thighRollVerified
  let shinRollVerified = current.shinRollVerified
  if (abduction) {
    const effAbd = effectiveRaw(abduction.mean, mapping)
    const dThigh = shortestArcDelta(effBase.thighRoll, effAbd.thighRoll)
    const dShin = shortestArcDelta(effBase.shinRoll, effAbd.shinRoll)
    if (Math.abs(dThigh) >= CAPTURE_ROLL_DELTA_MIN) {
      thighRollInvert = dThigh < 0
      thighRollVerified = true
    }
    if (Math.abs(dShin) >= CAPTURE_ROLL_DELTA_MIN) {
      shinRollInvert = dShin < 0
      shinRollVerified = true
    }
  }

  // 4. zeroRaw:站直姿勢(有效軸)本身就是零位讀值,不折算 invert 符號——
  //    判定端以 (raw − zeroRaw) × sign 求值,故事後翻轉 invert 不會擾動零位
  //    (2026-08-12 會議:舊「符號摺疊」offset 表示法在 invert 翻轉時會產生雙倍偏差)
  const patch: Partial<Settings> = {
    ...mapping,
    thighInvert,
    shinInvert,
    thighRollInvert,
    shinRollInvert,
    thighRollVerified,
    shinRollVerified,
    thighZeroRaw: effBase.thigh,
    shinZeroRaw: effBase.shin,
    thighRollZeroRaw: effBase.thighRoll,
    shinRollZeroRaw: effBase.shinRoll
  }
  return { ok: true, patch }
}

/**
 * 快速歸零:沿用現有 axisSwap/invert 設定,只用「當下姿勢 = 0°」重設四個 zeroRaw。
 * 必須先套用 effectiveRaw 做軸對調——和 buildCalibrationPatch 步驟 4 用同一組已校正軸,
 * 否則貼歪 90° 的感測器會把零位算在錯的物理軸上(2026-08-07 會議發現,SettingsView
 * 原本直接用 raw.thigh/raw.thighRoll,略過了這一步)。
 * zeroRaw 不折算 invert 符號,故不需要讀取 invert 設定——這正是 2026-08-12 會議裁定的
 * 重新參數化收益:invert 從「翻轉即雙倍偏差的地雷」變成不擾動零位的獨立控制項。
 */
export function buildQuickZeroPatch(raw: RawAngles, settings: Settings): Partial<Settings> {
  const eff = effectiveRaw(raw, {
    thighAxisSwap: settings.thighAxisSwap,
    shinAxisSwap: settings.shinAxisSwap
  })
  return {
    thighZeroRaw: eff.thigh,
    shinZeroRaw: eff.shin,
    thighRollZeroRaw: eff.thighRoll,
    shinRollZeroRaw: eff.shinRoll
  }
}

/**
 * 由型別層強制:`CALIBRATION_KEYS`(Session 中凍結哪些欄位)與 `CalibrationSnapshot`
 * (存進紀錄的是哪些欄位)必須是同一組。這兩件事在語意上本來就是同一個定義——
 * 凍結是為了讓單一快照成立,快照存的就該是被凍結的那些欄位。任一邊少一個欄位,
 * 下面這行就編譯失敗,而不是等到某天發現快照漏了某個會改變角度算法的設定。
 */
type _AssertKeysMatch = [
  Exclude<(typeof CALIBRATION_KEYS)[number], keyof CalibrationSnapshot>,
  Exclude<keyof CalibrationSnapshot, (typeof CALIBRATION_KEYS)[number]>
] extends [never, never]
  ? true
  : never
export const CALIBRATION_KEYS_MATCH_SNAPSHOT: _AssertKeysMatch = true

/**
 * 擷取當下生效的校準轉換,供 Session 開始時寫入 `sessions.calibration`(migration 6)。
 *
 * 欄位來源刻意是 `CALIBRATION_KEYS` 而不是手抄一份清單:那個常數同時也是
 * 「Session 進行中凍結哪些欄位」的定義,兩者本來就必須是同一組。日後新增一個
 * 會改變角度算法的設定時,只要加進 CALIBRATION_KEYS,凍結與快照會一起跟上——
 * 手抄清單的版本會安靜地漏掉新欄位,而漏掉的後果是快照再次說謊。
 */
export function buildCalibrationSnapshot(settings: Settings): CalibrationSnapshot {
  const snapshot: Record<string, unknown> = {}
  for (const key of CALIBRATION_KEYS) snapshot[key] = settings[key]
  // 這個轉型的依據是上面的 AssertKeysMatch:兩個集合已由編譯器證明一一對應,
  // 所以迴圈填完的物件必然剛好是一個 CalibrationSnapshot。若日後有人只改了
  // 其中一邊,壞掉的是那個型別斷言(編譯失敗),而不是這裡靜默產生半套快照。
  return snapshot as unknown as CalibrationSnapshot
}

/** 解析 `sessions.calibration`;欄位不是合法 JSON 或為 migration 6 之前的 null 時回傳 null。 */
export function parseCalibrationSnapshot(raw: string | null): CalibrationSnapshot | null {
  if (raw == null) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed != null && typeof parsed === 'object' ? (parsed as CalibrationSnapshot) : null
  } catch {
    return null
  }
}

/**
 * 列出某場 Session 的校準快照與「目前設定」之間有差異的欄位。
 *
 * 這是這個欄位存在的理由所在:督導在 History 看到的曲線,是由當時那組轉換算出來的。
 * 若之後重跑過精靈,同一條曲線的意義就變了——沒有這個比對,他會拿今天的座標系
 * 去讀上個月的資料而毫無察覺。回傳空陣列 = 與今天完全一致,可直接照當前設定解讀。
 *
 * 只比 `CALIBRATION_TRANSFORM_KEYS`,不比時間戳與 verified 註記:重跑一次精靈、
 * 數值卻完全相同是最常見的情況,那不是漂移,警告在那時響起只會稀釋掉真正的警告。
 */
export function calibrationDrift(
  snapshot: CalibrationSnapshot | null,
  settings: Settings
): (keyof CalibrationSnapshot)[] {
  if (snapshot == null) return []
  return CALIBRATION_TRANSFORM_KEYS.filter((key) => snapshot[key] !== settings[key])
}
