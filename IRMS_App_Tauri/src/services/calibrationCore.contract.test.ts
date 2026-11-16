// Contract test shared with the Rust port (IRMS_Core/src/calibration.rs).
//
// fixtures/calibration-core.json records calls of the calibration core on simulated IMU data: the
// arguments (rounded, so both sides read the same numbers) and what this TypeScript returns. The
// Rust test replays every call and compares the results.
//
// To regenerate after an intended change (then mirror it in calibration.rs):
//   IRMS_WRITE_FIXTURES=1 node node_modules/vitest/vitest.mjs run src/services/calibrationCore.contract.test.ts
import { describe, expect, it } from 'vitest'
import storedJson from '../../fixtures/calibration-core.json'
import {
  captureReference,
  checkReference,
  conditionFrames,
  estimateLimbFrame,
  evaluateMovement,
  heldPeakTimed,
  rezeroLimb,
  solveProfile,
  type CalibrationProfile,
  type Frame,
  type LimbFrame,
  type MovementId,
  type Reference,
  type SolveInput,
  type TimedValue
} from './calibrationCore'
import {
  between,
  buildTrajectory,
  createRig,
  kneeCurl,
  mulM,
  rotX,
  rotZ,
  simulate,
  thighRaise,
  type ImuFrame,
  type Rig,
  type Step
} from './simulation/imuModel'

type V = { x: number; y: number; z: number }
interface Call {
  fn: string
  note: string
  args: unknown[]
  out: unknown
}

const NOISY = { accSigmaG: 0.01, accBiasG: 0.03, accScale: 0.02 }
const r = (n: number, digits: number): number => {
  const k = 10 ** digits
  return Math.round(n * k) / k
}
const rv = (v: V, digits = 4): V => ({ x: r(v.x, digits), y: r(v.y, digits), z: r(v.z, digits) })

/** Monitor-style frames: time and the two gravity vectors, rounded. `raw` adds the unnormalised accelerometer. */
function toFrames(fs: ImuFrame[], raw = false): Frame[] {
  return fs.map((f) => {
    const frame: Frame = { tMs: Math.round(f.tMs), thigh: rv(f.thighV), shin: rv(f.shinV) }
    if (raw) {
      frame.thighRawG = rv(f.thighAcc)
      frame.shinRawG = rv(f.shinAcc)
    }
    return frame
  })
}

function sim(rig: Rig, steps: Step[], seed = 1): ImuFrame[] {
  const { traj, durationSec } = buildTrajectory(steps)
  return simulate(traj, durationSec, rig, { seed })
}

function build(): Call[] {
  const calls: Call[] = []
  const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
  const call = <T,>(fn: string, note: string, args: unknown[], run: () => T): T => {
    const out = run()
    calls.push({ fn, note, args: json(args), out: json(out) ?? null })
    return out
  }

  const profiles: { name: string; profile: CalibrationProfile; rig: Rig }[] = []
  const setups: { name: string; seed: number; side: 'left' | 'right'; gyro: boolean; thigh: boolean }[] = [
    { name: 'left leg, gyro, both limbs', seed: 1, side: 'left', gyro: true, thigh: true },
    { name: 'right leg, no gyro, both limbs', seed: 2, side: 'right', gyro: false, thigh: true },
    { name: 'left leg, no gyro, shin only', seed: 3, side: 'left', gyro: false, thigh: false }
  ]
  for (const s of setups) {
    const rig = createRig({ seed: s.seed, side: s.side, ...NOISY })
    const k = kneeCurl(90)
    const t = thighRaise(80)
    const fk = simulate(k.traj, k.durationSec, rig, { seed: 1 })
    const ft = simulate(t.traj, t.durationSec, rig, { seed: 1 })
    const still = toFrames(between(fk, ...k.still), true)
    call('conditionFrames', s.name, [still], () => {
      const c = conditionFrames(still)
      return { kept: c.frames.length, dropped: c.dropped, gated: c.gated }
    })
    const ref = call('captureReference', s.name, [still, 'straight', 'standing'], () => captureReference(still, 'straight', 'standing'))
    if (!ref.ok) throw new Error(`reference failed for ${s.name}: ${ref.error}`)
    const reference = json(ref.reference) as Reference
    const sweep = (fs: ImuFrame[], limb: 'thigh' | 'shin'): { samples: V[]; gyro?: V[] } => {
      const out: { samples: V[]; gyro?: V[] } = { samples: fs.map((f) => rv(limb === 'thigh' ? f.thighV : f.shinV)) }
      if (s.gyro) out.gyro = fs.map((f) => rv(limb === 'thigh' ? f.thighGyro : f.shinGyro, 2))
      return out
    }
    const input: SolveInput = {
      id: `fixture-${s.seed}`,
      createdAt: '2026-11-16T00:00:00.000Z',
      side: s.side,
      firmware: { version: s.gyro ? '1.5.0' : null, rawStream: s.gyro },
      reference,
      shinSweep: sweep(fk, 'shin')
    }
    if (s.thigh) input.thighSweep = sweep(ft, 'thigh')
    const solved = call('solveProfile', s.name, [input], () => solveProfile(input))
    if (!solved.ok) throw new Error(`solve failed for ${s.name}`)
    profiles.push({ name: s.name, profile: json(solved.profile), rig })
  }

  // ----- estimateLimbFrame: the paths and failures a full solve does not reach -----
  {
    const rig = createRig({ seed: 4, ...NOISY })
    const limb = (note: string, kneeDeg: number, opts: { rotateRef?: boolean; take?: number; sign?: 1 | -1 } = {}): void => {
      const k = kneeCurl(kneeDeg)
      const f = simulate(k.traj, k.durationSec, rig, { seed: 1 })
      const refFrames = toFrames(between(f, ...k.still))
      const ref = captureReference(refFrames, 'straight', 'standing')
      if (!ref.ok) throw new Error('reference failed')
      let reference: V = rv(ref.reference.shin)
      if (opts.rotateRef) {
        // Tilt the reference 30 deg about an arbitrary sensor axis so it leaves the sweep plane.
        const m = mulM(rotX(30), rotZ(20))
        reference = rv({
          x: m[0][0] * reference.x + m[0][1] * reference.y + m[0][2] * reference.z,
          y: m[1][0] * reference.x + m[1][1] * reference.y + m[1][2] * reference.z,
          z: m[2][0] * reference.x + m[2][1] * reference.y + m[2][2] * reference.z
        })
      }
      const samples = f.map((x) => rv(x.shinV)).slice(0, opts.take)
      const input = { reference, samples, expectedSign: opts.sign ?? (-1 as const) }
      call('estimateLimbFrame', note, [input], () => estimateLimbFrame(input))
    }
    limb('clean 90 deg sweep', 90)
    limb('22 deg sweep: two-point fallback or too small', 22)
    limb('10 deg sweep: too small', 10)
    limb('two samples: invalid input', 90, { take: 2 })
    limb('reference tilted out of the sweep plane', 90, { rotateRef: true })
    limb('expected sign reversed: axis flips', 90, { sign: 1 })
  }

  // ----- captureReference failures -----
  {
    const rig = createRig({ seed: 5, ...NOISY })
    const k = kneeCurl(90)
    const f = simulate(k.traj, k.durationSec, rig, { seed: 1 })
    const short = toFrames(between(f, 0.2, 0.6))
    call('captureReference', 'too short', [short, 'straight', 'standing'], () => captureReference(short, 'straight', 'standing'))
    const moving = toFrames(between(f, 2.2, 4.6))
    call('captureReference', 'moving while capturing', [moving, 'neutral', 'seated'], () => captureReference(moving, 'neutral', 'seated'))
    call('captureReference', 'no frames', [[], 'straight', 'standing'], () => captureReference([], 'straight', 'standing'))
    // Unnormalised accelerometer far from 1 g: the frames are gated out.
    const shaken = toFrames(between(f, 0.2, 1.9), true).map((fr, i) => (i % 2 ? { ...fr, thighRawG: { x: 0, y: 1.4, z: 0 } } : fr))
    call('conditionFrames', 'every other frame accelerating', [shaken], () => {
      const c = conditionFrames(shaken)
      return { kept: c.frames.length, dropped: c.dropped, gated: c.gated }
    })
    const weak = toFrames(between(f, 0.2, 1.9)).map((fr, i) => (i % 3 === 0 ? { ...fr, shin: { x: 0.1, y: 0.1, z: 0.1 } } : fr))
    call('conditionFrames', 'every third shin vector too short', [weak], () => {
      const c = conditionFrames(weak)
      return { kept: c.frames.length, dropped: c.dropped, gated: c.gated }
    })
  }

  // ----- movements -----
  const full = profiles[0]
  const right = profiles[1]
  const shinOnly = profiles[2]
  const move = (note: string, p: { profile: CalibrationProfile; rig: Rig }, id: MovementId, steps: Step[], raw = false): void => {
    const frames = toFrames(sim(p.rig, steps), raw)
    call('evaluateMovement', note, [p.profile, id, frames], () => evaluateMovement(p.profile, id, frames))
  }
  const hold = (to: Step['to'], holdSec = 2.5): Step[] => [
    { to: {}, moveSec: 0, holdSec: 2 },
    { to, moveSec: 3, holdSec },
    { to: {}, moveSec: 3, holdSec: 1.5 }
  ]
  move('knee flexion 70', full, 'kneeFlexion', hold({ kneeFlex: 70 }), true)
  move('knee flexion 110, right leg', right, 'kneeFlexion', hold({ kneeFlex: 110 }))
  move('knee flexion, shin-only profile', shinOnly, 'kneeFlexion', hold({ kneeFlex: 80 }))
  move('hip flexion 60', full, 'hipFlexion', hold({ hipFlex: 60 }))
  move('hip extension 20', full, 'hipExtension', hold({ hipFlex: -20 }))
  move('hip abduction 30', full, 'hipAbduction', hold({ hipAbd: 30 }))
  move('hip abduction 30, right leg', right, 'hipAbduction', hold({ hipAbd: 30 }))
  move('hip flexion on a shin-only profile', shinOnly, 'hipFlexion', hold({ hipFlex: 60 }))
  move('extension measured as flexion: wrong direction', full, 'hipFlexion', hold({ hipFlex: -25 }))
  move('hold too brief', full, 'kneeFlexion', hold({ kneeFlex: 70 }, 0.4))
  // Never still for 1.5 s: the knee keeps swinging between 20 and 60 deg.
  const swing: Step[] = [{ to: { kneeFlex: 20 }, moveSec: 0, holdSec: 0 }]
  for (let i = 0; i < 8; i++) swing.push({ to: { kneeFlex: i % 2 ? 20 : 60 }, moveSec: 1, holdSec: 0 })
  move('never held still', full, 'kneeFlexion', swing)
  move('movement too small', full, 'kneeFlexion', hold({ kneeFlex: 3 }))
  move('thigh drifts 13 deg during the knee test', full, 'kneeFlexion', hold({ kneeFlex: 70, hipFlex: 13 }))
  move('thigh drifts 28 deg during the knee test', full, 'kneeFlexion', hold({ kneeFlex: 70, hipFlex: 28 }))
  call('evaluateMovement', 'two frames only', [full.profile, 'kneeFlexion', toFrames(sim(full.rig, hold({ kneeFlex: 70 }))).slice(0, 2)], () =>
    evaluateMovement(full.profile, 'kneeFlexion', toFrames(sim(full.rig, hold({ kneeFlex: 70 }))).slice(0, 2))
  )

  // ----- heldPeakTimed on plain series -----
  const series = (values: number[], dtMs = 40): TimedValue[] => values.map((value, i) => ({ tMs: i * dtMs, value }))
  const ramp = [...Array(20).fill(0), ...Array(60).fill(50).map((v, i) => v + (i % 3) * 0.4), ...Array(20).fill(5)]
  const peaks: [string, TimedValue[], 1 | -1][] = [
    ['plateau at 50', series(ramp), 1],
    ['plateau at 50, most negative hold', series(ramp), -1],
    ['slow link, 5 Hz', series(ramp.filter((_, i) => i % 5 === 0), 200), 1],
    ['never still', series(Array.from({ length: 80 }, (_, i) => i * 3)), 1],
    ['two samples', series([1, 2]), 1],
    ['all timestamps equal', series([1, 1, 1, 1, 1], 0), 1],
    ['series ends before a full hold', series(Array(30).fill(10)), 1]
  ]
  for (const [note, samples, direction] of peaks) {
    call('heldPeakTimed', note, [samples, direction], () => heldPeakTimed(samples, direction))
  }

  // ----- re-zero and the pre-session wearing check -----
  const shinFrame = full.profile.limbs.shin as LimbFrame
  const poseVectors = (to: Step['to'], rig: Rig = full.rig): { thigh: V; shin: V } => {
    const f = sim(rig, [{ to, moveSec: 0, holdSec: 1 }])
    const mid = f[Math.floor(f.length / 2)]
    return { thigh: rv(mid.thighV), shin: rv(mid.shinV) }
  }
  const upright = poseVectors({})
  const bent = poseVectors({ kneeFlex: 8 })
  const sideways = poseVectors({ hipAbd: 30 })
  call('rezeroLimb', 'same pose', [shinFrame, upright.shin], () => rezeroLimb(shinFrame, upright.shin))
  call('rezeroLimb', 'knee bent 8 deg', [shinFrame, bent.shin], () => rezeroLimb(shinFrame, bent.shin))
  call('rezeroLimb', 'leg out to the side', [shinFrame, sideways.shin], () => rezeroLimb(shinFrame, sideways.shin))
  call('rezeroLimb', 'zero vector', [shinFrame, { x: 0, y: 0, z: 0 }], () => rezeroLimb(shinFrame, { x: 0, y: 0, z: 0 }))
  for (const [note, p, current] of [
    ['same pose', full, upright],
    ['knee bent 8 deg', full, bent],
    ['leg out to the side', full, sideways],
    ['shin-only profile', shinOnly, poseVectors({}, shinOnly.rig)]
  ] as const) {
    call('checkReference', note, [p.profile, current], () => checkReference(p.profile, current))
  }
  return calls
}

describe('calibrationCore contract fixture (shared with IRMS_Core/src/calibration.rs)', () => {
  const actual = build()

  // This project's tsconfig has no Node types, so the write path reaches Node through names the
  // type checker does not resolve.
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  if (env?.IRMS_WRITE_FIXTURES === '1') {
    it('writes fixtures/calibration-core.json', async () => {
      const fsModule: string = 'node:fs'
      const fs = await import(/* @vite-ignore */ fsModule)
      const target = new URL('../../fixtures/calibration-core.json', import.meta.url)
      fs.writeFileSync(target, JSON.stringify(actual) + String.fromCharCode(10))
    })
    return
  }

  const stored = storedJson as unknown as Call[]

  it('the calibration core reproduces the stored results', () => {
    expect(actual.map((c) => `${c.fn}: ${c.note}`)).toEqual(stored.map((c) => `${c.fn}: ${c.note}`))
    for (let i = 0; i < actual.length; i++) {
      expect(actual[i].out, `${actual[i].fn}: ${actual[i].note}`).toEqual(stored[i].out)
    }
  })

  it('the calls reach every outcome the core can report', () => {
    const outcomes = new Set<string>()
    for (const c of stored) {
      const o = c.out as { ok?: boolean; error?: string; failure?: { error: string }; verdict?: string } | null
      if (o == null) outcomes.add(`${c.fn}:null`)
      else if (o.verdict) outcomes.add(`${c.fn}:${o.verdict}`)
      else if (o.ok === true) outcomes.add(`${c.fn}:ok`)
      else if (o.ok === false) outcomes.add(`${c.fn}:${o.error ?? o.failure?.error}`)
    }
    for (const wanted of [
      'captureReference:ok', 'captureReference:tooShort', 'captureReference:shaking', 'captureReference:invalidInput',
      'solveProfile:ok',
      'estimateLimbFrame:ok', 'estimateLimbFrame:sweepTooSmall', 'estimateLimbFrame:invalidInput', 'estimateLimbFrame:referenceOffPlane',
      'evaluateMovement:ok', 'evaluateMovement:needsThighFrame', 'evaluateMovement:wrongDirection', 'evaluateMovement:noHold',
      'evaluateMovement:peakTooSmall', 'evaluateMovement:referenceMoved', 'evaluateMovement:invalidInput',
      'heldPeakTimed:null',
      'rezeroLimb:ok', 'rezeroLimb:referenceOffPlane',
      'checkReference:ok', 'checkReference:rezero', 'checkReference:recalibrate'
    ]) {
      expect(outcomes, `missing ${wanted}`).toContain(wanted)
    }
  })
})
