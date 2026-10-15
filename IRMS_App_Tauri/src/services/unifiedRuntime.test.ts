// Runtime behaviour of the unified calibration (stage S4): signed knee, hyperextension safety path, live share.
import { describe, expect, it } from 'vitest'
import type { LiveAngles } from '@shared/protocol'
import { applyCalibration, DEFAULT_SETTINGS } from '../store/useStore'
import { buildCalibrationPatch, computeCaptureStats } from './calibration'
import { captureReference, compileProfile, solveProfile, type CalibrationProfile } from './calibrationCore'
import { computeGuidance, guidanceText } from './guidance'
import {
  HYPEREXTENSION_TOLERANCE_DEG,
  computeMetricSample,
  computeMetricZone,
  metricInfo,
  type TriggerConfig
} from './movementMetric'
import { TriggerEngine } from './triggerEngine'
import { buildSnapshot } from './liveShareHost'
import { useStore } from '../store/useStore'
import {
  between,
  buildTrajectory,
  createRig,
  kneeCurl,
  simulate,
  thighRaise,
  toWire,
  type Pose,
  type Rig
} from './simulation/imuModel'

function unifiedSettings(rig: Rig, thigh = true): typeof DEFAULT_SETTINGS {
  const k = kneeCurl(90)
  const t = thighRaise(80)
  const fk = simulate(k.traj, k.durationSec, rig, { seed: 1 })
  const ft = simulate(t.traj, t.durationSec, rig, { seed: 1 })
  const ref = captureReference(
    between(fk, ...k.still).map((f) => ({ tMs: f.tMs, thigh: f.thighV, shin: f.shinV })),
    'straight',
    'standing'
  )
  if (!ref.ok) throw new Error(ref.error)
  const out = solveProfile({
    id: 'rt',
    createdAt: '2026-10-15T00:00:00.000Z',
    side: rig.side,
    firmware: { version: null, rawStream: false },
    reference: ref.reference,
    thighSweep: thigh ? { samples: ft.map((f) => f.thighV) } : undefined,
    shinSweep: { samples: fk.map((f) => f.shinV) }
  })
  if (!out.ok) throw new Error(out.failure.error)
  const profile: CalibrationProfile = out.profile
  return { ...DEFAULT_SETTINGS, ...compileProfile(profile) }
}

function live(rig: Rig, s: typeof DEFAULT_SETTINGS, pose: Partial<Pose>): LiveAngles {
  const { traj } = buildTrajectory([{ to: pose, moveSec: 0, holdSec: 1 }])
  return applyCalibration(toWire(simulate(traj, 1, rig, { seed: 1 }))[2].raw, s)
}

describe('applyCalibration with method unified', () => {
  it('reads the signed knee and keeps hyperextension negative', () => {
    const rig = createRig({ seed: 3 })
    const s = unifiedSettings(rig)
    expect(live(rig, s, { kneeFlex: 80 }).knee).toBeCloseTo(80, 0)
    expect(live(rig, s, { kneeFlex: 0 }).knee).toBeCloseTo(0, 0)
    expect(live(rig, s, { kneeFlex: -12 }).knee).toBeCloseTo(-12, 0)
    expect(live(rig, s, { kneeFlex: 60, hipFlex: 25 }).knee).toBeCloseTo(60, 0)
  })

  it('without a thigh frame the knee is the negated shin angle and the thigh reads 0', () => {
    const rig = createRig({ seed: 3 })
    const s = unifiedSettings(rig, false)
    const a = live(rig, s, { kneeFlex: 70 })
    expect(a.thigh).toBe(0)
    expect(a.knee).toBeCloseTo(70, 0)
  })

  it('legacy flow A still folds hyperextension to a positive angle (unchanged)', () => {
    const rig = createRig({ seed: 3 })
    const k = kneeCurl(70)
    const t = thighRaise(60)
    const fk = toWire(simulate(k.traj, k.durationSec, rig, { seed: 1 }))
    const ft = toWire(simulate(t.traj, t.durationSec, rig, { seed: 1 }))
    const r = buildCalibrationPatch(
      computeCaptureStats(between(fk, ...k.still).map((f) => f.raw)),
      computeCaptureStats(between(ft, ...t.hold).map((f) => f.raw)),
      computeCaptureStats(between(fk, ...k.hold).map((f) => f.raw)),
      null,
      DEFAULT_SETTINGS
    )
    if (!r.ok) throw new Error('A failed')
    expect(live(rig, { ...DEFAULT_SETTINGS, ...r.patch }, { kneeFlex: -10 }).knee).toBeGreaterThan(8)
  })
})

describe('hyperextension safety path', () => {
  const JOINT: TriggerConfig = { targetAngle: 90, tolerance: 10, holdTimeMs: 1000, triggerType: 'joint_angle' }
  const anglesOf = (knee: number): LiveAngles => ({
    knee, thigh: 0, shin: 0, kneeRoll: 0, thighRoll: 0, shinRoll: 0, rawThigh: 0, rawShin: 0, rawThighRoll: 0, rawShinRoll: 0
  })

  it('flags only below the tolerance, never for legacy non-negative knees', () => {
    expect(computeMetricSample(anglesOf(-(HYPEREXTENSION_TOLERANCE_DEG - 0.5)), 'joint_angle', 10).hyperextended).toBe(false)
    expect(computeMetricSample(anglesOf(-(HYPEREXTENSION_TOLERANCE_DEG + 0.5)), 'joint_angle', 10).hyperextended).toBe(true)
    expect(computeMetricSample(anglesOf(0), 'joint_angle', 10).hyperextended).toBe(false)
    expect(computeMetricSample(anglesOf(120), 'segment_elevation', 10).hyperextended).toBe(false)
  })

  it('raises the alarm and hyperextension events without any measured limit, and clears on recovery', () => {
    const alarms: boolean[] = []
    const hyper: boolean[] = []
    const engine = new TriggerEngine(
      {
        onZoneEnter: () => {}, onZoneExit: () => {}, onHoldProgress: () => {}, onRepCompleted: () => {}, onRestCompleted: () => {},
        onOverExtension: (a) => alarms.push(a),
        onHyperextension: (a) => hyper.push(a)
      },
      () => 0
    )
    const feed = (knee: number): void =>
      engine.handle({ sample: computeMetricSample(anglesOf(knee), 'joint_angle', 10), zone: computeMetricZone(JOINT), holdTimeMs: 1000 })
    feed(-2)
    feed(-9)
    feed(-9)
    feed(2)
    expect(alarms).toEqual([true, false])
    expect(hyper).toEqual([true, false])
    feed(-9)
    engine.reset()
    expect(alarms).toEqual([true, false, true, false])
    expect(hyper).toEqual([true, false, true, false])
  })

  it('guidance puts hyperextension first, with owner-reviewable wording in both languages', () => {
    const sample = computeMetricSample(anglesOf(-8), 'joint_angle', 10)
    const g = computeGuidance(sample, computeMetricZone(JOINT), 'holding', 50, 1000, { comfort: 100, limit: 110 })
    expect(g).toEqual({ kind: 'hyperextension', deg: 8 })
    expect(guidanceText(g, metricInfo('joint_angle'), 'zh-Hant')).toBe('⚠ 膝蓋過度伸直 8.0°,請放鬆,不要向後頂')
    expect(guidanceText(g, metricInfo('joint_angle'), 'en')).toBe('⚠ Knee hyperextended 8.0°. Relax it, do not push backward')
  })
})

describe('live share', () => {
  it('keeps knee >= 0 for older consumers and adds kneeSigned', () => {
    const base = { thigh: 0, shin: 0, kneeRoll: 0, thighRoll: 0, shinRoll: 0, rawThigh: 0, rawShin: 0, rawThighRoll: 0, rawShinRoll: 0 }
    useStore.setState({ angles: { ...base, knee: -7.46 } })
    expect(buildSnapshot().angles).toMatchObject({ knee: 0, kneeSigned: -7.5 })
    useStore.setState({ angles: { ...base, knee: 42.04 } })
    expect(buildSnapshot().angles).toMatchObject({ knee: 42, kneeSigned: 42 })
  })
})
