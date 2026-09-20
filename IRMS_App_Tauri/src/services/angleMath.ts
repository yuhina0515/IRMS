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

/**
 * 新韌體路徑：直接旋轉 atan2 前的正規化加速度向量，避免從兩個已分別濾波的
 * Euler 投影反推向量。輸出格式維持既有 pitch/roll，讓校準設定與 UI 向後相容。
 */
export function rotateAccelerationAxes(
  acceleration: { x: number; y: number; z: number },
  rotationDeg: number
): { pitch: number; roll: number } {
  const { x, y, z } = rotateAccelerationVector(acceleration, rotationDeg)
  return {
    pitch: (Math.atan2(y, z) * 180) / Math.PI,
    roll: (Math.atan2(x, z) * 180) / Math.PI
  }
}

/** 保留完整 3D 向量的貼裝軸旋轉；供關節角直接在向量空間計算。 */
export function rotateAccelerationVector(
  acceleration: { x: number; y: number; z: number },
  rotationDeg: number
): { x: number; y: number; z: number } {
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const x = acceleration.x * cos - acceleration.y * sin
  const y = acceleration.x * sin + acceleration.y * cos
  const norm = Math.hypot(x, y, acceleration.z) || 1
  return { x: x / norm, y: y / norm, z: acceleration.z / norm }
}

/** 兩個 3D 單位方向的最短夾角，結果恆為 [0, 180]。 */
export function vectorAngleDeg(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): number {
  const an = Math.hypot(a.x, a.y, a.z) || 1
  const bn = Math.hypot(b.x, b.y, b.z) || 1
  const dot = (a.x * b.x + a.y * b.y + a.z * b.z) / (an * bn)
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI
}

function crossProduct(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  }
}

function dotProduct(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function normalizeVector(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const norm = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / norm, y: v.y / norm, z: v.z / norm }
}

/**
 * 由「站直基準」與「單一參考動作」的終點向量，外積解出該動作的屈曲軸（sensor frame
 * 下的單位向量）。取代 `rotateRawAxes`/`rotateAccelerationVector` 的單自由度旋轉修正法——
 * 那個方法假設感測器貼裝面已知、只是繞自身法向量扭轉了幾度；外積法不做這個假設，
 * 任意 3D 貼裝方向都能由同一組公式還原（2026-09-15 決策:改「固定方向」為
 * 「不管佩戴方式」,見同日 coding log）。
 *
 * 物理假設與 `recalibrateAxis` 相同:參考動作(前抬大腿 / 站立後勾小腿)應為單一鉸鏈的
 * 純轉動。此時基準向量與動作終點向量都與外積出的屈曲軸垂直(三重積為 0),因此這個軸
 * 正是那次轉動實際發生所繞的軸——不論感測器本身怎麼貼。
 */
export function deriveHingeAxis(
  baseline: { x: number; y: number; z: number },
  moved: { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
  return normalizeVector(crossProduct(baseline, moved))
}

/**
 * 把目前的重力向量投影進「屈曲軸 × 基準軸」張出的正交座標系，算出 pitch/roll。
 *
 * `hingeAxis` 由 `deriveHingeAxis` 求得，依外積定義恆與 `baseline` 垂直，因此
 * `{hingeAxis, hingeAxis×baseline, baseline}` 天生是一組正交基底，不需要額外
 * 正交化。基準姿勢本身投影出 pitch=roll=0；符號慣例由呼叫端的 invert 旗標決定
 * （外積方向本身是任意選擇，正負號在這裡並不重要）。
 *
 * roll 刻意不用 `atan2(x, z)`：那與 pitch 共用同一個分母 `z`（沿基準軸的分量）。
 * 膝深屈時 pitch 本就會逼近 ±90°、把 `z` 推向 0，此時任何殘留的 `x`（真正的
 * 屈曲軸外分量——來自屈曲軸估計誤差或軟組織/綁帶耦合）除以趨近 0 的分母就會
 * 爆成 ±180°，即使 `x` 本身完全沒變。這不是雜訊放大，是結構性 bug：即使
 * `x=0`（零外軸分量、純鉸鏈轉動），`atan2(0, z<0)` 仍固定回傳 180°（見
 * `calibration.redesign.test.ts` 的合成反例）。
 * 改用 `asin(x / |vector|)`：這是「重力向量偏離屈曲平面的角度」，只取決於
 * `x` 本身與向量總長，完全不看 `z`，因此與 pitch 是否逼近奇異點無關。定義域
 * 天生落在 [-90°, 90°]（`x/|vector| ∈ [-1,1]`），小角度時與舊公式數值幾乎
 * 相同（`z≈|vector|` 時 `asin(x/|vector|) ≈ atan2(x,z) ≈ x`），故不影響既有
 * 小角度 roll（外展、貼裝耦合殘留）的既測數值。
 * 語意變化：roll 現在量的是「重力向量偏出屈曲平面多少」，而非「繞基準軸轉了
 * 多少度」；兩者在小角度下等價，但只有前者在深屈膝時仍有定義。
 * （2026-09-16 CAL-02 決策，見 doc/coding log 同日記錄與
 * log_20260915_live_calibration_singularity.md 的根因分析。）
 */
export function projectOntoHingeFrame(
  vector: { x: number; y: number; z: number },
  hingeAxis: { x: number; y: number; z: number },
  baseline: { x: number; y: number; z: number }
): { pitch: number; roll: number } {
  const sideAxis = crossProduct(hingeAxis, baseline)
  const x = dotProduct(vector, hingeAxis)
  const y = dotProduct(vector, sideAxis)
  const z = dotProduct(vector, baseline)
  const magnitude = Math.hypot(vector.x, vector.y, vector.z) || 1
  const sinRoll = Math.max(-1, Math.min(1, x / magnitude))
  return {
    pitch: (Math.atan2(y, z) * 180) / Math.PI,
    roll: (Math.asin(sinRoll) * 180) / Math.PI
  }
}

/**
 * 實驗性 CAL-03 候選方案，**尚未接上任何即時路徑**（`useStore.ts` 未呼叫此函式）。
 * 未經真機驗證前不得取代現行 knee 計算——見下方「已知限制」。
 *
 * 動機（`calibration.redesign.test.ts` 第二個合成反例）：`useStore.ts` 目前直接對
 * `raw.thighAccel`/`raw.shinAccel` 這兩個「各自感測器自己座標系」下的原始向量算
 * `vectorAngleDeg`，再扣掉站姿夾角。旋轉向量本身不改變向量間夾角沒錯，但前提是
 * 兩個向量本來就在同一個座標系——這裡不是:兩顆 IMU 貼裝方向彼此獨立、未知，兩者
 * 的「原始重力向量」是在兩個不同旋轉過的座標系下量的。反例證明:即使兩肢段實際
 * 同步轉動(真實相對角為零)，只要遠端感測器多繞自身法向量貼歪 90 度，直接比較
 * 就會算出假的 60 度，且扣除站姿夾角(純量)無法補償——因為那個誤差不是常數
 * offset,是隨動作方向而變的座標系差異。
 *
 * 作法(triad / Wahba 對應法的簡化版,兩個對應向量對就能解):`deriveHingeAxis`
 * 已經從「基準+單一參考動作」外積解出各感測器自己座標系下的屈曲軸,且依外積定義
 * 恆與基準垂直。若假設近端(髖屈,前抬大腿)與遠端(膝屈,勾小腿)兩個參考動作實際上
 * 繞的是同一個真實世界方向(矢狀面內的同一內外側軸——這已經是本專案 roll/pitch
 * 分解、kneeRoll 內外翻正負號等既有邏輯隱含的假設,不是新引入的),則
 * `{hingeAxis, hingeAxis×baseline, baseline}` 這組正交基底在兩顆感測器上代表的是
 * 「同一組真實世界方向」,只是各自表達在自己旋轉過的座標系裡。因此可以:把來源
 * 感測器的即時向量投影成這組基底下的抽象座標(與感測器自身座標系無關的係數),
 * 再用目標感測器的基底把同一組抽象座標重新展開回目標感測器的座標系——等於把來源
 * 向量「搬」到目標座標系,才能與目標感測器的即時向量做有意義的比較。
 *
 * 已知限制(此函式未接上即時路徑的原因):
 * 1. 髖屈軸與膝屈軸是兩個不同的解剖關節,並非真的同一條線,只是方向假設平行
 *    (矢狀面運動)——此假設本身尚未在真機上獨立驗證。
 * 2. `deriveHingeAxis` 只用兩個平均點(基準、參考動作終點)解軸,對參考擷取時的
 *    離軸雜訊沒有備援(見 `log_20260915_live_calibration_singularity.md` 對
 *    hinge-axis 擷取的同一條警語)——此函式會把近端與遠端兩次獨立的擷取雜訊
 *    複合在一起,理論上比單一肢段的 pitch/roll 誤差更敏感。
 * 3. 本專案已有兩次「幾何推理看似正確,只有真人戴著裝置看即時數字才抓到真正
 *    bug」的前例(見 GitHub issue #3)。knee 是驅動目標/警報邏輯的主要量測值,
 *    風險遠高於本次一併修掉的 roll 顯示值,因此在真機比對出「哪一種失敗模式
 *    在實務上更常見」之前，不應該替換現行公式。
 *
 * 合成驗證(不冒充真機證據):見 `calibration.redesign.test.ts`——此函式能在反例
 * 場景正確算出 ~0°(取代直接比較算出的假 60°)，且在真實有相對屈曲的合成場景
 * 仍正確讀出該屈曲角，不會退化成恆零。
 */
export function reconcileToReferenceFrame(
  vector: { x: number; y: number; z: number },
  sourceHingeAxis: { x: number; y: number; z: number },
  sourceBaseline: { x: number; y: number; z: number },
  targetHingeAxis: { x: number; y: number; z: number },
  targetBaseline: { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
  const sourceSide = crossProduct(sourceHingeAxis, sourceBaseline)
  const abstractCoeffs = {
    x: dotProduct(vector, sourceHingeAxis),
    y: dotProduct(vector, sourceSide),
    z: dotProduct(vector, sourceBaseline)
  }
  const targetSide = crossProduct(targetHingeAxis, targetBaseline)
  return {
    x:
      abstractCoeffs.x * targetHingeAxis.x +
      abstractCoeffs.y * targetSide.x +
      abstractCoeffs.z * targetBaseline.x,
    y:
      abstractCoeffs.x * targetHingeAxis.y +
      abstractCoeffs.y * targetSide.y +
      abstractCoeffs.z * targetBaseline.y,
    z:
      abstractCoeffs.x * targetHingeAxis.z +
      abstractCoeffs.y * targetSide.z +
      abstractCoeffs.z * targetBaseline.z
  }
}
