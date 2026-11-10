import { describe, expect, it } from 'vitest'
import { vectorAngleDeg } from '../angleMath'
import {
  between,
  buildTrajectory,
  createRig,
  kneeCurl,
  legRotations,
  mulV,
  randomRotation,
  rng,
  simulate,
  STAND,
  thighRaise,
  toWire,
  transpose,
  type Mat3
} from './imuModel'

const I3: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

describe('imuModel', () => {
  it('a resting sensor reads +1 g along world up, in the mounting frame', () => {
    const mount = randomRotation(rng(5))
    const rig = createRig({ seed: 1, mountThigh: mount, mountShin: mount })
    const { traj } = buildTrajectory([{ to: {}, moveSec: 0, holdSec: 1 }])
    const frames = simulate(traj, 1, rig, { seed: 1 })
    const want = mulV(mount, { x: 0, y: 1, z: 0 })
    for (const f of frames) {
      expect(Math.hypot(f.thighAcc.x, f.thighAcc.y, f.thighAcc.z)).toBeCloseTo(1, 6)
      expect(vectorAngleDeg(f.thighV, want)).toBeLessThan(1e-3)
    }
  })

  it('matches the calibrationB priors: hip flexion lifts +z, knee flexion tips the shin front down', () => {
    const rig = createRig({ seed: 2, mountThigh: I3, mountShin: I3 })
    const flexed = legRotations({ ...STAND, hipFlex: 40 }, 'left')
    const thighUp = mulV(transpose(flexed.thigh), { x: 0, y: 1, z: 0 })
    expect(thighUp.z).toBeGreaterThan(0.6)
    const curled = legRotations({ ...STAND, kneeFlex: 40 }, 'left')
    const shinUp = mulV(transpose(curled.shin), { x: 0, y: 1, z: 0 })
    expect(shinUp.z).toBeLessThan(-0.6)
    expect(rig.side).toBe('left')
  })

  it('left and right legs abduct to opposite world directions', () => {
    const l = legRotations({ ...STAND, hipAbd: 30 }, 'left').thigh
    const r = legRotations({ ...STAND, hipAbd: 30 }, 'right').thigh
    const down = { x: 0, y: -1, z: 0 }
    expect(mulV(l, down).x).toBeGreaterThan(0.4)
    expect(mulV(r, down).x).toBeLessThan(-0.4)
  })

  it('is deterministic for a given seed and differs across seeds', () => {
    const { traj, durationSec } = kneeCurl(70)
    const cfg = { seed: 9, accSigmaG: 0.01, accBiasG: 0.03, accScale: 0.02, gyroSigmaDps: 0.3, linearAcceleration: true }
    const a = simulate(traj, durationSec, createRig(cfg), { seed: 1 })
    const b = simulate(traj, durationSec, createRig(cfg), { seed: 1 })
    const c = simulate(traj, durationSec, createRig({ ...cfg, seed: 10 }), { seed: 1 })
    expect(a).toEqual(b)
    expect(a[10].thighV).not.toEqual(c[10].thighV)
  })

  it('samples at the requested rate, with jitter and drops', () => {
    const { traj, durationSec } = thighRaise(60)
    const rig = createRig({ seed: 3 })
    const nominal = simulate(traj, durationSec, rig, { seed: 1, rateHz: 25 })
    expect(nominal.length).toBeGreaterThan(durationSec * 25 - 3)
    expect(nominal.length).toBeLessThan(durationSec * 25 + 3)
    const mobile = simulate(traj, durationSec, rig, { seed: 1, rateHz: 15, jitter: 0.3, dropProb: 0.1 })
    expect(mobile.length).toBeLessThan(nominal.length * 0.75)
  })

  it('linear acceleration only appears while the leg moves', () => {
    const { traj, durationSec, hold } = kneeCurl(90)
    const rig = createRig({ seed: 4, linearAcceleration: true })
    const frames = simulate(traj, durationSec, rig, { seed: 1 })
    const still = between(frames, hold[0], hold[1])
    for (const f of still) expect(Math.abs(Math.hypot(f.shinAcc.x, f.shinAcc.y, f.shinAcc.z) - 1)).toBeLessThan(0.01)
    const moving = between(frames, 2.5, 4.5)
    const peak = Math.max(...moving.map((f) => Math.abs(Math.hypot(f.shinAcc.x, f.shinAcc.y, f.shinAcc.z) - 1)))
    expect(peak).toBeGreaterThan(0.005)
  })

  it('gyro magnitude matches the hinge rate and lies on a single axis', () => {
    const { traj, durationSec } = buildTrajectory([
      { to: {}, moveSec: 0, holdSec: 1 },
      { to: { kneeFlex: 90 }, moveSec: 3, holdSec: 1 }
    ])
    const rig = createRig({ seed: 6 })
    const frames = simulate(traj, durationSec, rig, { seed: 1 })
    const mid = frames.filter((f) => f.tMs > 2400 && f.tMs < 2600)
    // smoothstep peak speed is 1.5 * 90 / 3 = 45 deg/s
    const speeds = mid.map((f) => Math.hypot(f.shinGyro.x, f.shinGyro.y, f.shinGyro.z))
    expect(Math.max(...speeds)).toBeGreaterThan(40)
    expect(Math.max(...speeds)).toBeLessThan(50)
    // thigh does not move
    expect(Math.max(...mid.map((f) => Math.hypot(f.thighGyro.x, f.thighGyro.y, f.thighGyro.z)))).toBeLessThan(1e-6)
  })

  it('round-trips through the real packet parsers', () => {
    const { traj, durationSec } = kneeCurl(60)
    const frames = simulate(traj, durationSec, createRig({ seed: 7, accSigmaG: 0.01 }), { seed: 1 })
    const wire = toWire(frames)
    expect(wire).toHaveLength(frames.length)
    for (let i = 0; i < frames.length; i++) {
      expect(vectorAngleDeg(wire[i].raw.shinAccel!, frames[i].shinV)).toBeLessThan(0.1)
      expect(wire[i].motion.thighAcc.x).toBeCloseTo(frames[i].thighAcc.x, 3)
    }
  })
})
