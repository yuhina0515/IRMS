// Property tests for the unified calibration core on the vector IMU simulator (plan section 5.1).
import { describe, expect, it } from 'vitest'
import {
  captureReference,
  checkReference,
  compileProfile,
  conditionFrames,
  estimateLimbFrame,
  evaluateMovement,
  heldPeakTimed,
  kneeSigned,
  limbAngles,
  rezeroLimb,
  solveProfile,
  zeroIsUpright,
  type CalibrationProfile,
  type Frame,
  type Side
} from './calibrationCore'
import { vectorAngleDeg } from './angleMath'
import {
  between,
  buildTrajectory,
  createRig,
  kneeCurl,
  simulate,
  thighRaise,
  type ImuFrame,
  type Pose,
  type Rig,
  type RigConfig
} from './simulation/imuModel'

const NOISY: Omit<RigConfig, 'seed'> = { accSigmaG: 0.01, accBiasG: 0.03, accScale: 0.02 }

const toFrames = (fs: ImuFrame[]): Frame[] =>
  fs.map((f) => ({
    tMs: f.tMs,
    thigh: f.thighV,
    shin: f.shinV,
    thighGyro: f.thighGyro,
    shinGyro: f.shinGyro,
    thighRawG: f.thighAcc,
    shinRawG: f.shinAcc
  }))

interface BuildOpts {
  gyro?: boolean
  rateHz?: number
  kneeDeg?: number
  hipDeg?: number
  thigh?: boolean
}

function buildProfile(rig: Rig, opts: BuildOpts = {}): CalibrationProfile {
  const rate = opts.rateHz ?? 25
  const k = kneeCurl(opts.kneeDeg ?? 90)
  const t = thighRaise(opts.hipDeg ?? 80)
  const fk = simulate(k.traj, k.durationSec, rig, { seed: 1, rateHz: rate })
  const ft = simulate(t.traj, t.durationSec, rig, { seed: 1, rateHz: rate })
  const ref = captureReference(toFrames(between(fk, ...k.still)), 'straight', 'standing')
  if (!ref.ok) throw new Error(`reference: ${ref.error}`)
  const out = solveProfile({
    id: 'test',
    createdAt: '2026-10-15T00:00:00.000Z',
    side: rig.side,
    firmware: { version: null, rawStream: !!opts.gyro },
    reference: ref.reference,
    thighSweep: opts.thigh === false ? undefined : { samples: ft.map((f) => f.thighV), gyro: opts.gyro ? ft.map((f) => f.thighGyro) : undefined },
    shinSweep: { samples: fk.map((f) => f.shinV), gyro: opts.gyro ? fk.map((f) => f.shinGyro) : undefined }
  })
  if (!out.ok) throw new Error(`solve: ${out.failure.limb} ${out.failure.error}`)
  return out.profile
}

function heldFrame(rig: Rig, pose: Partial<Pose>): ImuFrame {
  const { traj } = buildTrajectory([{ to: pose, moveSec: 0, holdSec: 1 }])
  return simulate(traj, 1, rig, { seed: 1 })[2]
}

const liveKnee = (p: CalibrationProfile, rig: Rig, pose: Partial<Pose>): number => {
  const f = heldFrame(rig, pose)
  return kneeSigned(p.limbs.thigh, p.limbs.shin, f.thighV, f.shinV)
}

describe('static signed knee', () => {
  it('noise-free: within 2 deg across 0-140 for random mountings, either side, with thigh raised or not', () => {
    for (const side of ['left', 'right'] as Side[]) {
      for (let seed = 1; seed <= 12; seed++) {
        const rig = createRig({ seed, side })
        const p = buildProfile(rig)
        for (const knee of [0, 20, 45, 70, 90, 115, 140]) {
          for (const hip of [0, 25]) {
            const err = Math.abs(liveKnee(p, rig, { kneeFlex: knee, hipFlex: hip }) - knee)
            expect(err, `${side} seed ${seed} knee ${knee} hip ${hip}`).toBeLessThan(2)
          }
        }
      }
    }
  })

  it('noise, bias and scale error: within 4 deg', () => {
    let worst = 0
    for (let seed = 1; seed <= 15; seed++) {
      const rig = createRig({ seed, ...NOISY })
      const p = buildProfile(rig)
      for (const knee of [0, 30, 60, 90, 120, 140]) worst = Math.max(worst, Math.abs(liveKnee(p, rig, { kneeFlex: knee }) - knee))
    }
    expect(worst).toBeLessThan(4)
  })

  it('keeps the sign: hyperextension reads negative (the old code read +10)', () => {
    const rig = createRig({ seed: 3 })
    const p = buildProfile(rig)
    expect(liveKnee(p, rig, { kneeFlex: -10 })).toBeCloseTo(-10, 0)
    expect(liveKnee(p, rig, { kneeFlex: -3 })).toBeLessThan(0)
  })

  it('compensates thigh motion (hip 20 deg, knee 60 deg)', () => {
    const rig = createRig({ seed: 5 })
    const p = buildProfile(rig)
    expect(Math.abs(liveKnee(p, rig, { kneeFlex: 60, hipFlex: 20 }) - 60)).toBeLessThan(1)
  })

  it('works with a gyro-fused profile as well', () => {
    const rig = createRig({ seed: 6, gyroSigmaDps: 0.5 })
    const p = buildProfile(rig, { gyro: true })
    expect(p.limbs.shin.source).toBe('sweepGyro')
    expect(Math.abs(liveKnee(p, rig, { kneeFlex: 100 }) - 100)).toBeLessThan(2)
  })
})

describe('movement evaluation', () => {
  it('knee peak equals the held angle and removes 8 deg of thigh drift (old C read 52)', () => {
    const rig = createRig({ seed: 1 })
    const p = buildProfile(rig)
    const drift = buildTrajectory([
      { to: {}, moveSec: 0, holdSec: 2 },
      { to: { kneeFlex: 60, hipFlex: 8 }, moveSec: 3, holdSec: 2.5 }
    ])
    const f = toFrames(simulate(drift.traj, drift.durationSec, rig, { seed: 1 }))
    const r = evaluateMovement(p, 'kneeFlexion', f)
    expect(r.ok).toBe(true)
    if (r.ok) expect(Math.abs(r.result.peakDeg - 60)).toBeLessThan(1.5)
  })

  it('rejects a sweep that goes the wrong way instead of flipping the sign', () => {
    const rig = createRig({ seed: 2 })
    const p = buildProfile(rig)
    const wrong = buildTrajectory([
      { to: {}, moveSec: 0, holdSec: 2 },
      { to: { kneeFlex: -20 }, moveSec: 3, holdSec: 2.5 }
    ])
    const r = evaluateMovement(p, 'kneeFlexion', toFrames(simulate(wrong.traj, wrong.durationSec, rig, { seed: 1 })))
    expect(r).toEqual({ ok: false, error: 'wrongDirection' })
  })

  it('flags a thigh that moved a lot during the knee movement', () => {
    const rig = createRig({ seed: 2 })
    const p = buildProfile(rig)
    const t = buildTrajectory([
      { to: {}, moveSec: 0, holdSec: 2 },
      { to: { kneeFlex: 60, hipFlex: 14 }, moveSec: 3, holdSec: 2.5 }
    ])
    const r = evaluateMovement(p, 'kneeFlexion', toFrames(simulate(t.traj, t.durationSec, rig, { seed: 1 })))
    expect(r.ok && r.result.warnings).toContain('referenceDrift')
    const t2 = buildTrajectory([
      { to: {}, moveSec: 0, holdSec: 2 },
      { to: { kneeFlex: 60, hipFlex: 30 }, moveSec: 3, holdSec: 2.5 }
    ])
    expect(evaluateMovement(p, 'kneeFlexion', toFrames(simulate(t2.traj, t2.durationSec, rig, { seed: 1 })))).toEqual({
      ok: false,
      error: 'referenceMoved'
    })
  })

  it('a 1.5 s hold works at 12, 20 and 25 Hz (time based, not a fixed count)', () => {
    for (const rateHz of [12, 20, 25]) {
      const rig = createRig({ seed: 4 })
      const p = buildProfile(rig, { rateHz })
      const k = kneeCurl(95)
      const r = evaluateMovement(p, 'kneeFlexion', toFrames(simulate(k.traj, k.durationSec, rig, { seed: 2, rateHz, jitter: 0.2 })))
      expect(r.ok, `${rateHz} Hz`).toBe(true)
      if (r.ok) {
        expect(Math.abs(r.result.peakDeg - 95), `${rateHz} Hz`).toBeLessThan(1.5)
        expect(r.result.holdSec).toBeGreaterThanOrEqual(1.5)
      }
    }
  })

  it('does not accept a 0.5 s touch of the peak as a hold', () => {
    const rig = createRig({ seed: 1 })
    const p = buildProfile(rig)
    const brief = buildTrajectory([
      { to: {}, moveSec: 0, holdSec: 2 },
      { to: { kneeFlex: 80 }, moveSec: 3, holdSec: 0.5 }
    ])
    const r = evaluateMovement(p, 'kneeFlexion', toFrames(simulate(brief.traj, brief.durationSec, rig, { seed: 1 })))
    expect(r.ok).toBe(false)
  })

  it('heldPeakTimed ignores a spike and needs a full window', () => {
    const s = Array.from({ length: 120 }, (_, i) => ({ tMs: i * 40, value: i === 60 ? 120 : 50 }))
    const h = heldPeakTimed(s)
    expect(h && h.peak).toBe(50)
    expect(heldPeakTimed(s.slice(0, 59))).not.toBeNull()
    expect(heldPeakTimed(s.slice(0, 20))).toBeNull() // 0.76 s only
  })

  it('hip abduction is positive outward on both sides', () => {
    for (const side of ['left', 'right'] as Side[]) {
      for (let seed = 1; seed <= 6; seed++) {
        const rig = createRig({ seed, side })
        const p = buildProfile(rig)
        const ab = buildTrajectory([
          { to: {}, moveSec: 0, holdSec: 2 },
          { to: { hipAbd: 30 }, moveSec: 3, holdSec: 2.5 }
        ])
        const r = evaluateMovement(p, 'hipAbduction', toFrames(simulate(ab.traj, ab.durationSec, rig, { seed: 1 })))
        expect(r.ok, `${side} ${seed}`).toBe(true)
        if (r.ok) expect(Math.abs(r.result.peakDeg - 30), `${side} ${seed}`).toBeLessThan(2)
      }
    }
  })

  it('hip flexion and extension take their own sign', () => {
    const rig = createRig({ seed: 9 })
    const p = buildProfile(rig)
    const fl = thighRaise(70)
    const rf = evaluateMovement(p, 'hipFlexion', toFrames(simulate(fl.traj, fl.durationSec, rig, { seed: 1 })))
    expect(rf.ok && Math.abs(rf.result.peakDeg - 70) < 1.5).toBe(true)
    const ex = buildTrajectory([
      { to: {}, moveSec: 0, holdSec: 2 },
      { to: { hipFlex: -20 }, moveSec: 3, holdSec: 2.5 }
    ])
    const re = evaluateMovement(p, 'hipExtension', toFrames(simulate(ex.traj, ex.durationSec, rig, { seed: 1 })))
    expect(re.ok && Math.abs(re.result.peakDeg - 20) < 1.5).toBe(true)
  })

  it('needs a thigh frame for hip movements', () => {
    const rig = createRig({ seed: 1 })
    const p = buildProfile(rig, { thigh: false })
    const fl = thighRaise(70)
    expect(evaluateMovement(p, 'hipFlexion', toFrames(simulate(fl.traj, fl.durationSec, rig, { seed: 1 })))).toEqual({
      ok: false,
      error: 'needsThighFrame'
    })
  })
})

describe('reference and hinge estimation', () => {
  it('rejects a reference more than 15 deg off the hinge plane', () => {
    const rig = createRig({ seed: 2 })
    const p = buildProfile(rig)
    const k = kneeCurl(90)
    const fk = simulate(k.traj, k.durationSec, rig, { seed: 1 })
    const h = p.limbs.shin.hinge
    const a = (25 * Math.PI) / 180
    const ref = { x: p.reference.shin.x * Math.cos(a) + h.x * Math.sin(a), y: p.reference.shin.y * Math.cos(a) + h.y * Math.sin(a), z: p.reference.shin.z * Math.cos(a) + h.z * Math.sin(a) }
    const r = estimateLimbFrame({ reference: ref, samples: fk.map((f) => f.shinV), expectedSign: -1 })
    expect(r).toEqual({ ok: false, error: 'referenceOffPlane' })
  })

  it('orthogonalises a slightly off-plane reference (8 deg)', () => {
    const rig = createRig({ seed: 2 })
    const p = buildProfile(rig)
    const k = kneeCurl(90)
    const fk = simulate(k.traj, k.durationSec, rig, { seed: 1 })
    const h = p.limbs.shin.hinge
    const a = (8 * Math.PI) / 180
    const ref = { x: p.reference.shin.x * Math.cos(a) + h.x * Math.sin(a), y: p.reference.shin.y * Math.cos(a) + h.y * Math.sin(a), z: p.reference.shin.z * Math.cos(a) + h.z * Math.sin(a) }
    const r = estimateLimbFrame({ reference: ref, samples: fk.map((f) => f.shinV), expectedSign: -1 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const z = r.frame.zero
      expect(Math.abs(z.x * r.frame.hinge.x + z.y * r.frame.hinge.y + z.z * r.frame.hinge.z)).toBeLessThan(1e-9)
    }
  })

  it('a short sweep falls back to the two-point axis and reports medium quality', () => {
    const rig = createRig({ seed: 7 })
    const p = buildProfile(rig, { kneeDeg: 22, hipDeg: 22 })
    expect(p.limbs.shin.source).toBe('twoPoint')
    expect(p.quality.level).toBe('medium')
    expect(p.quality.warnings).toContain('twoPoint')
    expect(Math.abs(liveKnee(p, rig, { kneeFlex: 90 }) - 90)).toBeLessThan(2.5)
  })

  it('a sweep under 20 deg is refused', () => {
    const rig = createRig({ seed: 7 })
    expect(() => buildProfile(rig, { kneeDeg: 12 })).toThrow(/sweepTooSmall/)
  })

  it('full sweeps with the gyro stream rate high, without it medium, shin-only never high', () => {
    const rig = createRig({ seed: 8, gyroSigmaDps: 0.3 })
    expect(buildProfile(rig, { gyro: true }).quality.level).toBe('high')
    expect(buildProfile(rig).quality.level).toBe('medium')
    expect(buildProfile(rig, { gyro: true, thigh: false }).quality.level).toBe('medium')
  })

  it('is stable against a reference that is held still for the minimum time only', () => {
    const rig = createRig({ seed: 3 })
    const k = kneeCurl(90)
    const fk = toFrames(simulate(k.traj, k.durationSec, rig, { seed: 1 }))
    expect(captureReference(between(fk, 0.2, 1.0), 'straight', 'standing')).toEqual({ ok: false, error: 'tooShort' })
    expect(captureReference(between(fk, 3, 4.6), 'straight', 'standing')).toEqual({ ok: false, error: 'shaking' })
    expect(captureReference([], 'straight', 'standing')).toEqual({ ok: false, error: 'invalidInput' })
  })

  it('records the neutral kind when the knee cannot straighten', () => {
    const rig = createRig({ seed: 3 })
    const k = kneeCurl(90)
    const fk = toFrames(simulate(k.traj, k.durationSec, rig, { seed: 1 }))
    const r = captureReference(between(fk, 0.2, 1.9), 'neutral', 'standing')
    expect(r.ok && r.reference.kind).toBe('neutral')
  })
})

describe('gyro fusion and linear acceleration', () => {
  it('gates frames whose accelerometer norm is off 1 g when the raw stream exists', () => {
    const rig = createRig({ seed: 1, linearAcceleration: true })
    const fast = buildTrajectory([
      { to: {}, moveSec: 0, holdSec: 1 },
      { to: { kneeFlex: 100 }, moveSec: 0.4, holdSec: 0.5 },
      { to: { kneeFlex: 0 }, moveSec: 0.4, holdSec: 0.5 }
    ])
    const fs = toFrames(simulate(fast.traj, fast.durationSec, rig, { seed: 1 }))
    const c = conditionFrames(fs)
    expect(c.gated).toBeGreaterThan(0)
    expect(c.frames.length + c.gated + c.dropped).toBe(fs.length)
    expect(conditionFrames(fs.map((f) => ({ ...f, thighRawG: undefined, shinRawG: undefined }))).gated).toBe(0)
  })

  it('fast sagittal motion: plane fit and gyro-fused axes both stay within 1 deg (sagittal linear acceleration stays in the plane, so fusion cannot show a gain here)', () => {
    let planeErr = 0
    let fusedErr = 0
    const n = 10
    for (let seed = 1; seed <= n; seed++) {
      const rig = createRig({ seed, linearAcceleration: true, gyroSigmaDps: 0.5 })
      const fast = buildTrajectory([
        { to: {}, moveSec: 0, holdSec: 2 },
        { to: { kneeFlex: 100 }, moveSec: 0.6, holdSec: 1.2 },
        { to: { kneeFlex: 0 }, moveSec: 0.6, holdSec: 1 }
      ])
      const fs = simulate(fast.traj, fast.durationSec, rig, { seed: 1 })
      const ref = captureReference(toFrames(between(fs, 0.2, 1.9)), 'straight', 'standing')
      if (!ref.ok) throw new Error('ref')
      const truth = rig.mountShin.map((row) => row[0]) // segment X axis in the sensor frame = column 0
      const truthV = { x: rig.mountShin[0][0], y: rig.mountShin[1][0], z: rig.mountShin[2][0] }
      void truth
      const angleTo = (a: { x: number; y: number; z: number }) => Math.min(vectorAngleDeg(a, truthV), vectorAngleDeg({ x: -a.x, y: -a.y, z: -a.z }, truthV))
      const plane = estimateLimbFrame({ reference: ref.reference.shin, samples: fs.map((f) => f.shinV), expectedSign: -1 })
      const fused = estimateLimbFrame({ reference: ref.reference.shin, samples: fs.map((f) => f.shinV), gyro: fs.map((f) => f.shinGyro), expectedSign: -1 })
      if (!plane.ok || !fused.ok) throw new Error('estimate')
      planeErr += angleTo(plane.frame.hinge)
      fusedErr += angleTo(fused.frame.hinge)
    }
    console.log(`axis error plane ${(planeErr / n).toFixed(2)} deg, fused ${(fusedErr / n).toFixed(2)} deg`)
    expect(planeErr / n).toBeLessThan(1)
    expect(fusedErr / n).toBeLessThan(1)
  })
})

describe('re-zero and reference check', () => {
  it('quick re-zero keeps zero exactly perpendicular to the hinge (old X1 left it skewed)', () => {
    const rig = createRig({ seed: 4 })
    const p = buildProfile(rig)
    const h = p.limbs.shin.hinge
    const a = (9 * Math.PI) / 180
    const cur = heldFrame(rig, { kneeFlex: 6 }).shinV
    const skew = { x: cur.x * Math.cos(a) + h.x * Math.sin(a), y: cur.y * Math.cos(a) + h.y * Math.sin(a), z: cur.z * Math.cos(a) + h.z * Math.sin(a) }
    const r = rezeroLimb(p.limbs.shin, skew)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const z = r.frame.zero
      expect(Math.abs(z.x * h.x + z.y * h.y + z.z * h.z)).toBeLessThan(1e-9)
      expect(Math.abs(limbAngles(r.frame, skew).pitch)).toBeLessThan(a * (180 / Math.PI) * 0.2)
    }
    expect(rezeroLimb(p.limbs.shin, { x: h.x, y: h.y, z: h.z })).toEqual({ ok: false, error: 'referenceOffPlane' })
  })

  it('pre-session check: same pose is ok, in-plane offset asks for a re-zero, a strap twist asks for recalibration', () => {
    const rig = createRig({ seed: 4 })
    const p = buildProfile(rig)
    const still = heldFrame(rig, {})
    expect(checkReference(p, { thigh: still.thighV, shin: still.shinV }).verdict).toBe('ok')
    const bent = heldFrame(rig, { kneeFlex: 12 })
    expect(checkReference(p, { thigh: bent.thighV, shin: bent.shinV }).verdict).toBe('rezero')
    const h = p.limbs.shin.hinge
    const a = (15 * Math.PI) / 180
    const s = still.shinV
    const twisted = { x: s.x * Math.cos(a) + h.x * Math.sin(a), y: s.y * Math.cos(a) + h.y * Math.sin(a), z: s.z * Math.cos(a) + h.z * Math.sin(a) }
    expect(checkReference(p, { thigh: still.thighV, shin: twisted }).verdict).toBe('recalibrate')
  })
})

describe('compileProfile', () => {
  it('produces unified provenance and forward-positive inverts', () => {
    const rig = createRig({ seed: 1, side: 'right' })
    const p = buildProfile(rig)
    const patch = compileProfile(p)
    expect(patch.calibrationMethod).toBe('unified')
    expect(patch.calibrationId).toBe('test')
    expect(patch.referenceKind).toBe('straight')
    expect(patch.proximalInvert).toBe(false)
    expect(patch.distalInvert).toBe(false)
    expect(patch.distalHingeAxis).toEqual(p.limbs.shin.hinge)
    expect(patch.proximalHingeAxis).toEqual(p.limbs.thigh?.hinge)
  })

  it('a shin-only profile clears the thigh frame', () => {
    const rig = createRig({ seed: 1 })
    const patch = compileProfile(buildProfile(rig, { thigh: false }))
    expect(patch.proximalHingeAxis).toBeNull()
  })
})

describe('zeroIsUpright (segment trigger and pose gating)', () => {
  const frame = { x: 0, y: 0, z: 1 }
  const s = (calibrationMethod: string, referenceKind: string | null, referencePosture: string | null, thighFrame = true) =>
    ({
      calibrationMethod,
      referenceKind,
      referencePosture,
      proximalZeroAccel: thighFrame ? frame : null,
      proximalHingeAxis: thighFrame ? frame : null
    }) as never
  it('is true for a straight standing unified zero and for any legacy calibration', () => {
    expect(zeroIsUpright(s('unified', 'straight', 'standing'))).toBe(true)
    expect(zeroIsUpright(s('unified', 'straight', null))).toBe(true)
    expect(zeroIsUpright(s('legacyAEuler', null, null))).toBe(true)
    expect(zeroIsUpright(s('none', null, null))).toBe(true)
  })
  it('is false for a neutral (cannot fully straighten) zero or a non-standing posture', () => {
    expect(zeroIsUpright(s('unified', 'neutral', 'standing'))).toBe(false)
    expect(zeroIsUpright(s('unified', 'straight', 'longSitting'))).toBe(false)
    expect(zeroIsUpright(s('unified', 'straight', 'supine'))).toBe(false)
  })
  it('is false for a shin-only unified profile: with no thigh frame the thigh reads 0 and segment views are meaningless', () => {
    expect(zeroIsUpright(s('unified', 'straight', 'standing', false))).toBe(false)
    expect(zeroIsUpright(s('legacyAEuler', null, null, false))).toBe(true)
  })
})
