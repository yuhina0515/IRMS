// Characterisation of the three existing strategies (A vector path, B, C) on the vector IMU simulator.
// These tests pin what the CURRENT code does, including its known weaknesses, so the unified core can be compared
// against the same scenarios (plan section 5.1 item 3). They are not a statement that the behaviour is right.
import { describe, expect, it } from 'vitest'
import { buildCalibrationPatch, computeCaptureStats } from './calibration'
import { buildCalibrationPatchB } from './calibrationB'
import { MOVEMENTS, solveMovement } from './mobilityC'
import { applyCalibration, DEFAULT_SETTINGS } from '../store/useStore'
import {
  between,
  buildTrajectory,
  createRig,
  kneeCurl,
  simulate,
  thighRaise,
  toWire,
  type Pose,
  type Rig,
  type RigConfig
} from './simulation/imuModel'

const NOISY: Omit<RigConfig, 'seed'> = { accSigmaG: 0.01, accBiasG: 0.03, accScale: 0.02 }

/** Calibrate with flow A from simulated stand / thigh raise / knee curl captures. */
function calibrateA(rig: Rig) {
  const k = kneeCurl(70)
  const t = thighRaise(60)
  const fk = toWire(simulate(k.traj, k.durationSec, rig, { seed: 1 }))
  const ft = toWire(simulate(t.traj, t.durationSec, rig, { seed: 1 }))
  const base = computeCaptureStats(between(fk, ...k.still).map((f) => f.raw))
  const raise = computeCaptureStats(between(ft, ...t.hold).map((f) => f.raw))
  const flex = computeCaptureStats(between(fk, ...k.hold).map((f) => f.raw))
  return buildCalibrationPatch(base, raise, flex, null, DEFAULT_SETTINGS)
}

/** Live knee through the production runtime for a held pose. */
function liveKnee(rig: Rig, settings: typeof DEFAULT_SETTINGS, pose: Partial<Pose>): number {
  const { traj } = buildTrajectory([{ to: pose, moveSec: 0, holdSec: 1 }])
  const frame = toWire(simulate(traj, 1, rig, { seed: 1 }))[2]
  return applyCalibration(frame.raw, settings).knee
}

describe('characterisation: flow A (vector path)', () => {
  it('noise-free: reads the static knee within 0.2 deg for any mounting', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rig = createRig({ seed })
      const r = calibrateA(rig)
      expect(r.ok, `seed ${seed}`).toBe(true)
      if (!r.ok) continue
      const s = { ...DEFAULT_SETTINGS, ...r.patch }
      for (const knee of [0, 30, 60, 90, 120]) {
        expect(Math.abs(liveKnee(rig, s, { kneeFlex: knee }) - knee), `seed ${seed} knee ${knee}`).toBeLessThan(0.2)
      }
    }
  })

  it('always yields proximalInvert=false and distalInvert=true (the legacyB-vs-A discriminator)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = calibrateA(createRig({ seed }))
      if (!r.ok) throw new Error('calibration failed')
      expect(r.patch.proximalInvert).toBe(false)
      expect(r.patch.distalInvert).toBe(true)
    }
  })

  it('noise + bias + scale: static knee within 4 deg', () => {
    let worst = 0
    for (let seed = 1; seed <= 20; seed++) {
      const rig = createRig({ seed, ...NOISY })
      const r = calibrateA(rig)
      if (!r.ok) throw new Error(`seed ${seed}: ${r.error}`)
      const s = { ...DEFAULT_SETTINGS, ...r.patch }
      for (const knee of [0, 30, 60, 90, 120]) worst = Math.max(worst, Math.abs(liveKnee(rig, s, { kneeFlex: knee }) - knee))
    }
    expect(worst).toBeLessThan(4)
  })

  it('compensates thigh motion while the knee is flexed (hinge frame)', () => {
    const rig = createRig({ seed: 3 })
    const r = calibrateA(rig)
    if (!r.ok) throw new Error('calibration failed')
    const s = { ...DEFAULT_SETTINGS, ...r.patch }
    expect(Math.abs(liveKnee(rig, s, { kneeFlex: 60, hipFlex: 20 }) - 60)).toBeLessThan(0.2)
  })

  it('KNOWN WEAKNESS X3: hyperextension reads as positive flexion (absolute difference)', () => {
    const rig = createRig({ seed: 3 })
    const r = calibrateA(rig)
    if (!r.ok) throw new Error('calibration failed')
    const s = { ...DEFAULT_SETTINGS, ...r.patch }
    expect(liveKnee(rig, s, { kneeFlex: -10 })).toBeCloseTo(10, 0)
  })
})

describe('characterisation: flow B', () => {
  function calibrateB(rig: Rig) {
    const k = kneeCurl(80)
    const t = thighRaise(80)
    const fk = simulate(k.traj, k.durationSec, rig, { seed: 1 })
    const ft = simulate(t.traj, t.durationSec, rig, { seed: 1 })
    const seatedTraj = buildTrajectory([{ to: { hipFlex: 90, kneeFlex: 90 }, moveSec: 0, holdSec: 1 }])
    const seated = simulate(seatedTraj.traj, 1, rig, { seed: 1 })[3]
    const stand = between(fk, ...k.still)[3]
    return buildCalibrationPatchB(
      [
        { pose: 'standing', thigh: stand.thighV, shin: stand.shinV },
        { pose: 'seated', thigh: seated.thighV, shin: seated.shinV }
      ],
      [
        { limb: 'thigh', samples: ft.map((f) => f.thighV) },
        { limb: 'shin', samples: fk.map((f) => f.shinV) }
      ]
    )
  }

  it('noise-free: reads the static knee within 0.5 deg even with the thigh at 15 deg', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const rig = createRig({ seed })
      const b = calibrateB(rig)
      expect(b.ok, `seed ${seed}`).toBe(true)
      if (!b.ok) continue
      const s = { ...DEFAULT_SETTINGS, ...b.patch }
      for (const knee of [0, 60, 120]) {
        expect(Math.abs(liveKnee(rig, s, { kneeFlex: knee, hipFlex: 15 }) - knee), `seed ${seed} knee ${knee}`).toBeLessThan(0.5)
      }
    }
  })

  it('stamps both inverts false (A never does)', () => {
    const b = calibrateB(createRig({ seed: 2 }))
    if (!b.ok) throw new Error('B failed')
    expect(b.patch.proximalInvert).toBe(false)
    expect(b.patch.distalInvert).toBe(false)
  })

  it('KNOWN WEAKNESS X3: hyperextension reads as positive flexion', () => {
    const rig = createRig({ seed: 2 })
    const b = calibrateB(rig)
    if (!b.ok) throw new Error('B failed')
    expect(liveKnee(rig, { ...DEFAULT_SETTINGS, ...b.patch }, { kneeFlex: -10 })).toBeCloseTo(10, 0)
  })
})

describe('characterisation: flow C (mobility)', () => {
  const neutralFor = (rig: Rig) => {
    const k = kneeCurl(80)
    const fk = simulate(k.traj, k.durationSec, rig, { seed: 1 })
    const stand = between(fk, ...k.still)[3]
    return { fk, neutral: { thigh: stand.thighV, shin: stand.shinV } }
  }

  it('noise-free knee peak equals the true hold angle when the thigh stays put', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rig = createRig({ seed })
      const { fk, neutral } = neutralFor(rig)
      const out = solveMovement(neutral, { moverSamples: fk.map((f) => f.shinV), referenceSamples: fk.map((f) => f.thighV) }, MOVEMENTS.kneeFlexion)
      expect(out.ok, `seed ${seed}`).toBe(true)
      if (out.ok) expect(Math.abs(out.result.peakDeg - 80)).toBeLessThan(0.5)
    }
  })

  it('KNOWN WEAKNESS W4-7: the knee peak is the shin alone, so 8 deg of thigh drift under-reads the knee by 8 deg', () => {
    const rig = createRig({ seed: 1 })
    const { neutral } = neutralFor(rig)
    const drift = buildTrajectory([
      { to: {}, moveSec: 0, holdSec: 2 },
      { to: { kneeFlex: 60, hipFlex: 8 }, moveSec: 3, holdSec: 2.5 }
    ])
    const f = simulate(drift.traj, drift.durationSec, rig, { seed: 1 })
    const out = solveMovement(neutral, { moverSamples: f.map((x) => x.shinV), referenceSamples: f.map((x) => x.thighV) }, MOVEMENTS.kneeFlexion)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.result.peakDeg).toBeCloseTo(52, 0)
  })

  it('KNOWN WEAKNESS W4-5: the hold window is 10 samples, about 0.4 s at 25 Hz', () => {
    const rig = createRig({ seed: 1 })
    const { neutral } = neutralFor(rig)
    // A 0.5 s hold at the peak only: C accepts it although the UI asks for about 2 s.
    const brief = buildTrajectory([
      { to: {}, moveSec: 0, holdSec: 2 },
      { to: { kneeFlex: 80 }, moveSec: 3, holdSec: 0.5 }
    ])
    const f = simulate(brief.traj, brief.durationSec, rig, { seed: 1 })
    const out = solveMovement(neutral, { moverSamples: f.map((x) => x.shinV), referenceSamples: f.map((x) => x.thighV) }, MOVEMENTS.kneeFlexion)
    expect(out.ok).toBe(true)
  })
})
