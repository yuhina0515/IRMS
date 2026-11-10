import { describe, expect, it } from 'vitest'
import { captureReference, type Frame, type Reference } from './calibrationCore'
import {
  flowReducer,
  initialFlow,
  isMandatory,
  isStillWindow,
  mobilityRecordFromResults,
  needsLegacyBranch,
  rezeroProfile,
  presetMovements,
  recaptureNeedsConfirm,
  solveFlow,
  wearingVerdict,
  type FlowAction,
  type FlowState
} from './calibrationFlow'
import { between, createRig, kneeCurl, simulate, thighRaise, type ImuFrame } from './simulation/imuModel'

const toFrames = (fs: ImuFrame[]): Frame[] =>
  fs.map((f) => ({ tMs: f.tMs, thigh: f.thighV, shin: f.shinV, thighGyro: f.thighGyro, shinGyro: f.shinGyro, thighRawG: f.thighAcc, shinRawG: f.shinAcc }))

function sim() {
  const rig = createRig({ seed: 3, side: 'left', accSigmaG: 0.01, accBiasG: 0.03, accScale: 0.02 })
  const k = kneeCurl(90)
  const t = thighRaise(80)
  const fk = simulate(k.traj, k.durationSec, rig, { seed: 1, rateHz: 25 })
  const ft = simulate(t.traj, t.durationSec, rig, { seed: 1, rateHz: 25 })
  const ref = captureReference(toFrames(between(fk, ...k.still)), 'straight', 'standing')
  if (!ref.ok) throw new Error('reference')
  return { rig, fk: toFrames(fk), ft: toFrames(ft), reference: ref.reference as Reference }
}

const run = (s: FlowState, ...actions: FlowAction[]): FlowState => actions.reduce(flowReducer, s)

describe('flow presets and routing', () => {
  it('calibrate = knee + hip flexion, mobility adds hip extension/abduction, quick re-zero has no movements', () => {
    expect(presetMovements('calibrate')).toEqual(['kneeFlexion', 'hipFlexion'])
    expect(presetMovements('mobility')).toEqual(['kneeFlexion', 'hipFlexion', 'hipExtension', 'hipAbduction'])
    expect(presetMovements('quickRezero')).toEqual([])
  })
  it('only the knee sweep is mandatory', () => {
    expect(isMandatory('kneeFlexion')).toBe(true)
    expect(isMandatory('hipFlexion')).toBe(false)
  })
  it('legacy branch for Euler firmware or a truncated link only', () => {
    expect(needsLegacyBranch('euler', false)).toBe(true)
    expect(needsLegacyBranch('vector', true)).toBe(true)
    expect(needsLegacyBranch('vector', false)).toBe(false)
    expect(needsLegacyBranch(null, false)).toBe(false)
  })
})

describe('flow reducer', () => {
  it('cannot start without a side, and goes to legacy when asked', () => {
    expect(flowReducer(initialFlow('calibrate', null), { type: 'start', legacy: false }).step.kind).toBe('prepare')
    const s = run(initialFlow('calibrate', null), { type: 'setSide', side: 'left' }, { type: 'start', legacy: true })
    expect(s.step.kind).toBe('legacy')
  })
  it('walks reference -> movements -> review and skips only optional movements', () => {
    const { reference, fk } = sim()
    let s = run(initialFlow('mobility', 'left'), { type: 'start', legacy: false }, { type: 'referenceCaptured', reference })
    expect(s.step).toEqual({ kind: 'movement', index: 0 })
    // the mandatory knee sweep cannot be skipped
    expect(flowReducer(s, { type: 'skip', id: 'kneeFlexion' })).toBe(s)
    s = run(s, { type: 'movementCaptured', id: 'kneeFlexion', frames: fk })
    expect(s.step).toEqual({ kind: 'movement', index: 1 })
    s = run(s, { type: 'skip', id: 'hipFlexion' }, { type: 'skip', id: 'hipExtension' }, { type: 'skip', id: 'hipAbduction' })
    expect(s.step.kind).toBe('review')
    expect(s.skipped).toEqual(['hipFlexion', 'hipExtension', 'hipAbduction'])
  })
  it('ignores an out-of-order capture', () => {
    const { reference, fk } = sim()
    const s = run(initialFlow('calibrate', 'left'), { type: 'start', legacy: false }, { type: 'referenceCaptured', reference })
    expect(flowReducer(s, { type: 'movementCaptured', id: 'hipFlexion', frames: fk })).toBe(s)
  })
  it('quick re-zero goes straight from reference to review', () => {
    const { reference } = sim()
    const s = run(initialFlow('quickRezero', 'right'), { type: 'start', legacy: false }, { type: 'referenceCaptured', reference })
    expect(s.step.kind).toBe('review')
  })
  it('re-capturing the reference clears every movement, and asks first only when there is something to lose', () => {
    const { reference, fk } = sim()
    let s = run(initialFlow('calibrate', 'left'), { type: 'start', legacy: false }, { type: 'referenceCaptured', reference })
    expect(recaptureNeedsConfirm(s)).toBe(false)
    s = run(s, { type: 'movementCaptured', id: 'kneeFlexion', frames: fk })
    expect(recaptureNeedsConfirm(s)).toBe(true)
    s = run(s, { type: 'recaptureReference' })
    expect(s.step.kind).toBe('reference')
    expect(s.reference).toBeNull()
    expect(s.captured).toEqual({})
    expect(s.skipped).toEqual([])
  })
  it('the preset can change only while preparing', () => {
    const s = flowReducer(initialFlow('calibrate', 'left'), { type: 'setPreset', preset: 'mobility' })
    expect(s.preset).toBe('mobility')
    const started = flowReducer(s, { type: 'start', legacy: false })
    expect(flowReducer(started, { type: 'setPreset', preset: 'calibrate' }).preset).toBe('mobility')
  })
  it('side and neutral flag are locked once the flow has started', () => {
    const s = run(initialFlow('calibrate', 'left'), { type: 'setNeutral', neutral: true }, { type: 'start', legacy: false })
    expect(s.neutral).toBe(true)
    expect(flowReducer(s, { type: 'setSide', side: 'right' }).side).toBe('left')
    expect(flowReducer(s, { type: 'setNeutral', neutral: false }).neutral).toBe(true)
  })
})

describe('solveFlow', () => {
  const ctx = { id: 'cal-1', createdAt: '2026-10-15T00:00:00.000Z', firmware: { version: null, rawStream: true } }

  it('solves a two-limb profile and evaluates both captured movements', () => {
    const { reference, fk, ft } = sim()
    const s = run(
      initialFlow('calibrate', 'left'),
      { type: 'start', legacy: false },
      { type: 'referenceCaptured', reference },
      { type: 'movementCaptured', id: 'kneeFlexion', frames: fk },
      { type: 'movementCaptured', id: 'hipFlexion', frames: ft }
    )
    expect(s.step.kind).toBe('review')
    const out = solveFlow(s, ctx)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.outcome.profile.limbs.thigh).not.toBeNull()
    expect(out.outcome.failed).toEqual([])
    const knee = out.outcome.results.find((r) => r.movement === 'kneeFlexion')
    expect(knee?.peakDeg).toBeGreaterThan(80)
    expect(knee?.peakDeg).toBeLessThan(100)
  })

  it('a skipped hip sweep gives a shin-only profile', () => {
    const { reference, fk } = sim()
    const s = run(
      initialFlow('calibrate', 'left'),
      { type: 'start', legacy: false },
      { type: 'referenceCaptured', reference },
      { type: 'movementCaptured', id: 'kneeFlexion', frames: fk },
      { type: 'skip', id: 'hipFlexion' }
    )
    const out = solveFlow(s, ctx)
    expect(out.ok && out.outcome.profile.limbs.thigh).toBeNull()
  })

  it('refuses to solve without the knee sweep, the reference or the side', () => {
    expect(solveFlow(initialFlow('calibrate', 'left'), ctx)).toEqual({ ok: false, failure: { kind: 'missing', what: 'reference' } })
    const { reference } = sim()
    const noSide = { ...initialFlow('calibrate', null), reference }
    expect(solveFlow(noSide, ctx)).toEqual({ ok: false, failure: { kind: 'missing', what: 'side' } })
    const noKnee = { ...initialFlow('calibrate', 'left'), reference }
    expect(solveFlow(noKnee, ctx)).toEqual({ ok: false, failure: { kind: 'missing', what: 'kneeFlexion' } })
  })

  it('reports a rejected sweep instead of throwing', () => {
    const { reference, fk } = sim()
    const still = fk.slice(0, 20)
    const s: FlowState = { ...initialFlow('calibrate', 'left'), reference, captured: { kneeFlexion: still } }
    const out = solveFlow(s, ctx)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.failure.kind).toBe('solve')
  })
})

describe('rezeroProfile', () => {
  it('keeps hinge axes and kind/posture, replaces id and reference, refuses an off-plane pose', () => {
    const { reference, fk } = sim()
    const s = run(
      initialFlow('calibrate', 'left'),
      { type: 'start', legacy: false },
      { type: 'referenceCaptured', reference },
      { type: 'movementCaptured', id: 'kneeFlexion', frames: fk },
      { type: 'skip', id: 'hipFlexion' }
    )
    const solved = solveFlow(s, { id: 'a', createdAt: 't0', firmware: { version: null, rawStream: false } })
    if (!solved.ok) throw new Error('solve')
    const p = solved.outcome.profile
    const ok = rezeroProfile(p, { ...reference, kind: 'neutral', posture: 'seated' }, { id: 'b', createdAt: 't1' })
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.profile.id).toBe('b')
    expect(ok.profile.limbs.shin.hinge).toEqual(p.limbs.shin.hinge)
    expect(ok.profile.reference.kind).toBe(p.reference.kind)
    expect(ok.profile.reference.posture).toBe(p.reference.posture)
    const h = p.limbs.shin.hinge
    const bad = rezeroProfile(p, { ...reference, shin: { x: h.x, y: h.y, z: h.z } }, { id: 'c', createdAt: 't2' })
    expect(bad).toEqual({ ok: false, limb: 'shin', error: 'referenceOffPlane' })
  })
})

describe('wearing check and stillness', () => {
  it('reports ok for the reference pose itself and null without data', () => {
    const { reference, fk } = sim()
    const s = run(
      initialFlow('calibrate', 'left'),
      { type: 'start', legacy: false },
      { type: 'referenceCaptured', reference },
      { type: 'movementCaptured', id: 'kneeFlexion', frames: fk }
    )
    const out = solveFlow(s, { id: 'x', createdAt: 't', firmware: { version: null, rawStream: false } })
    if (!out.ok) throw new Error('solve')
    expect(wearingVerdict(out.outcome.profile, { thigh: reference.thigh, shin: reference.shin })?.verdict).toBe('ok')
    expect(wearingVerdict(null, { thigh: reference.thigh, shin: reference.shin })).toBeNull()
    expect(wearingVerdict(out.outcome.profile, null)).toBeNull()
  })
  it('isStillWindow needs two samples within the spread', () => {
    const v = { x: 0, y: 0, z: 1 }
    const tilt = { x: Math.sin(0.2), y: 0, z: Math.cos(0.2) }
    expect(isStillWindow([{ thigh: v, shin: v }], 3)).toBe(false)
    expect(isStillWindow([{ thigh: v, shin: v }, { thigh: v, shin: v }], 3)).toBe(true)
    expect(isStillWindow([{ thigh: v, shin: v }, { thigh: tilt, shin: v }], 3)).toBe(false)
  })
})

describe('mobilityRecordFromResults', () => {
  const r = (movement: 'kneeFlexion' | 'hipFlexion', peakDeg: number) => ({ movement, peakDeg, holdSec: 2, spreadDeg: 1, instantMaxDeg: peakDeg, warnings: [] as 'referenceDrift'[] })
  const id = { schema: 2, side: 'left' as const, referenceKind: 'straight' as const, posture: 'standing', calibrationId: 'c' }
  it('sums held peaks and carries the identity; refuses empty or duplicated sets', () => {
    const rec = mobilityRecordFromResults([r('kneeFlexion', 100), r('hipFlexion', 80)], 't', id)
    expect(rec?.totalDeg).toBe(180)
    expect(rec?.movementSet).toEqual(['hipFlexion', 'kneeFlexion'])
    expect(rec?.schema).toBe(2)
    expect(mobilityRecordFromResults([], 't', id)).toBeNull()
    expect(mobilityRecordFromResults([r('kneeFlexion', 1), r('kneeFlexion', 2)], 't', id)).toBeNull()
  })
})
