// --- 角度環形數學(circular / wrap-safe angle math)---
// 韌體以 atan2f 產出角度(imu.h),值域為 -180…+180,是一個「環」而非實數線。
// 掛載方向決定站直姿勢落在環上的哪裡:若某肢段的靜止姿勢恰好落在 ±180 分支切點,
// 樣本會在 179.6 / -179.8 之間抖動,而任何線性運算都會把這個 0.6° 的實際差異
// 誤算成 359.4°。
//
// 具體後果(2026-08-01 會議 F4):
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
