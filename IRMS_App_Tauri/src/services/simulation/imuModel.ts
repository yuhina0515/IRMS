// Vector IMU simulator for the calibration tests (unified-calibration plan, stage S2).
//
// Pure and seeded: the same config and trajectory always produce the same frames. It models a two-segment leg
// (hip flexion/extension, hip abduction, knee flexion incl. hyperextension), arbitrary SO(3) sensor mountings, and
// the error sources that matter for calibration: accelerometer noise, bias and scale, linear acceleration of the
// sensor position along the trajectory, gyro noise, jittered/dropped frames. The wire-format helpers below feed the
// real packet parser so the encode/parse path is in the loop.
//
// World frame (matches the segment frame used by calibrationB's pose priors for the LEFT leg):
//   X = patient left, Y = up, Z = anterior (right-handed: X x Y = Z).
// At standing each segment frame equals the world frame. A reading is the specific force in the sensor frame, so a
// resting sensor reads +1 g along world "up". Nothing here is validated against hardware; it is a model.

import type { RawAngles, RawMotion, AccelVector } from '@shared/protocol'
import { parseAnglePacket, parseRawPacket } from '@shared/protocol'
import { encodeAnglePacketWithAccel, encodeRawMotionPacket } from './encode'

export type V3 = AccelVector
export type Mat3 = number[][]
export type Side = 'left' | 'right'
export type Limb = 'thigh' | 'shin'

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const G = 9.80665

// ---------- seeded randomness and linear algebra ----------

export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}
export const gauss = (r: () => number): number => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r())

export const mulV = (m: Mat3, v: V3): V3 => ({
  x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
  y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
  z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z
})
export const mulM = (a: Mat3, b: Mat3): Mat3 => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]))
export const transpose = (m: Mat3): Mat3 => m[0].map((_, j) => m.map((row) => row[j]))
const norm = (v: V3): number => Math.hypot(v.x, v.y, v.z)
const unit = (v: V3): V3 => {
  const n = norm(v) || 1
  return { x: v.x / n, y: v.y / n, z: v.z / n }
}
const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const scale = (v: V3, k: number): V3 => ({ x: v.x * k, y: v.y * k, z: v.z * k })

export const rotX = (deg: number): Mat3 => {
  const c = Math.cos(deg * RAD)
  const s = Math.sin(deg * RAD)
  return [[1, 0, 0], [0, c, -s], [0, s, c]]
}
export const rotY = (deg: number): Mat3 => {
  const c = Math.cos(deg * RAD)
  const s = Math.sin(deg * RAD)
  return [[c, 0, s], [0, 1, 0], [-s, 0, c]]
}
export const rotZ = (deg: number): Mat3 => {
  const c = Math.cos(deg * RAD)
  const s = Math.sin(deg * RAD)
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]]
}

/** Uniformly random rotation (unit quaternion from four Gaussians). */
export function randomRotation(r: () => number): Mat3 {
  const q = [gauss(r), gauss(r), gauss(r), gauss(r)]
  const n = Math.hypot(...q)
  const [w, x, y, z] = q.map((c) => c / n)
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]
  ]
}

// ---------- leg kinematics ----------

export interface Pose {
  /** Hip flexion (+) / extension (-), deg. */
  hipFlex: number
  /** Hip abduction (+ = leg moves away from the midline), deg. */
  hipAbd: number
  /** Knee flexion (+) / hyperextension (-), deg. */
  kneeFlex: number
}
export const STAND: Pose = { hipFlex: 0, hipAbd: 0, kneeFlex: 0 }

/** World-from-segment rotations. Flexion tips the front up (rotation about -X), abduction swings about Z. */
export function legRotations(pose: Pose, side: Side): { thigh: Mat3; shin: Mat3 } {
  const psi = side === 'left' ? pose.hipAbd : -pose.hipAbd
  const thigh = mulM(rotZ(psi), rotX(-pose.hipFlex))
  const shin = mulM(thigh, rotX(pose.kneeFlex))
  return { thigh, shin }
}

export const THIGH_LENGTH_M = 0.42
export const THIGH_SENSOR_M = 0.22
export const SHIN_SENSOR_M = 0.16

/** World positions of the two sensors (hip at the origin). */
function sensorPositions(pose: Pose, side: Side): { thigh: V3; shin: V3 } {
  const { thigh, shin } = legRotations(pose, side)
  const down = { x: 0, y: -1, z: 0 }
  const thighPos = scale(mulV(thigh, down), THIGH_SENSOR_M)
  const kneePos = scale(mulV(thigh, down), THIGH_LENGTH_M)
  return { thigh: thighPos, shin: add(kneePos, scale(mulV(shin, down), SHIN_SENSOR_M)) }
}

// ---------- trajectories ----------

/** Pose as a function of time in seconds. */
export type Trajectory = (tSec: number) => Pose

export interface Step {
  /** Target pose (unspecified fields keep their previous value). */
  to: Partial<Pose>
  /** Time spent moving to the target (smoothstep). */
  moveSec: number
  /** Time spent holding the target. */
  holdSec: number
}

const smooth = (u: number): number => {
  const x = Math.max(0, Math.min(1, u))
  return x * x * (3 - 2 * x)
}

/** Build a trajectory from steps, starting at `start`. Returns the trajectory and its duration. */
export function buildTrajectory(steps: Step[], start: Pose = STAND): { traj: Trajectory; durationSec: number } {
  const keys: { t0: number; t1: number; t2: number; from: Pose; to: Pose }[] = []
  let t = 0
  let cur = start
  for (const s of steps) {
    const to = { ...cur, ...s.to }
    keys.push({ t0: t, t1: t + s.moveSec, t2: t + s.moveSec + s.holdSec, from: cur, to })
    t += s.moveSec + s.holdSec
    cur = to
  }
  const traj: Trajectory = (tSec) => {
    if (tSec <= 0) return start
    for (const k of keys) {
      if (tSec < k.t2) {
        const u = k.t1 > k.t0 ? smooth((tSec - k.t0) / (k.t1 - k.t0)) : 1
        return {
          hipFlex: k.from.hipFlex + (k.to.hipFlex - k.from.hipFlex) * u,
          hipAbd: k.from.hipAbd + (k.to.hipAbd - k.from.hipAbd) * u,
          kneeFlex: k.from.kneeFlex + (k.to.kneeFlex - k.from.kneeFlex) * u
        }
      }
    }
    return cur
  }
  return { traj, durationSec: t }
}

// ---------- rig and sampling ----------

export interface RigConfig {
  seed: number
  side?: Side
  /** Accelerometer noise sigma per axis, in g. */
  accSigmaG?: number
  /** Max absolute per-axis accelerometer bias, in g (uniform). */
  accBiasG?: number
  /** Max relative per-axis scale error (uniform), e.g. 0.02 = +-2 %. */
  accScale?: number
  /** Gyro white-noise sigma, deg/s. Firmware subtracts the boot bias; this models the small residual. */
  gyroSigmaDps?: number
  gyroResidualBiasDps?: number
  /** Include the linear acceleration of the sensor positions in the specific force. */
  linearAcceleration?: boolean
  /** Fix the mountings (sensor-from-segment). Random SO(3) when omitted. */
  mountThigh?: Mat3
  mountShin?: Mat3
}

export interface Rig {
  side: Side
  mountThigh: Mat3
  mountShin: Mat3
  biasThigh: V3
  biasShin: V3
  scaleThigh: V3
  scaleShin: V3
  gyroBiasThigh: V3
  gyroBiasShin: V3
  accSigmaG: number
  gyroSigmaDps: number
  linearAcceleration: boolean
}

export function createRig(cfg: RigConfig): Rig {
  const r = rng(cfg.seed * 7919 + 13)
  const u = (m: number): number => (r() * 2 - 1) * m
  const v3 = (m: number): V3 => ({ x: u(m), y: u(m), z: u(m) })
  const one = (m: number): V3 => ({ x: 1 + u(m), y: 1 + u(m), z: 1 + u(m) })
  return {
    side: cfg.side ?? 'left',
    mountThigh: cfg.mountThigh ?? randomRotation(r),
    mountShin: cfg.mountShin ?? randomRotation(r),
    biasThigh: v3(cfg.accBiasG ?? 0),
    biasShin: v3(cfg.accBiasG ?? 0),
    scaleThigh: one(cfg.accScale ?? 0),
    scaleShin: one(cfg.accScale ?? 0),
    gyroBiasThigh: v3(cfg.gyroResidualBiasDps ?? 0),
    gyroBiasShin: v3(cfg.gyroResidualBiasDps ?? 0),
    accSigmaG: cfg.accSigmaG ?? 0,
    gyroSigmaDps: cfg.gyroSigmaDps ?? 0,
    linearAcceleration: cfg.linearAcceleration ?? false
  }
}

export interface SampleConfig {
  seed: number
  rateHz?: number
  /** Relative inter-frame jitter (0.3 = period varies by +-30 %). */
  jitter?: number
  /** Probability that a frame is lost. */
  dropProb?: number
}

export interface ImuFrame {
  /** Milliseconds from the start of the trajectory. */
  tMs: number
  pose: Pose
  /** Firmware `V:` content: normalised raw accelerometer per sensor (bias/scale/noise included). */
  thighV: V3
  shinV: V3
  /** Firmware `G:` content: unnormalised accelerometer in g and bias-removed gyro in deg/s. */
  thighAcc: V3
  shinAcc: V3
  thighGyro: V3
  shinGyro: V3
  /** Euler pitch the firmware would report for the legacy path (legacy convention: knee = |thigh - shin|). */
  eulerThigh: number
  eulerShin: number
}

/** Angular velocity of a body frame (body axes, deg/s) from two world rotations dt apart. */
function bodyRate(r0: Mat3, r1: Mat3, dtSec: number): V3 {
  const d = mulM(transpose(r0), r1)
  return {
    x: ((d[2][1] - d[1][2]) / 2 / dtSec) * DEG,
    y: ((d[0][2] - d[2][0]) / 2 / dtSec) * DEG,
    z: ((d[1][0] - d[0][1]) / 2 / dtSec) * DEG
  }
}

/** Sample a trajectory through a rig. Deterministic for a given (rig, sample) seed. */
export function simulate(traj: Trajectory, durationSec: number, rig: Rig, sample: SampleConfig): ImuFrame[] {
  const rate = sample.rateHz ?? 25
  const r = rng(sample.seed * 104729 + 7)
  const frames: ImuFrame[] = []
  let t = 0
  while (t <= durationSec + 1e-9) {
    const jit = sample.jitter ? 1 + (r() * 2 - 1) * sample.jitter : 1
    const lost = sample.dropProb ? r() < sample.dropProb : false
    if (!lost) frames.push(sampleAt(traj, t, rig, r))
    t += (1 / rate) * jit
  }
  return frames
}

function sampleAt(traj: Trajectory, t: number, rig: Rig, r: () => number): ImuFrame {
  const pose = traj(t)
  const rot = legRotations(pose, rig.side)
  const rotMinus = legRotations(traj(t - 0.004), rig.side)
  const rotPlus = legRotations(traj(t + 0.004), rig.side)
  const up: V3 = { x: 0, y: 1, z: 0 }

  let linThigh: V3 = { x: 0, y: 0, z: 0 }
  let linShin: V3 = { x: 0, y: 0, z: 0 }
  if (rig.linearAcceleration) {
    const p0 = sensorPositions(traj(t - 0.004), rig.side)
    const p1 = sensorPositions(pose, rig.side)
    const p2 = sensorPositions(traj(t + 0.004), rig.side)
    const acc = (a: V3, b: V3, c: V3): V3 => scale(add(sub(a, scale(b, 2)), c), 1 / (0.004 * 0.004 * G))
    linThigh = acc(p0.thigh, p1.thigh, p2.thigh)
    linShin = acc(p0.shin, p1.shin, p2.shin)
  }

  const measure = (rotWs: Mat3, mount: Mat3, lin: V3, bias: V3, sc: V3): V3 => {
    const specific = add(up, lin)
    const sensor = mulV(mount, mulV(transpose(rotWs), specific))
    return {
      x: sensor.x * sc.x + bias.x + gauss(r) * rig.accSigmaG,
      y: sensor.y * sc.y + bias.y + gauss(r) * rig.accSigmaG,
      z: sensor.z * sc.z + bias.z + gauss(r) * rig.accSigmaG
    }
  }
  const thighAcc = measure(rot.thigh, rig.mountThigh, linThigh, rig.biasThigh, rig.scaleThigh)
  const shinAcc = measure(rot.shin, rig.mountShin, linShin, rig.biasShin, rig.scaleShin)

  const gyro = (a: Mat3, b: Mat3, mount: Mat3, bias: V3): V3 => {
    const w = mulV(mount, bodyRate(a, b, 0.008))
    return {
      x: w.x + bias.x + gauss(r) * rig.gyroSigmaDps,
      y: w.y + bias.y + gauss(r) * rig.gyroSigmaDps,
      z: w.z + bias.z + gauss(r) * rig.gyroSigmaDps
    }
  }

  return {
    tMs: t * 1000,
    pose,
    thighV: unit(thighAcc),
    shinV: unit(shinAcc),
    thighAcc,
    shinAcc,
    thighGyro: gyro(rotMinus.thigh, rotPlus.thigh, rig.mountThigh, rig.gyroBiasThigh),
    shinGyro: gyro(rotMinus.shin, rotPlus.shin, rig.mountShin, rig.gyroBiasShin),
    eulerThigh: pose.hipFlex,
    eulerShin: pose.hipFlex + pose.kneeFlex
  }
}

// ---------- wire format round trip ----------

export interface WireFrame {
  tMs: number
  pose: Pose
  /** Parsed `T:..V:` packet (vectors rounded to the firmware's 3 decimals). */
  raw: RawAngles
  /** Parsed `G:` packet. */
  motion: RawMotion
}

/** Encode each frame the way the firmware does and parse it back with the production parsers. */
export function toWire(frames: ImuFrame[]): WireFrame[] {
  const out: WireFrame[] = []
  for (const f of frames) {
    const packet = encodeAnglePacketWithAccel(
      { thigh: f.eulerThigh, shin: f.eulerShin, thighRoll: 0, shinRoll: 0 },
      f.thighV,
      f.shinV
    )
    const parsed = parseAnglePacket(packet)
    const motion = parseRawPacket(encodeRawMotionPacket({ thighGyro: f.thighGyro, shinGyro: f.shinGyro, thighAcc: f.thighAcc, shinAcc: f.shinAcc }))
    if (parsed.kind !== 'angles' || !motion) throw new Error(`simulator produced an unparsable packet: ${packet}`)
    out.push({ tMs: f.tMs, pose: f.pose, raw: parsed.raw, motion })
  }
  return out
}

// ---------- scenario helpers ----------

/** Mean of a slice of vectors, re-normalised. */
export function meanUnit(vs: V3[]): V3 {
  return unit(vs.reduce((a, b) => add(a, b), { x: 0, y: 0, z: 0 }))
}

/** Frames whose time lies in [t0Sec, t1Sec]. */
export const between = <T extends { tMs: number }>(frames: T[], t0Sec: number, t1Sec: number): T[] =>
  frames.filter((f) => f.tMs >= t0Sec * 1000 && f.tMs <= t1Sec * 1000)

/**
 * The standard knee test used by the characterisation and property tests:
 * stand still, curl the knee to `kneeDeg` (thigh still), hold, return. Timeline in seconds:
 * 0-2 still, 2-5 move, 5-7.5 hold, 7.5-10.5 return, 10.5-12 still.
 */
export function kneeCurl(kneeDeg: number): { traj: Trajectory; durationSec: number; still: [number, number]; hold: [number, number] } {
  const { traj, durationSec } = buildTrajectory([
    { to: {}, moveSec: 0, holdSec: 2 },
    { to: { kneeFlex: kneeDeg }, moveSec: 3, holdSec: 2.5 },
    { to: { kneeFlex: 0 }, moveSec: 3, holdSec: 1.5 }
  ])
  return { traj, durationSec, still: [0.2, 1.9], hold: [5.4, 7.4] }
}

/** Thigh raise (hip flexion) with a straight knee, same timeline as `kneeCurl`. */
export function thighRaise(hipDeg: number): { traj: Trajectory; durationSec: number; still: [number, number]; hold: [number, number] } {
  const { traj, durationSec } = buildTrajectory([
    { to: {}, moveSec: 0, holdSec: 2 },
    { to: { hipFlex: hipDeg }, moveSec: 3, holdSec: 2.5 },
    { to: { hipFlex: 0 }, moveSec: 3, holdSec: 1.5 }
  ])
  return { traj, durationSec, still: [0.2, 1.9], hold: [5.4, 7.4] }
}
