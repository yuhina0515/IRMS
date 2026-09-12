// --- 角度環形數學(circular / wrap-safe angle math)---
// 韌體以 atan2f 產出角度(imu.h),值域為 -180…+180,是一個「環」而非實數線。
// 掛載方向決定站直姿勢落在環上的哪裡:若某肢段的靜止姿勢恰好落在 ±180 分支切點,
// 樣本會在 179.6 / -179.8 之間抖動,而任何線性運算都會把這個 0.6° 的實際差異
// 誤算成 359.4°。
//
// 具體後果:
//   - 線性平均/變異數 → 校準精靈算出 stdDev ≈ 180,永遠回報「偵測到晃動」,
//     而錯誤訊息叫使用者「保持靜止」——唯一沒用的事。校準永遠無法完成。
//   - 線性 EMA → 跨越切點時走長路經過 0,knee = |thigh - shin| 短暫讀到約 360°,
//     超過任何 overLimit 門檻 → 送出 CMD:ALARM_ON,蜂鳴器誤鳴。
//
// 此模組是所有角度聚合/差值運算的單一真實來源。凡是對角度做平均、差、
// 內插的地方,都必須走這裡,不可直接用 + - / 。

/** 一圈的度數 */
const FULL_TURN = 360

/**
 * 正規化到 (-180, 180]。
 * 這是本專案角度的標準表示區間,與韌體 atan2f 的輸出一致。
 */
export function normalizeDeg(deg: number): number {
  if (!Number.isFinite(deg)) return deg
  const wrapped = ((deg % FULL_TURN) + FULL_TURN) % FULL_TURN // → [0, 360)
  return wrapped > 180 ? wrapped - FULL_TURN : wrapped
}

/**
 * 兩角之間的最短弧差(to - from),結果落在 (-180, 180]。
 * 例:shortestArcDelta(179, -179) === 2(而非 -358)。
 */
export function shortestArcDelta(from: number, to: number): number {
  return normalizeDeg(to - from)
}

/**
 * 環形平均:atan2(Σsinθ, Σcosθ)。
 * 對 179.6 / -179.8 這種跨切點的樣本會正確回傳約 179.9,而非線性平均的 -0.1。
 * 空陣列回傳 0(呼叫端保證非空;此處僅為防禦)。
 */
export function circularMeanDeg(values: number[]): number {
  if (values.length === 0) return 0
  let sumSin = 0
  let sumCos = 0
  for (const v of values) {
    const rad = (v * Math.PI) / 180
    sumSin += Math.sin(rad)
    sumCos += Math.cos(rad)
  }
  return (Math.atan2(sumSin, sumCos) * 180) / Math.PI
}

/**
 * 環形標準差:R = |平均向量|,circular std = sqrt(-2 ln R)。
 * 離散度小時(本專案的「保持靜止」情境)數值與線性標準差幾乎相同,
 * 但跨 ±180 切點時不會爆成 180。
 * 完全分散(R→0)時回傳 180,代表「最大可能離散度」。
 */
export function circularStdDevDeg(values: number[]): number {
  const n = values.length
  if (n === 0) return 0
  let sumSin = 0
  let sumCos = 0
  for (const v of values) {
    const rad = (v * Math.PI) / 180
    sumSin += Math.sin(rad)
    sumCos += Math.cos(rad)
  }
  const r = Math.hypot(sumSin / n, sumCos / n)
  if (r <= 1e-12) return 180
  if (r >= 1) return 0 // 浮點誤差可能讓完全一致的樣本算出 r 略大於 1
  return (Math.sqrt(-2 * Math.log(r)) * 180) / Math.PI
}

/**
 * 關節夾角:兩肢段角的最短弧差取絕對值,結果恆在 [0, 180]。
 * 這個值域是結構性保證,不是鉗制——因此不可能再出現線性版本那種
 * 「短暫讀到 360°」而誤觸超限警報的情形。
 */
export function jointAngleDeg(proximal: number, distal: number): number {
  return Math.abs(shortestArcDelta(distal, proximal))
}

/**
 * 從一對已算出的 pitch/roll 角度,反推**單位化**的等價代表向量 `(ax, ay, az)`
 * (`ax²+ay²+az²=1`)。
 *
 * 韌體(`IRMS_Sensor/imu.h`)以 `accPitch = atan2(ay,az)`、`accRoll = atan2(ax,az)` 算出
 * 兩個角度——共用分母 `az` 本身不可觀測,角度只由比值 `ax/az`、`ay/az` 決定。校準擷取
 * 全程要求靜止(`CAPTURE_STD_LIMIT`),靜止時加速度計量到的只有重力,長度恆為 1g——
 * 故單位化不是任意選擇,是這個向量在物理上真正該有的長度,這樣不同時間點擷取的向量
 * 才共享同一個尺度,`recalibrateAxis` 比較兩個時間點時才不會被「兩點各自代表向量的
 * 尺度不同」污染。
 *
 * **不能單純取 `az=1`、`ay=tan(pitch)`(未單位化的等價比值版本)**:`tan()` 以 180° 為
 * 週期(`tan(30°)=tan(210°)`),會遺失 `atan2` 原本用分母正負號記下的那個位元
 * (pitch=30° 對應 `az>0`,pitch=210°=-150° 對應 `az<0`,兩者 `tan` 值相同但物理上是
 * 不同姿態)——這個資訊在 `pitch` 本身的象限裡還在,只是被 `tan()` 這一步弄丟。修法:
 * 用 `cos(pitch)` 的正負號還原 `az` 的正負號(pitch 通常有較大活動範圍,如膝彎曲可達
 * 150° 以上;roll 通常維持小角度的外展修正,較不會落在 `cos=0` 的奇異點附近,故以
 * pitch 為準),再除以向量長度單位化。
 */
export function reconstructTiltVector(
  pitchDeg: number,
  rollDeg: number
): { ax: number; ay: number; az: number } {
  const pitchRad = (pitchDeg * Math.PI) / 180
  const rollRad = (rollDeg * Math.PI) / 180
  const tanPitch = Math.tan(pitchRad)
  const tanRoll = Math.tan(rollRad)
  const azSign = Math.cos(pitchRad) >= 0 ? 1 : -1
  const scale = azSign / Math.sqrt(1 + tanPitch * tanPitch + tanRoll * tanRoll)
  return { ax: scale * tanRoll, ay: scale * tanPitch, az: scale }
}

/**
 * 單顆 IMU 貼裝軸向誤差:原始向量旋轉法(2026-09-08 會議裁決,取代舊版二元 axisSwap)。
 *
 * 不能直接對「角度輸出」本身做旋轉(那是已否決的提案 A:大幅度動作下會退化成恆定 45°,
 * 精靈實際要求的抬腿/勾腿幅度正好落在退化區間)。正確做法是先用 `reconstructTiltVector`
 * 反推原始向量的方向,旋轉這個向量後再重新算 `atan2`,才是對的「先於 atan2 而非之後」。
 * 旋轉軸是感測器自身的法向量(`az`),繞自身旋轉不改變 `az`。
 *
 * `rotationDeg` 是感測器貼裝時繞自身法向量偏轉的角度:0° = 正貼(舊 `axisSwap:false`),
 * 90° = 貼歪整 90°(舊 `axisSwap:true`)。旋轉是真旋轉(行列式 +1),而舊版二元 swap
 * 是不變號的純交換(行列式 -1、屬於反射)——兩者在拓樸上不可能連續重合,因此 90° 邊界
 * 必然有一軸出現舊版沒有的變號,這不是實作疏漏,是「反射性交換」與「真旋轉」的本質
 * 差異;多出的那次變號由既有、獨立判定的 `invert` 欄位吸收(見 calibration.ts 的
 * `recalibrateAxis`)。旋轉半圈(`rotationDeg+180`)恆讓兩軸同時變號,故只需在
 * (-90°, 90°] 主值域內表示,不遺失資訊。
 */
export function rotateRawAxes(
  pitchDeg: number,
  rollDeg: number,
  rotationDeg: number
): { pitch: number; roll: number } {
  const rad = (rotationDeg * Math.PI) / 180
  const { ax, ay, az } = reconstructTiltVector(pitchDeg, rollDeg)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const ax2 = ax * cos - ay * sin
  const ay2 = ax * sin + ay * cos
  return {
    pitch: (Math.atan2(ay2, az) * 180) / Math.PI,
    roll: (Math.atan2(ax2, az) * 180) / Math.PI
  }
}
