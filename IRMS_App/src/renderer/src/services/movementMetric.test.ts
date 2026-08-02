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
import { clampTolerance } from '@shared/validation'

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

// --- 2026-08-01 會議 F2/F6:zone 不變式 ---
describe('computeMetricZone — rest 不變式', () => {
  it('所有合法參數組合都滿足 rest < min(否則靜止的腿會產生幻影 reps)', () => {
    for (const targetAngle of [10, 20, 35, 45, 90, 170]) {
      for (const tolerance of [1, 8, 10, 30]) {
        for (const triggerType of [
          'joint_angle',
          'segment_extension',
          'segment_elevation'
        ] as const) {
          const zone = computeMetricZone({ targetAngle, tolerance, holdTimeMs: 2000, triggerType })
          expect(zone.rest).toBeLessThan(zone.min)
        }
      }
    }
  })

  it('一般目標角度維持原本的 30° 休息門檻', () => {
    const squat = computeMetricZone({
      targetAngle: 90,
      tolerance: 10,
      holdTimeMs: 3000,
      triggerType: 'joint_angle'
    })
    expect(squat.rest).toBe(REST_TOLERANCE)
  })

  it('低目標動作收緊休息門檻:出貨預設 Backward Extension', () => {
    const ext = computeMetricZone({
      targetAngle: 20,
      tolerance: 8,
      holdTimeMs: 2000,
      triggerType: 'segment_extension'
    })
    expect(ext.min).toBe(20)
    expect(ext.rest).toBe(15) // min(30, 20-5)
  })

  it('鉗制後的容錯保證 joint_angle 的 min < max', () => {
    const zone = computeMetricZone({
      targetAngle: 90,
      tolerance: clampTolerance(-5),
      holdTimeMs: 2000,
      triggerType: 'joint_angle'
    })
    expect(zone.min).toBeLessThan(zone.max)
  })
})
