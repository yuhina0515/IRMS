import { describe, it, expect } from 'vitest'
import {
  normalizeDeg,
  shortestArcDelta,
  circularMeanDeg,
  circularStdDevDeg,
  jointAngleDeg
} from './angleMath'

describe('normalizeDeg', () => {
  it('leaves values already in (-180, 180] untouched', () => {
    expect(normalizeDeg(0)).toBe(0)
    expect(normalizeDeg(45.5)).toBeCloseTo(45.5, 10)
    expect(normalizeDeg(-179.8)).toBeCloseTo(-179.8, 10)
    expect(normalizeDeg(180)).toBe(180)
  })

  it('wraps values outside the range into it', () => {
    expect(normalizeDeg(190)).toBeCloseTo(-170, 10)
    expect(normalizeDeg(-190)).toBeCloseTo(170, 10)
    expect(normalizeDeg(360)).toBe(0)
    expect(normalizeDeg(720 + 30)).toBeCloseTo(30, 10)
    expect(normalizeDeg(-360 - 30)).toBeCloseTo(-30, 10)
  })

  it('passes NaN/Infinity through rather than turning them into a plausible angle', () => {
    expect(Number.isNaN(normalizeDeg(NaN))).toBe(true)
    expect(normalizeDeg(Infinity)).toBe(Infinity)
  })
})

describe('shortestArcDelta', () => {
  it('takes the short way around the branch cut', () => {
    // 這是線性運算會算成 -358 的情形
    expect(shortestArcDelta(179, -179)).toBeCloseTo(2, 10)
    expect(shortestArcDelta(-179, 179)).toBeCloseTo(-2, 10)
  })

  it('behaves like plain subtraction away from the cut', () => {
    expect(shortestArcDelta(10, 35)).toBeCloseTo(25, 10)
    expect(shortestArcDelta(35, 10)).toBeCloseTo(-25, 10)
  })
})

describe('circularMeanDeg', () => {
  it('matches the arithmetic mean when samples are far from the cut', () => {
    expect(circularMeanDeg([10, 12, 14])).toBeCloseTo(12, 6)
    expect(circularMeanDeg([-40, -42])).toBeCloseTo(-41, 6)
  })

  it('averages correctly across the ±180 branch cut', () => {
    // 線性平均會給 -0.1(指向完全相反的方向);正解約 179.9
    const mean = circularMeanDeg([179.6, -179.8])
    expect(Math.abs(mean)).toBeGreaterThan(179)
  })

  it('returns 0 for an empty sample set rather than NaN', () => {
    expect(circularMeanDeg([])).toBe(0)
  })
})

describe('circularStdDevDeg', () => {
  it('is ~0 for a perfectly still capture', () => {
    expect(circularStdDevDeg([25, 25, 25, 25])).toBeLessThan(1e-6)
  })

  it('approximates the linear stdDev for small dispersion', () => {
    // 這是校準精靈實際運作的區間,必須與原本的線性行為相容
    const samples = [10, 12, 14, 16, 18]
    const linearMean = samples.reduce((a, b) => a + b, 0) / samples.length
    const linearStd = Math.sqrt(
      samples.reduce((a, b) => a + (b - linearMean) ** 2, 0) / samples.length
    )
    expect(circularStdDevDeg(samples)).toBeCloseTo(linearStd, 1)
  })

  it('does NOT explode across the branch cut — the wizard-bricking case', () => {
    // 靜止不動但落在 ±180 切點上抖動 0.6°:線性 stdDev ≈ 180(> 門檻 3,永遠判定晃動),
    // 環形 stdDev 必須反映實際的 0.6° 抖動
    const straddling = [179.6, -179.8, 179.9, -179.9, 180]
    expect(circularStdDevDeg(straddling)).toBeLessThan(1)

    const linearMean = straddling.reduce((a, b) => a + b, 0) / straddling.length
    const linearStd = Math.sqrt(
      straddling.reduce((a, b) => a + (b - linearMean) ** 2, 0) / straddling.length
    )
    expect(linearStd).toBeGreaterThan(100) // 確認這個測資真的會打爆線性版本
  })

  it('reports maximal dispersion for uniformly spread samples', () => {
    expect(circularStdDevDeg([0, 90, 180, -90])).toBe(180)
  })
})

describe('jointAngleDeg', () => {
  it('equals the plain absolute difference away from the cut', () => {
    expect(jointAngleDeg(90, 0)).toBeCloseTo(90, 10)
    expect(jointAngleDeg(0, 90)).toBeCloseTo(90, 10)
    expect(jointAngleDeg(30, 10)).toBeCloseTo(20, 10)
  })

  it('never exceeds 180, even for segment angles on opposite sides of the cut', () => {
    // 線性版本 |179 - (-179)| = 358,足以越過任何 overLimit 門檻並誤觸警報
    expect(jointAngleDeg(179, -179)).toBeCloseTo(2, 10)
    for (const [a, b] of [
      [179.9, -179.9],
      [-170, 175],
      [180, -180],
      [120, -120]
    ]) {
      const knee = jointAngleDeg(a, b)
      expect(knee).toBeGreaterThanOrEqual(0)
      expect(knee).toBeLessThanOrEqual(180)
    }
  })
})
