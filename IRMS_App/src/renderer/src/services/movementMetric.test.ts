// movementMetric 單元測試:三種 triggerType 的正規化、膝直前置條件、區間邊界
import { describe, expect, it } from 'vitest'
import type { LiveAngles } from '@shared/protocol'
import {
  computeMetricSample,
  computeMetricZone,
  metricInfo,
  OVER_EXTENSION_MARGIN,
  REST_TOLERANCE,
  type TriggerConfig
} from './movementMetric'

function angles(knee: number, thigh = 0): LiveAngles {
  return {
    knee,
    thigh,
    shin: 0,
    kneeRoll: 0,
    thighRoll: 0,
    shinRoll: 0,
    rawThigh: thigh,
    rawShin: 0,
    rawThighRoll: 0,
    rawShinRoll: 0
  }
}

describe('computeMetricSample', () => {
  it('joint_angle:value = knee,無膝直前置條件', () => {
    const s = computeMetricSample(angles(87, 30), 'joint_angle', 10)
    expect(s.value).toBe(87)
    expect(s.kneeStraightOk).toBe(true)
    expect(s.kneeMax).toBeNull()
  })

  it('segment_elevation:value = thigh,膝直門檻 max(15, tol)', () => {
    const s = computeMetricSample(angles(12, 48), 'segment_elevation', 10)
    expect(s.value).toBe(48)
    expect(s.kneeMax).toBe(15)
    expect(s.kneeStraightOk).toBe(true)
  })

  it('segment_elevation:膝彎過大 → kneeStraightOk = false', () => {
    const s = computeMetricSample(angles(16, 48), 'segment_elevation', 10)
    expect(s.kneeStraightOk).toBe(false)
  })

  it('segment_elevation:tol > 15 時門檻放寬為 tol', () => {
    const s = computeMetricSample(angles(18, 48), 'segment_elevation', 20)
    expect(s.kneeMax).toBe(20)
    expect(s.kneeStraightOk).toBe(true)
  })

  it('segment_extension:value = -thigh(後伸量取正)', () => {
    const s = computeMetricSample(angles(5, -25), 'segment_extension', 8)
    expect(s.value).toBe(25)
  })
})

describe('computeMetricZone', () => {
  const base = { holdTimeMs: 1000 }

  it('joint_angle:min/max = target ∓ tol', () => {
    const z = computeMetricZone({ ...base, targetAngle: 90, tolerance: 10, triggerType: 'joint_angle' } as TriggerConfig)
    expect(z.min).toBe(80)
    expect(z.max).toBe(100)
    expect(z.overLimit).toBe(90 + 10 + OVER_EXTENSION_MARGIN)
    expect(z.rest).toBe(REST_TOLERANCE)
  })

  it('segment 類:min = target,max = Infinity(超標仍計 rep,警報並行)', () => {
    const z = computeMetricZone({ ...base, targetAngle: 45, tolerance: 10, triggerType: 'segment_elevation' } as TriggerConfig)
    expect(z.min).toBe(45)
    expect(z.max).toBe(Infinity)
    expect(z.overLimit).toBe(65)
  })
})

describe('metricInfo', () => {
  it('三種型別對應正確的主指標名稱', () => {
    expect(metricInfo('joint_angle').key).toBe('kneeAngle')
    expect(metricInfo('segment_elevation').key).toBe('thighElevation')
    expect(metricInfo('segment_extension').key).toBe('thighExtension')
  })
})
