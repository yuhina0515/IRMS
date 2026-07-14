// 校準純數學測試(v2:方向校正)。核心是 round-trip:精靈產出的 patch 餵回
// applyCalibration,斷言統一慣例成立——站直≈0、前抬為正、後勾為負、外展 roll 為正。
import { describe, expect, it } from 'vitest'
import type { RawAngles } from '@shared/protocol'
import { applyCalibration, type Settings } from '../store/useStore'
import {
  buildCalibrationPatch,
  computeCaptureStats,
  detectAxisSwap,
  effectiveRaw,
  type CaptureStats
} from './calibration'

const raw = (thigh: number, shin: number, thighRoll = 0, shinRoll = 0): RawAngles => ({
  thigh,
  shin,
  thighRoll,
  shinRoll
})

const stable = (mean: RawAngles): CaptureStats => ({ mean, maxStdDev: 0.5 })

const SETTINGS: Settings = {
  thighAxisSwap: false,
  shinAxisSwap: false,
  thighInvert: false,
  thighOffset: 0,
  shinInvert: false,
  shinOffset: 0,
  thighRollInvert: false,
  thighRollOffset: 0,
  shinRollInvert: false,
  shinRollOffset: 0,
  protocol: 'knee',
  maxChartPoints: 50,
  flushIntervalSec: 2,
  lastCalibratedAt: null
}

describe('computeCaptureStats', () => {
  it('平均與最大標準差(取四軸最大)', () => {
    const stats = computeCaptureStats([raw(10, 0), raw(14, 0), raw(12, 0)])
    expect(stats.mean.thigh).toBeCloseTo(12)
    expect(stats.maxStdDev).toBeCloseTo(Math.sqrt(8 / 3))
  })
})

describe('detectAxisSwap / effectiveRaw', () => {
  it('彎曲動作出現在 pitch 軸 → 不對調', () => {
    const r = detectAxisSwap(raw(0, 0), raw(40, 0, 3, 0), 'thigh')
    expect(r).toEqual({ swap: false, delta: 40 })
  })
  it('彎曲動作出現在 roll 軸(感測器貼歪 90°)→ 對調', () => {
    const r = detectAxisSwap(raw(0, 0), raw(3, 0, 40, 0), 'thigh')
    expect(r.swap).toBe(true)
    expect(r.delta).toBe(40)
  })
  it('effectiveRaw 對調指定肢段的 pitch/roll', () => {
    const eff = effectiveRaw(raw(1, 2, 3, 4), { thighAxisSwap: true, shinAxisSwap: false })
    expect(eff).toEqual({ thigh: 3, thighRoll: 1, shin: 2, shinRoll: 4 })
  })
})

describe('buildCalibrationPatch — 驗證', () => {
  const okRaise = stable(raw(40, 0))
  const okFlex = stable(raw(0, -35))

  it('晃動過大 → unstable', () => {
    const r = buildCalibrationPatch({ mean: raw(0, 0), maxStdDev: 5 }, okRaise, okFlex, null, SETTINGS)
    expect(r).toEqual({ ok: false, error: 'unstable' })
  })

  it('大腿/小腿幅度不足 → 對應錯誤碼', () => {
    expect(buildCalibrationPatch(stable(raw(0, 0)), stable(raw(12, 0)), okFlex, null, SETTINGS)).toEqual({
      ok: false,
      error: 'thighDeltaTooSmall'
    })
    expect(buildCalibrationPatch(stable(raw(0, 0)), okRaise, stable(raw(0, -10)), null, SETTINGS)).toEqual({
      ok: false,
      error: 'shinDeltaTooSmall'
    })
  })

  it('外展 roll 幅度不足 → rollDeltaTooSmall', () => {
    const r = buildCalibrationPatch(stable(raw(0, 0)), okRaise, okFlex, stable(raw(0, 0, 8, 20)), SETTINGS)
    expect(r).toEqual({ ok: false, error: 'rollDeltaTooSmall' })
  })

  it('跳過外展 → 沿用現有 roll invert 設定', () => {
    const cur = { ...SETTINGS, thighRollInvert: true }
    const r = buildCalibrationPatch(stable(raw(0, 0)), okRaise, okFlex, null, cur)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.patch.thighRollInvert).toBe(true)
  })
})

describe('buildCalibrationPatch — round-trip(慣例最終保證)', () => {
  it('反向佩戴:站直≈0、前抬為正、後勾為負、外展 roll 為正、kneeRoll≈0', () => {
    // 上下顛倒佩戴:前抬使 thigh raw 變小、後勾使 shin raw 變大、外展使 roll raw 變小
    const baseline = stable(raw(175, -178, 6, -4))
    const thighRaise = stable(raw(135, -178, 6, -4))
    const kneeFlex = stable(raw(175, -140, 6, -4))
    const abduction = stable(raw(175, -178, 6 - 25, -4 - 22)) // roll raw 變小 → 需反相
    const r = buildCalibrationPatch(baseline, thighRaise, kneeFlex, abduction, SETTINGS)
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const cal = { ...SETTINGS, ...r.patch }
    const stand = applyCalibration(baseline.mean, cal)
    expect(stand.thigh).toBeCloseTo(0)
    expect(stand.shin).toBeCloseTo(0)
    expect(stand.thighRoll).toBeCloseTo(0)
    expect(stand.shinRoll).toBeCloseTo(0)
    expect(stand.kneeRoll).toBeCloseTo(0)

    expect(applyCalibration(thighRaise.mean, cal).thigh).toBeCloseTo(40)
    expect(applyCalibration(kneeFlex.mean, cal).shin).toBeCloseTo(-38)
    const abd = applyCalibration(abduction.mean, cal)
    expect(abd.thighRoll).toBeCloseTo(25) // 外展 = 向外 = 正
    expect(abd.shinRoll).toBeCloseTo(22)
  })

  it('感測器貼歪 90°(彎曲出現在 roll 軸)→ axisSwap 修正後慣例仍成立', () => {
    // 大腿感測器轉了 90°:前抬時 thighRoll raw 大幅變化、thigh raw 幾乎不動
    const baseline = stable(raw(2, 1, 88, 3))
    const thighRaise = stable(raw(3, 1, 130, 3)) // 動作出現在 thighRoll 軸(+42)
    const kneeFlex = stable(raw(2, -34, 88, 3))
    const r = buildCalibrationPatch(baseline, thighRaise, kneeFlex, null, SETTINGS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.patch.thighAxisSwap).toBe(true)
    expect(r.patch.shinAxisSwap).toBe(false)

    const cal = { ...SETTINGS, ...r.patch }
    const stand = applyCalibration(baseline.mean, cal)
    expect(stand.thigh).toBeCloseTo(0)
    expect(stand.thighRoll).toBeCloseTo(0)
    expect(applyCalibration(thighRaise.mean, cal).thigh).toBeCloseTo(42) // 前抬為正
  })

  it('正向佩戴:不反相、不對調,僅歸零', () => {
    const baseline = stable(raw(-3, 2))
    const r = buildCalibrationPatch(baseline, stable(raw(42, 2)), stable(raw(-3, -33)), null, SETTINGS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.patch.thighAxisSwap).toBe(false)
    expect(r.patch.thighInvert).toBe(false)
    expect(r.patch.shinInvert).toBe(false)
    const stand = applyCalibration(baseline.mean, { ...SETTINGS, ...r.patch })
    expect(stand.thigh).toBeCloseTo(0)
    expect(stand.shin).toBeCloseTo(0)
  })
})
