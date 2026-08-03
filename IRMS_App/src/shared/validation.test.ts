import { describe, it, expect } from 'vitest'
import {
  HOLD_TIME_BOUND,
  TARGET_ANGLE_BOUND,
  TOLERANCE_BOUND,
  clampHoldTimeMs,
  clampTargetAngle,
  clampTolerance,
  clampTriggerParams
} from './validation'

describe('clampTolerance — 負容錯會讓 zone 退化', () => {
  it('把負值拉回下限', () => {
    expect(clampTolerance(-5)).toBe(TOLERANCE_BOUND.min)
    expect(clampTolerance(0)).toBe(TOLERANCE_BOUND.min)
  })

})

describe('clampHoldTimeMs — 0 會造成 NaN/Infinity', () => {
  it('把 0 與負值拉回下限', () => {
    expect(clampHoldTimeMs(0)).toBe(HOLD_TIME_BOUND.min)
    expect(clampHoldTimeMs(-100)).toBe(HOLD_TIME_BOUND.min)
  })

  it('回傳整數', () => {
    expect(Number.isInteger(clampHoldTimeMs(1500.7))).toBe(true)
  })
})

describe('清空輸入框(NaN)不得變成 0', () => {
  it('回退到 fallback 而非 0', () => {
    // parseFloat('') === NaN;舊寫法 `parseFloat(v) || 0` 會靜默變成 0,
    // 而 0 正是 tolerance / holdTimeMs 最危險的值
    expect(clampTargetAngle(NaN)).toBe(TARGET_ANGLE_BOUND.fallback)
    expect(clampTolerance(NaN)).toBe(TOLERANCE_BOUND.fallback)
    expect(clampHoldTimeMs(NaN)).toBe(HOLD_TIME_BOUND.fallback)
  })

  it('Infinity 同樣回退', () => {
    expect(clampTolerance(Infinity)).toBe(TOLERANCE_BOUND.fallback)
  })
})

describe('clampTriggerParams', () => {
  it('保留非數值欄位', () => {
    const out = clampTriggerParams({
      name: 'x',
      targetAngle: -10,
      tolerance: -1,
      holdTimeMs: 0
    })
    expect(out.name).toBe('x')
    expect(out.targetAngle).toBe(TARGET_ANGLE_BOUND.min)
    expect(out.tolerance).toBe(TOLERANCE_BOUND.min)
    expect(out.holdTimeMs).toBe(HOLD_TIME_BOUND.min)
  })

  it('合法值原封不動通過', () => {
    const input = { targetAngle: 90, tolerance: 10, holdTimeMs: 3000 }
    expect(clampTriggerParams(input)).toEqual(input)
  })
})
