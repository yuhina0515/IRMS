// guidance 單元測試:各 kind 的觸發條件、優先序、文字組裝
import { describe, expect, it } from 'vitest'
import { computeGuidance, guidanceText } from './guidance'
import { computeMetricZone, metricInfo, type MetricSample, type TriggerConfig } from './movementMetric'

const JOINT: TriggerConfig = { targetAngle: 90, tolerance: 10, holdTimeMs: 3000, triggerType: 'joint_angle' }
const ELEV: TriggerConfig = { targetAngle: 45, tolerance: 10, holdTimeMs: 3000, triggerType: 'segment_elevation' }

const sample = (value: number, over: Partial<MetricSample> = {}): MetricSample => ({
  value,
  knee: value,
  kneeMax: null,
  kneeStraightOk: true,
  ...over
})

describe('computeGuidance', () => {
  it('無資料 → noData', () => {
    expect(computeGuidance(null, computeMetricZone(JOINT), 'idle', 0, 3000).kind).toBe('noData')
  })

  it('超限優先於一切 phase', () => {
    const g = computeGuidance(sample(120), computeMetricZone(JOINT), 'holding', 50, 3000)
    expect(g).toEqual({ kind: 'overLimit', excessDeg: 10 })
  })

  it('idle + 未達下限 → raise(差值正確)', () => {
    const g = computeGuidance(sample(62), computeMetricZone(JOINT), 'idle', 0, 3000)
    expect(g).toEqual({ kind: 'raise', deltaDeg: 18 })
  })

  it('idle + joint_angle 過頭未超限 → lower', () => {
    const g = computeGuidance(sample(105), computeMetricZone(JOINT), 'idle', 0, 3000)
    expect(g).toEqual({ kind: 'lower', deltaDeg: 5 })
  })

  it('segment 類膝未打直 → straightenKnee 優先於 raise', () => {
    const s = sample(30, { knee: 22, kneeMax: 15, kneeStraightOk: false })
    const g = computeGuidance(s, computeMetricZone(ELEV), 'idle', 0, 3000)
    expect(g).toEqual({ kind: 'straightenKnee', excessDeg: 7 })
  })

  it('holding → hold 含秒數換算', () => {
    const g = computeGuidance(sample(90), computeMetricZone(JOINT), 'holding', 60, 3000)
    expect(g.kind).toBe('hold')
    if (g.kind === 'hold') {
      expect(g.heldSec).toBeCloseTo(1.8)
      expect(g.totalSec).toBe(3)
    }
  })

  it('restPending → returnToRest 含剩餘回位量', () => {
    const g = computeGuidance(sample(50), computeMetricZone(JOINT), 'restPending', 100, 3000)
    expect(g).toEqual({ kind: 'returnToRest', deltaDeg: 20 })
  })
})

describe('guidanceText', () => {
  it('依 metric 語意選動詞(膝夾角=彎曲,大腿仰角=抬高)', () => {
    expect(guidanceText({ kind: 'raise', deltaDeg: 12 }, metricInfo('joint_angle'))).toBe('再彎曲 12.0°')
    expect(guidanceText({ kind: 'raise', deltaDeg: 12 }, metricInfo('segment_elevation'))).toBe('再抬高 12.0°')
    expect(guidanceText({ kind: 'raise', deltaDeg: 12 }, metricInfo('segment_extension'))).toBe('再後伸 12.0°')
  })

  it('hold 與 overLimit 文案', () => {
    expect(guidanceText({ kind: 'hold', heldSec: 1.8, totalSec: 3 }, metricInfo('joint_angle'))).toBe('保持!1.8s / 3.0s')
    expect(guidanceText({ kind: 'overLimit', excessDeg: 4.26 }, metricInfo('joint_angle'))).toBe('⚠ 超限 4.3°,請立即回落')
  })
})
