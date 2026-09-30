// --- 校準精靈純數學(v4:axisSwap:boolean → axisRotationDeg:number,2026-09-08 會議)---
// 由四次靜態捕捉(站直 / 前抬大腿 / 站立後勾小腿 / 腿向外側擺)推導:
// 1. axisRotationDeg —— 感測器貼裝旋轉角(連續值,取代舊版二元 axisSwap),原始向量
//    旋轉法解出,見 recalibrateAxis
// 2. invert  —— pitch 依前抬/後勾方向、roll 依外展方向自動判定(大腿/小腿獨立,見下)
// 3. offset  —— 以站直姿勢四軸歸零
// 統一慣例(校準後):Pitch 正 = 向前抬;Roll 正 = 向外側傾;kneeRoll 正 = 外翻。
// 產出的 patch 直接餵 applyCalibration,偵測 / 3D / 2D 全域同步生效。
import type { CalibrationSnapshot } from '@shared/types'
import type { RawAngles } from '@shared/protocol'
import { CALIBRATION_KEYS, CALIBRATION_TRANSFORM_KEYS, type Settings } from '../store/useStore'
import {
  circularMeanDeg,
  circularStdDevDeg,
  deriveHingeAxis,
  projectOntoHingeFrame,
  reconstructTiltVector,
  rotateAccelerationAxes,
  rotateRawAxes,
  shortestArcDelta,
  vectorAngleDeg
} from './angleMath'
import type { AccelVector } from '@shared/protocol'

/** 捕捉期間允許的最大標準差(度)——超過視為晃動 */
export const CAPTURE_STD_LIMIT = 3
/** 外展步驟專用的標準差上限——單腳站立本身晃動較大,略放寬於一般步驟 */
export const CAPTURE_STD_LIMIT_ABDUCTION = 4
/** 判斷 pitch invert 所需的最小動作幅度(度) */
export const CAPTURE_DELTA_MIN = 20
/** 判斷 roll invert(外展)所需的最小動作幅度(度)——大腿/小腿分別獨立判定 */
export const CAPTURE_ROLL_DELTA_MIN = 15
/** 韌體的兩個 atan2 共用 az；低於此值時角度分支對雜訊過度敏感。 */
export const MIN_BASELINE_AZ = 0.1

export interface CaptureStats {
  mean: RawAngles
  /** 四軸中最大的標準差,用於「保持靜止」驗證 */
  maxStdDev: number
}

const AXES = ['thigh', 'shin', 'thighRoll', 'shinRoll'] as const
type AngleKey = (typeof AXES)[number]

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
  axes: readonly AngleKey[]
): number {
  if (axes.length === 0) return 0
  // 新協定下，前後動作門檻直接量完整重力向量的角位移。接近 z=0 時 Euler pitch
  // 可能幾乎不變或跨分支跳動，但 3D 向量仍完整記錄了真實動作。
  if (axes === PITCH_AXES && baseline.thighAccel && baseline.shinAccel && current.thighAccel && current.shinAccel) {
    return Math.max(
      vectorAngleDeg(baseline.thighAccel, current.thighAccel),
      vectorAngleDeg(baseline.shinAccel, current.shinAccel)
    )
  }
  return Math.max(...axes.map((k) => Math.abs(shortestArcDelta(baseline[k], current[k]))))
}

/**
 * 四軸的環形平均與最大環形標準差。
 * 必須用環形統計而非算術平均:角度是環不是實數線,若某肢段的靜止姿勢落在
 * ±180 分支切點,線性版本會把 0.6° 的抖動算成 stdDev ≈ 180,精靈永遠回報
 * 「偵測到晃動」而無法完成校準。
 */
export function computeCaptureStats(samples: RawAngles[]): CaptureStats {
  const mean: RawAngles = { thigh: 0, shin: 0, thighRoll: 0, shinRoll: 0 }
  let maxStdDev = 0
  const hasCompleteAccel =
    samples.length > 0 && samples.every((sample) => sample.thighAccel && sample.shinAccel)
  for (const k of AXES) {
    const series = samples.map((s) => s[k])
    mean[k] = circularMeanDeg(series)
    // 新韌體的 Euler 欄位只為舊 App 相容，靠近 az=0 時仍會跳分支；穩定性改由
    // 未丟失資訊的三維向量判定，不能讓相容欄位否決有效資料。
    if (!hasCompleteAccel) maxStdDev = Math.max(maxStdDev, circularStdDevDeg(series))
  }
  for (const [key, target] of [
    ['thighAccel', 'thighAccel'],
    ['shinAccel', 'shinAccel']
  ] as const) {
    const vectors = samples.map((s) => s[key]).filter((v) => v !== undefined)
    if (vectors.length === samples.length && vectors.length > 0) {
      const x = vectors.reduce((sum, v) => sum + v.x, 0)
      const y = vectors.reduce((sum, v) => sum + v.y, 0)
      const z = vectors.reduce((sum, v) => sum + v.z, 0)
      const norm = Math.hypot(x, y, z) || 1
      mean[target] = { x: x / norm, y: y / norm, z: z / norm }
      const angularErrors = vectors.map((v) => {
        const vNorm = Math.hypot(v.x, v.y, v.z) || 1
        const dot = (v.x * x + v.y * y + v.z * z) / (vNorm * norm)
        return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI
      })
      const rms = Math.sqrt(angularErrors.reduce((sum, error) => sum + error * error, 0) / angularErrors.length)
      maxStdDev = Math.max(maxStdDev, rms)
    }
  }
  return { mean, maxStdDev }
}

export interface AxisMapping {
  proximalAxisRotationDeg: number
  distalAxisRotationDeg: number
}

/** 依軸旋轉角取得「有效」raw 值(見 angleMath.ts 的 rotateRawAxes——2026-09-08 會議裁決的原始向量旋轉法) */
export function effectiveRaw(raw: RawAngles, m: AxisMapping): RawAngles {
  const thigh = raw.thighAccel
    ? rotateAccelerationAxes(raw.thighAccel, m.proximalAxisRotationDeg)
    : rotateRawAxes(raw.thigh, raw.thighRoll, m.proximalAxisRotationDeg)
  const shin = raw.shinAccel
    ? rotateAccelerationAxes(raw.shinAccel, m.distalAxisRotationDeg)
    : rotateRawAxes(raw.shin, raw.shinRoll, m.distalAxisRotationDeg)
  return { thigh: thigh.pitch, thighRoll: thigh.roll, shin: shin.pitch, shinRoll: shin.roll }
}

/**
 * 將 φ 折回 (-90°, 90°] 主值域。
 *
 * `rotateRawAxes(pitch, roll, θ+180)` 恆等於 `rotateRawAxes(...)` 在 θ 的結果兩軸同時
 * 變號——旋轉半圈只讓兩軸一起變號,而變號正是既有 `invert` 欄位本來就在處理的事。
 * 因此 θ 與 θ+180 是同一個物理安裝角度的兩種等價表示法,折回單一主值域不遺失資訊,
 * 只是固定選一個代表值(邊界 -90° 收斂到 +90°,讓「貼歪 90°」有單一表示)。
 */
function foldRotationDeg(deg: number): number {
  let wrapped = deg % 180
  if (wrapped <= -90) wrapped += 180
  if (wrapped > 90) wrapped -= 180
  return wrapped
}

/**
 * 單顆 IMU 獨立判定安裝軸向(2026-09-08 會議裁決,取代舊版二元 `detectAxisSwap`)。
 *
 * 用既有精靈同一個單一參考動作(大腿:前抬;小腿:後勾)的站直基準+動作終點兩點擷取
 * 解出 φ,不需連續掃描、不需新增操作步驟。物理假設:單一參考動作應為純 pitch,不動
 * 「有效 roll」——套用 `rotateRawAxes` 推導,旋轉後的有效 roll 分量
 * `ax_a = ax·cosφ − ay·sinφ`、`az_a = az` 在動作前後應該解出同一個角度
 * `atan2(ax_a, az_a)`,即 `(ax_m·cosφ−ay_m·sinφ)/az_m = (ax_b·cosφ−ay_b·sinφ)/az_b`
 * (下標 m/b 為動作終點/基準)。交叉相乘解出:
 * `tanφ = (ax_m·az_b − ax_b·az_m) / (ay_m·az_b − ay_b·az_m)`——這是精確解,不是小角度
 * 近似;`(ax,ay,az)` 取 `reconstructTiltVector` 的單位化向量(基準與終點兩次擷取都是
 * 靜止讀值,重力量值恆為 1g,單位化後兩者才共享同一個尺度,不能各自任意取 `az=1` 的
 * 未單位化比值版本——那只在基準剛好落在 pitch=roll=0 時碰巧與精確解一致)。
 *
 * @returns rotationDeg 為解出的貼裝旋轉角(°,(-90,90] 主值域);delta 沿用舊版角度
 *   空間(非向量空間)的最大位移,供 `CAPTURE_DELTA_MIN` 幅度把關——角度空間在這裡仍是
 *   對的量度,換成向量空間的量級會被 `tan()` 在大角度時的陡峭放大扭曲。
 */
export function recalibrateAxis(
  baseline: RawAngles,
  moved: RawAngles,
  limb: 'thigh' | 'shin'
): { rotationDeg: number; delta: number } {
  const pitchKey = limb
  const rollKey = limb === 'thigh' ? 'thighRoll' : 'shinRoll'

  const dPitch = Math.abs(shortestArcDelta(baseline[pitchKey], moved[pitchKey]))
  const dRoll = Math.abs(shortestArcDelta(baseline[rollKey], moved[rollKey]))

  // reconstructTiltVector(見 angleMath.ts):不能單純用 tan() 反推,pitch 超過 ±90°
  // (膝彎曲常見)時 tan() 的 180° 週期會與 atan2 原本記下的象限資訊互相矛盾
  const baselineAccel = limb === 'thigh' ? baseline.thighAccel : baseline.shinAccel
  const movedAccel = limb === 'thigh' ? moved.thighAccel : moved.shinAccel
  const b = baselineAccel
    ? { ax: baselineAccel.x, ay: baselineAccel.y, az: baselineAccel.z }
    : reconstructTiltVector(baseline[pitchKey], baseline[rollKey])
  const m = movedAccel
    ? { ax: movedAccel.x, ay: movedAccel.y, az: movedAccel.z }
    : reconstructTiltVector(moved[pitchKey], moved[rollKey])
  const numerator = m.ax * b.az - b.ax * m.az
  const denominator = m.ay * b.az - b.ay * m.az

  const rotationDeg = foldRotationDeg((Math.atan2(numerator, denominator) * 180) / Math.PI)

  const vectorDelta = baselineAccel && movedAccel ? vectorAngleDeg(baselineAccel, movedAccel) : 0
  return { rotationDeg, delta: Math.max(dPitch, dRoll, vectorDelta) }
}

export type CalibrationError =
  | 'unstable'
  | 'singularBaseline'
  | 'thighDeltaTooSmall'
  | 'shinDeltaTooSmall'

/** 站姿是否離韌體 atan2(ay,az) / atan2(ax,az) 的共同奇異點足夠遠。 */
export function baselineIsObservable(baseline: RawAngles): boolean {
  // 新協定保留完整向量，不再依靠 Euler 角反推，因此即使 z≈0 仍可由連續向量
  // 正確判讀。舊協定才需要拒絕不可觀測的站姿。
  if (baseline.thighAccel && baseline.shinAccel) return true
  const thigh = reconstructTiltVector(baseline.thigh, baseline.thighRoll)
  const shin = reconstructTiltVector(baseline.shin, baseline.shinRoll)
  return Math.abs(thigh.az) >= MIN_BASELINE_AZ && Math.abs(shin.az) >= MIN_BASELINE_AZ
}

/**
 * 外展時有效 pitch 的殘留量達到該側 roll 動作幅度的這個比例以上 → 視為耦合警示。
 *
 * 2026-09-15 會議根因:`recalibrateAxis` 的 φ 只有一個自由度(繞感測器自身法向量),
 * 理論上只能代表「同一貼裝面上扭轉」,代表不了「換了整個貼裝面」這種可能的雙自由度
 * 誤差(例如貼正面而非文件建議的外側)。外展理應是純冠狀面動作,若 φ 修正完全正確,
 * 外展前後的有效 pitch 應該幾乎不變;殘留越大,代表這次解出的 φ 越可能沒有完整代表
 * 實際貼裝誤差。這不是校準門檻,只是精靈最後一步(人工預覽確認)的額外提示——不擋
 * 套用、不要求重做。外展動作本身維持選配:它是全精靈唯一需要單腳站立的步驟,對平衡
 * 受限的復健患者最困難(見 CalibrationWizard.tsx 步驟 5 的既有取捨),今天的會議裁決
 * 不能反過來強制這個步驟,否則犧牲的是這個專案已經刻意保留的病患可及性。
 */
export const COUPLING_RESIDUAL_RATIO_WARN = 0.4

export type CalibrationResult =
  | {
      ok: true
      patch: Partial<Settings>
      /** 外展未做或該軸幅度不足以信任時為 null(「不知道」,不可當成「沒問題」)。 */
      couplingWarning: { proximal: boolean | null; distal: boolean | null }
    }
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
  // 奇異區的靜態平均可能看似穩定，但下一次 az 穿越 0 就會跳到另一角度分支。
  // 這項資訊在韌體各自濾波兩個角度時已遺失，App 不應產生看似成功的錯誤校正。
  if (!baselineIsObservable(baseline.mean)) return { ok: false, error: 'singularBaseline' }

  const hasFullVectors =
    baseline.mean.thighAccel && baseline.mean.shinAccel && thighRaise.mean.thighAccel && kneeFlex.mean.shinAccel
  if (hasFullVectors) {
    return buildCalibrationPatchFromVectors(baseline, thighRaise, kneeFlex, abduction, current)
  }
  return buildCalibrationPatchFromEuler(baseline, thighRaise, kneeFlex, abduction, current)
}

/**
 * 舊協定(僅 Euler 角)路徑——2026-09-08 會議裁決的原始向量旋轉法,單自由度
 * `axisRotationDeg` 假設感測器貼裝面已知、只是繞自身法向量扭轉。新協定(完整重力
 * 向量)一律改走 `buildCalibrationPatchFromVectors`,這裡只服務尚未升級韌體的裝置。
 */
function buildCalibrationPatchFromEuler(
  baseline: CaptureStats,
  thighRaise: CaptureStats,
  kneeFlex: CaptureStats,
  abduction: CaptureStats | null,
  current: Settings
): CalibrationResult {
  // 1. 軸向解算(先於一切符號判定)
  const thighAxis = recalibrateAxis(baseline.mean, thighRaise.mean, 'thigh')
  if (thighAxis.delta < CAPTURE_DELTA_MIN) return { ok: false, error: 'thighDeltaTooSmall' }
  const shinAxis = recalibrateAxis(baseline.mean, kneeFlex.mean, 'shin')
  if (shinAxis.delta < CAPTURE_DELTA_MIN) return { ok: false, error: 'shinDeltaTooSmall' }
  const mapping: AxisMapping = {
    proximalAxisRotationDeg: thighAxis.rotationDeg,
    distalAxisRotationDeg: shinAxis.rotationDeg
  }

  // 2. 以「有效軸」判定 pitch invert:
  //    前抬大腿 → 慣例下 thigh 應變大;站立後勾小腿 → shin 應變小
  const effBase = effectiveRaw(baseline.mean, mapping)
  const effRaise = effectiveRaw(thighRaise.mean, mapping)
  const effFlex = effectiveRaw(kneeFlex.mean, mapping)
  const proximalInvert = shortestArcDelta(effBase.thigh, effRaise.thigh) < 0
  const distalInvert = shortestArcDelta(effBase.shin, effFlex.shin) > 0

  // 3. roll invert:腿向外側擺 → 慣例下(正 = 向外)兩肢段 roll 皆應變大。
  //    大腿/小腿獨立判定——單腳站立時膝蓋未必鎖死,兩肢段擺動幅度可能不同步;
  //    哪一軸幅度不足以信任正負號,就沿用該軸原設定,不因單軸不足讓整步失敗重捕。
  let proximalRollInvert = current.proximalRollInvert
  let distalRollInvert = current.distalRollInvert
  let proximalRollVerified = current.proximalRollVerified
  let distalRollVerified = current.distalRollVerified
  const couplingWarning: { proximal: boolean | null; distal: boolean | null } = {
    proximal: null,
    distal: null
  }
  if (abduction) {
    const effAbd = effectiveRaw(abduction.mean, mapping)
    const dThigh = shortestArcDelta(effBase.thighRoll, effAbd.thighRoll)
    const dShin = shortestArcDelta(effBase.shinRoll, effAbd.shinRoll)
    if (Math.abs(dThigh) >= CAPTURE_ROLL_DELTA_MIN) {
      proximalRollInvert = dThigh < 0
      proximalRollVerified = true
      const pitchResidual = shortestArcDelta(effBase.thigh, effAbd.thigh)
      couplingWarning.proximal = Math.abs(pitchResidual) / Math.abs(dThigh) > COUPLING_RESIDUAL_RATIO_WARN
    }
    if (Math.abs(dShin) >= CAPTURE_ROLL_DELTA_MIN) {
      distalRollInvert = dShin < 0
      distalRollVerified = true
      const pitchResidual = shortestArcDelta(effBase.shin, effAbd.shin)
      couplingWarning.distal = Math.abs(pitchResidual) / Math.abs(dShin) > COUPLING_RESIDUAL_RATIO_WARN
    }
  }

  // 4. zeroRaw:站直姿勢(有效軸)本身就是零位讀值,不折算 invert 符號——
  //    判定端以 (raw − zeroRaw) × sign 求值,故事後翻轉 invert 不會擾動零位
  //    (不是舊的「符號摺疊」offset 表示法——那個在 invert 翻轉時會產生雙倍偏差)
  const patch: Partial<Settings> = {
    ...mapping,
    // 這次精靈剛用真實動作重新解出 rotationDeg,標記為已驗證——與舊版布林遷移來的
    // legacy/unverified 資料區隔開(見 useStore.ts migrateSettings)
    proximalAxisRotationVerified: true,
    distalAxisRotationVerified: true,
    proximalInvert,
    distalInvert,
    proximalRollInvert,
    distalRollInvert,
    proximalRollVerified,
    distalRollVerified,
    proximalZeroRaw: effBase.thigh,
    distalZeroRaw: effBase.shin,
    proximalRollZeroRaw: effBase.thighRoll,
    distalRollZeroRaw: effBase.shinRoll
  }
  return { ok: true, patch, couplingWarning }
}

/**
 * 新協定(完整重力向量)路徑——2026-09-15 決策:放棄「貼裝面已知、只是繞自身法向量
 * 扭轉」這個單自由度假設,改用 `deriveHingeAxis` 從基準 + 單一參考動作外積直接解出
 * 任意 3D 貼裝方向的屈曲軸,不管實際怎麼佩戴。零位不再是某個旋轉後的 Euler 角,而是
 * 基準重力向量本身;即時角度由 `projectOntoHingeFrame` 把目前向量投影進「屈曲軸/
 * 側軸/基準軸」這組由外積天生正交的座標系求得(見 useStore.ts applyCalibration)。
 */
function buildCalibrationPatchFromVectors(
  baseline: CaptureStats,
  thighRaise: CaptureStats,
  kneeFlex: CaptureStats,
  abduction: CaptureStats | null,
  current: Settings
): CalibrationResult {
  const baseThigh = baseline.mean.thighAccel as AccelVector
  const baseShin = baseline.mean.shinAccel as AccelVector
  const raiseThigh = thighRaise.mean.thighAccel as AccelVector
  const flexShin = kneeFlex.mean.shinAccel as AccelVector

  const thighDelta = vectorAngleDeg(baseThigh, raiseThigh)
  if (thighDelta < CAPTURE_DELTA_MIN) return { ok: false, error: 'thighDeltaTooSmall' }
  const shinDelta = vectorAngleDeg(baseShin, flexShin)
  if (shinDelta < CAPTURE_DELTA_MIN) return { ok: false, error: 'shinDeltaTooSmall' }

  const proximalHingeAxis = deriveHingeAxis(baseThigh, raiseThigh)
  const distalHingeAxis = deriveHingeAxis(baseShin, flexShin)

  // pitch invert:前抬大腿 → 慣例下 thigh 應變大;站立後勾小腿 → shin 應變小。
  // 基準姿勢投影恆為 0(見 projectOntoHingeFrame),動作終點的投影本身就是位移量。
  const proximalRaisePitch = projectOntoHingeFrame(raiseThigh, proximalHingeAxis, baseThigh).pitch
  const distalFlexPitch = projectOntoHingeFrame(flexShin, distalHingeAxis, baseShin).pitch
  const proximalInvert = proximalRaisePitch < 0
  const distalInvert = distalFlexPitch > 0

  // roll invert + 耦合殘留提示,邏輯與 Euler 路徑相同,只是改讀投影後的 pitch/roll。
  let proximalRollInvert = current.proximalRollInvert
  let distalRollInvert = current.distalRollInvert
  let proximalRollVerified = current.proximalRollVerified
  let distalRollVerified = current.distalRollVerified
  const couplingWarning: { proximal: boolean | null; distal: boolean | null } = {
    proximal: null,
    distal: null
  }
  if (abduction && abduction.mean.thighAccel && abduction.mean.shinAccel) {
    const abdThigh = projectOntoHingeFrame(abduction.mean.thighAccel, proximalHingeAxis, baseThigh)
    const abdShin = projectOntoHingeFrame(abduction.mean.shinAccel, distalHingeAxis, baseShin)
    if (Math.abs(abdThigh.roll) >= CAPTURE_ROLL_DELTA_MIN) {
      proximalRollInvert = abdThigh.roll < 0
      proximalRollVerified = true
      couplingWarning.proximal = Math.abs(abdThigh.pitch) / Math.abs(abdThigh.roll) > COUPLING_RESIDUAL_RATIO_WARN
    }
    if (Math.abs(abdShin.roll) >= CAPTURE_ROLL_DELTA_MIN) {
      distalRollInvert = abdShin.roll < 0
      distalRollVerified = true
      couplingWarning.distal = Math.abs(abdShin.pitch) / Math.abs(abdShin.roll) > COUPLING_RESIDUAL_RATIO_WARN
    }
  }

  const patch: Partial<Settings> = {
    proximalAxisRotationVerified: true,
    distalAxisRotationVerified: true,
    proximalInvert,
    distalInvert,
    proximalRollInvert,
    distalRollInvert,
    proximalRollVerified,
    distalRollVerified,
    proximalHingeAxis,
    distalHingeAxis,
    proximalZeroAccel: baseThigh,
    distalZeroAccel: baseShin,
    kneeZeroRaw: vectorAngleDeg(baseThigh, baseShin)
  }
  return { ok: true, patch, couplingWarning }
}

/**
 * 快速歸零:沿用現有 axisRotationDeg/invert 設定,只用「當下姿勢 = 0°」重設四個 zeroRaw。
 * 必須先套用 effectiveRaw 做軸向修正——和 buildCalibrationPatch 步驟 4 用同一組已校正軸,
 * 否則貼歪的感測器會把零位算在錯的物理軸上(SettingsView 曾經直接用
 * raw.thigh/raw.thighRoll,略過了這一步)。
 * zeroRaw 不折算 invert 符號,故不需要讀取 invert 設定——這正是重新參數化的收益:
 * invert 從「翻轉即雙倍偏差的地雷」變成不擾動零位的獨立控制項。
 */
export function buildQuickZeroPatch(raw: RawAngles, settings: Settings): Partial<Settings> {
  const eff = effectiveRaw(raw, {
    proximalAxisRotationDeg: settings.proximalAxisRotationDeg,
    distalAxisRotationDeg: settings.distalAxisRotationDeg
  })
  const patch: Partial<Settings> = {
    proximalZeroRaw: eff.thigh,
    distalZeroRaw: eff.shin,
    proximalRollZeroRaw: eff.thighRoll,
    distalRollZeroRaw: eff.shinRoll
  }
  if (raw.thighAccel && raw.shinAccel) {
    // 沿用既有屈曲軸(貼裝方向沒變,只是重新定義「零位」是哪個姿勢),只重設基準向量本身。
    patch.proximalZeroAccel = raw.thighAccel
    patch.distalZeroAccel = raw.shinAccel
    patch.kneeZeroRaw = vectorAngleDeg(raw.thighAccel, raw.shinAccel)
  }
  return patch
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
