// 合成資料驗證組(2026-09-08 會議「強制前提」):任何新公式都必須先掃過動作幅度驗證,
// 不能只測固定幅度下的幾個點——那正是已否決的提案 A(角度輸出上直接 atan2)通過驗證卻
// 仍然錯誤的原因:0°/35°/90° 三個固定點剛好在退化 bug 的免疫邊界上或幅度不足以觸發。
//
// 這裡的前向模擬不是獨立重新推導三角函數(那樣抄錯的風險和被驗證的公式一樣高),而是
// 直接呼叫 App 自己的 rotateRawAxes 反向合成「感測器在貼裝旋轉 φ、真實動作幅度 α 下
// 會讀到什麼」——rotateRawAxes(raw, φ) = 修正後角度,故 rotateRawAxes(修正後角度, −φ)
// = 感測器 raw 讀值,這是同一個關係反過來用,不是另一套獨立公式。
import { describe, expect, it } from 'vitest'
import { rotateRawAxes } from './angleMath'
import { recalibrateAxis } from './calibration'
import type { RawAngles } from '@shared/protocol'

const raw = (thigh: number, shin: number, thighRoll = 0, shinRoll = 0): RawAngles => ({
  thigh,
  shin,
  thighRoll,
  shinRoll
})

/** 合成「貼裝旋轉 φ 的感測器,對純 pitch 動作(幅度 α、roll 不變)」會讀到的 (pitch, roll) */
function simulateSensorReading(trueDeg: number, mountingPhiDeg: number): { pitch: number; roll: number } {
  return rotateRawAxes(trueDeg, 0, -mountingPhiDeg)
}

describe('recalibrateAxis — 合成資料掃過 φ × α(2026-09-08 會議強制前提)', () => {
  const PHIS = [-80, -45, -10, 0, 10, 30, 45, 60, 80, 90]
  const ALPHAS = [10, 25, 40, 55, 70, 85, 89] // 涵蓋提案 A 的已知退化區間(大幅度動作)

  it.each(PHIS)('貼裝旋轉 φ=%i°:跨全部動作幅度都解得出同一個 φ,不隨 α 增大而退化', (phi) => {
    const recovered: number[] = []
    for (const alpha of ALPHAS) {
      const baseline = simulateSensorReading(0, phi)
      const moved = simulateSensorReading(alpha, phi)
      const r = recalibrateAxis(
        raw(baseline.pitch, 0, baseline.roll, 0),
        raw(moved.pitch, 0, moved.roll, 0),
        'thigh'
      )
      recovered.push(r.rotationDeg)
    }
    // folded 值域是 (-90,90],φ=90 本身落在邊界上——用「與 φ 的最短弧差」比較,
    // 而不是直接比較數字,避免 90 跟 -90 這種等價表示法被誤判為不同答案
    const wrap90 = (x: number): number => {
      let w = x % 180
      if (w <= -90) w += 180
      if (w > 90) w -= 180
      return w
    }
    const target = wrap90(phi)
    for (const [i, alpha] of ALPHAS.entries()) {
      expect(recovered[i], `φ=${phi}°, α=${alpha}° 時應解出 ≈${target}°,實際 ${recovered[i]}°`).toBeCloseTo(
        target,
        3
      )
    }
    // 核心斷言:任兩個不同幅度解出的結果彼此一致(不隨 α 漂移)——這正是提案 A
    // 在 α→90° 附近會失敗的地方(恆定退化成 45°,與真實 φ 無關)
    const spread = Math.max(...recovered) - Math.min(...recovered)
    expect(spread, `不同動作幅度解出的 φ 彼此不一致,散佈達 ${spread}°`).toBeLessThan(1e-3)
  })

  it('提案 A 的退化公式(對已算出的角度輸出直接 atan2)在大幅度動作下確實會偏離 φ——用來對照新公式沒有重蹈覆轍', () => {
    // 提案 A 是「對已經算出的角度輸出」做 atan2(Δroll, Δpitch),而非對原始向量——
    // 用同一組合成的感測器讀值餵給兩種公式,只有這一種會隨 α 增大而失真
    const phi = 35
    const degenerateProposalA = (alpha: number): number => {
      const baseline = simulateSensorReading(0, phi)
      const moved = simulateSensorReading(alpha, phi)
      return (Math.atan2(moved.roll - baseline.roll, moved.pitch - baseline.pitch) * 180) / Math.PI
    }
    const small = degenerateProposalA(10)
    const large = degenerateProposalA(85)
    expect(small).toBeCloseTo(phi, 0) // 小幅度動作時提案 A 尚可用,誤差很小
    expect(Math.abs(large - phi)).toBeGreaterThan(5) // 大幅度動作時已明顯偏離真實 φ=35°

    // 新公式(recalibrateAxis)在同一組合成資料下,兩個幅度解出的 φ 都準確且彼此一致
    for (const alpha of [10, 85]) {
      const baseline = simulateSensorReading(0, phi)
      const moved = simulateSensorReading(alpha, phi)
      const r = recalibrateAxis(
        raw(baseline.pitch, 0, baseline.roll, 0),
        raw(moved.pitch, 0, moved.roll, 0),
        'thigh'
      )
      expect(r.rotationDeg, `α=${alpha}°`).toBeCloseTo(phi, 3)
    }
  })

  it('φ=0°/90° 邊界與現行 axisSwap:boolean 遷移的數字映射一致(false→0/true→90)', () => {
    // 這是 useStore.ts migrateSettings v12 的「精確映射」承諾在數值層面的迴歸鎖
    const noSwap = recalibrateAxis(raw(0, 0, 0, 0), raw(40, 0, 0, 0), 'thigh')
    expect(noSwap.rotationDeg).toBeCloseTo(0)
    const fullSwap = recalibrateAxis(raw(0, 0, 0, 0), raw(0, 0, 40, 0), 'thigh')
    expect(fullSwap.rotationDeg).toBeCloseTo(90)
  })
})
