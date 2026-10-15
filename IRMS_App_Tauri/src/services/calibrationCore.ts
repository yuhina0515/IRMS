// Unified calibration core (plan: doc/plans/2026-10-15-calibration-unified-plan.md, section 3.2).
//
// One pure module that replaces the evidence-gathering parts of strategies A, B and C. Every limb ends up as a
// hinge axis `h` plus a reference gravity `zero` perpendicular to `h`, solved from slow sweeps (plane fit, gyro
// fusion when the raw stream exists, A's two-point cross product as a fallback). Nothing here touches the stores or
// the legacy runtime; `compileProfile` turns a profile into the Settings fields the existing runtime reads.
//
// Sign convention (both limbs, so the runtime can stay a plain projection):
//   a limb angle is the rotation of the gravity vector about the limb hinge, measured from `zero`, and a forward
//   tilt of the segment (hip flexion for the thigh, shin leaning forward) reads POSITIVE. Knee flexion tips the shin
//   backward, so for a still thigh the shin angle goes negative and
//       knee = thighAngle - shinAngle            (signed: hyperextension is negative)
//   which is the plan's "shin rotation minus thigh rotation" with the shin measured in the same world sense.
//
// The shared plane-fit, span and gyro helpers still live in calibrationB.ts: the legacy code stays untouched and
// bit-identical, and this module imports from it instead of the other way round.
import type { AccelVector } from '@shared/protocol'
import type { CalibrationQuality, ReferenceKind, ReferencePosture } from '@shared/types'
import type { Settings } from '../store/useStore'
import { projectOntoHingeFrame, vectorAngleDeg } from './angleMath'
import {
  angularSpanDeg,
  estimateHingeFromGyro,
  fitPlaneNormal,
  fuseHingeAxes,
  GYRO_MIN_DOMINANCE,
  GYRO_PLANE_DISAGREE_DEG,
  SWEEP_PLANARITY_MAX_DEG,
  SWEEP_SPAN_MIN_DEG
} from './calibrationB'

type V3 = AccelVector
export type Side = 'left' | 'right'
export type Limb = 'thigh' | 'shin'

// ---------- constants ----------

/** `abs(norm(raw g) - 1)` above this means linear acceleration is corrupting the gravity reading. */
export const LINEAR_ACC_GATE_G = 0.1
export const REFERENCE_MIN_MS = 1500
export const REFERENCE_MIN_FRAMES = 15
/** Same limit as A's capture stillness gate (`CAPTURE_STD_LIMIT`). */
export const REFERENCE_STILL_RMS_DEG = 3
export const REFERENCE_OFF_PLANE_MAX_DEG = 15
/** Below the sweep span minimum but above this, the two-point fallback may still work. */
export const TWO_POINT_SPAN_MIN_DEG = 20
export const HOLD_SEC = 1.5
export const HOLD_MAX_SAMPLES = 10
export const HOLD_SPREAD_MAX_DEG = 4
export const MIN_PEAK_DEG = 5
export const REFERENCE_DRIFT_WARN_DEG = 10
export const REFERENCE_DRIFT_FAIL_DEG = 20
export const QUALITY_HIGH_SPAN_DEG = 40
export const QUALITY_HIGH_PLANARITY_DEG = 5
export const QUALITY_HIGH_REFERENCE_RMS_DEG = 2
export const QUALITY_LOW_PLANARITY_DEG = 7
/** Pre-session reference check thresholds (plan 3.6). */
export const RECHECK_OUT_OF_PLANE_DEG = 10
export const RECHECK_IN_PLANE_DEG = 5

const DEG = 180 / Math.PI

// ---------- small vector helpers ----------

const finite = (v: V3): boolean => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const norm = (v: V3): number => Math.hypot(v.x, v.y, v.z)
const unit = (v: V3): V3 => {
  const n = norm(v) || 1
  return { x: v.x / n, y: v.y / n, z: v.z / n }
}
const scale = (v: V3, k: number): V3 => ({ x: v.x * k, y: v.y * k, z: v.z * k })
const neg = (v: V3): V3 => scale(v, -1)
const median = (a: number[]): number => {
  const s = a.slice().sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const meanUnit = (vs: V3[]): V3 => unit(vs.reduce((a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }), { x: 0, y: 0, z: 0 }))
const rmsAngleDeg = (vs: V3[], center: V3): number =>
  Math.sqrt(vs.reduce((s, v) => s + vectorAngleDeg(v, center) ** 2, 0) / Math.max(1, vs.length))

// ---------- conditioning ----------

/** One timestamped sample of both sensors. Optional fields exist only with the firmware `G:` raw stream. */
export interface Frame {
  tMs: number
  thigh: V3
  shin: V3
  thighGyro?: V3
  shinGyro?: V3
  thighRawG?: V3
  shinRawG?: V3
}

/**
 * Drop unusable frames. Non-finite vectors always go; with the raw stream, frames whose accelerometer norm is more
 * than `LINEAR_ACC_GATE_G` from 1 g go too (the segment is accelerating, so the reading is not pure gravity).
 * No bias or scale correction is applied (plan W4-1); if it is ever added it belongs here so capture and runtime
 * see the same vectors.
 */
export function conditionFrames(frames: Frame[]): { frames: Frame[]; dropped: number; gated: number } {
  const kept: Frame[] = []
  let dropped = 0
  let gated = 0
  for (const f of frames) {
    if (!finite(f.thigh) || !finite(f.shin) || norm(f.thigh) < 0.5 || norm(f.shin) < 0.5) {
      dropped++
      continue
    }
    const bad = [f.thighRawG, f.shinRawG].some((g) => g && finite(g) && Math.abs(norm(g) - 1) > LINEAR_ACC_GATE_G)
    if (bad) {
      gated++
      continue
    }
    kept.push(f)
  }
  return { frames: kept, dropped, gated }
}

// ---------- reference capture ----------

export interface Reference {
  kind: ReferenceKind
  posture: ReferencePosture
  thigh: V3
  shin: V3
  stillRmsDeg: number
  durationMs: number
  frames: number
}

export type ReferenceError = 'invalidInput' | 'tooShort' | 'shaking'

export function captureReference(
  input: Frame[],
  kind: ReferenceKind,
  posture: ReferencePosture
): { ok: true; reference: Reference } | { ok: false; error: ReferenceError } {
  const { frames } = conditionFrames(input)
  if (frames.length === 0) return { ok: false, error: 'invalidInput' }
  const durationMs = frames[frames.length - 1].tMs - frames[0].tMs
  if (frames.length < REFERENCE_MIN_FRAMES || durationMs < REFERENCE_MIN_MS) return { ok: false, error: 'tooShort' }
  const thighs = frames.map((f) => unit(f.thigh))
  const shins = frames.map((f) => unit(f.shin))
  const thigh = meanUnit(thighs)
  const shin = meanUnit(shins)
  const stillRmsDeg = Math.max(rmsAngleDeg(thighs, thigh), rmsAngleDeg(shins, shin))
  if (stillRmsDeg > REFERENCE_STILL_RMS_DEG) return { ok: false, error: 'shaking' }
  return { ok: true, reference: { kind, posture, thigh, shin, stillRmsDeg, durationMs, frames: frames.length } }
}

// ---------- held peak (time-based) ----------

export interface TimedValue {
  tMs: number
  value: number
}

/** Median frame interval in ms (0 when fewer than 2 samples). */
export function medianIntervalMs(samples: { tMs: number }[]): number {
  if (samples.length < 2) return 0
  const dts: number[] = []
  for (let i = 1; i < samples.length; i++) dts.push(samples[i].tMs - samples[i - 1].tMs)
  return median(dts)
}

/**
 * Highest median over a window that lasts at least `HOLD_SEC` and whose spread stays within the stillness
 * tolerance. The sample count needed scales with the stream rate (`min(rate * 1.5, 10)`, at least 3), so a slow
 * mobile link is judged by time, not by a fixed count. `direction` -1 finds the most negative hold instead.
 */
export function heldPeakTimed(
  samples: TimedValue[],
  direction: 1 | -1 = 1
): { peak: number; spread: number; holdSec: number } | null {
  if (samples.length < 3) return null
  const dt = medianIntervalMs(samples)
  if (!(dt > 0)) return null
  const rate = 1000 / dt
  const needed = Math.max(3, Math.min(HOLD_MAX_SAMPLES, Math.floor(rate * HOLD_SEC)))
  let best: { peak: number; spread: number; holdSec: number } | null = null
  for (let i = 0; i < samples.length; i++) {
    let j = i
    while (j < samples.length && samples[j].tMs - samples[i].tMs < HOLD_SEC * 1000) j++
    if (j >= samples.length) break // window would run past the end: not a full hold
    const w = samples.slice(i, j + 1)
    if (w.length < needed) continue
    const values = w.map((s) => s.value)
    const spread = Math.max(...values) - Math.min(...values)
    if (spread > HOLD_SPREAD_MAX_DEG) continue
    const m = median(values)
    if (!best || (direction === 1 ? m > best.peak : m < best.peak)) {
      best = { peak: m, spread, holdSec: (w[w.length - 1].tMs - w[0].tMs) / 1000 }
    }
  }
  return best
}

// ---------- hinge estimation per limb ----------

export type HingeSource = 'sweep' | 'sweepGyro' | 'twoPoint'
export type HingeWarning = 'gyroWeak' | 'gyroDisagrees' | 'twoPoint'

export interface LimbFrame {
  /** Unit hinge axis in the sensor frame, oriented so a forward tilt of the segment reads positive. */
  hinge: V3
  /** Reference gravity, made exactly perpendicular to `hinge`. */
  zero: V3
  source: HingeSource
  spanDeg: number
  planarityDeg: number | null
  gyroAgreeDeg: number | null
  /** How far the raw reference was from the sweep plane before orthogonalisation. */
  offPlaneDeg: number
  warnings: HingeWarning[]
}

export type LimbError = 'invalidInput' | 'sweepTooSmall' | 'sweepNotPlanar' | 'referenceOffPlane' | 'wrongDirection'

export interface LimbInput {
  /** Reference gravity of this limb (from `captureReference`). */
  reference: V3
  /** Gravity samples of the whole sweep, in time order. */
  samples: V3[]
  /** Bias-removed gyro for the same sweep, only with the firmware raw stream. */
  gyro?: V3[]
  /**
   * Expected sign of the sweep's largest excursion on this limb's forward-positive axis:
   * +1 for the thigh hip-flexion sweep, -1 for the shin knee-flexion sweep (the shin tips backward).
   */
  expectedSign: 1 | -1
}

function twoPointAxis(reference: V3, samples: V3[]): V3 | null {
  // The sample furthest from the reference stands in for the held end position.
  let best: V3 | null = null
  let bestDeg = 0
  for (const s of samples) {
    const d = vectorAngleDeg(reference, s)
    if (d > bestDeg) {
      bestDeg = d
      best = s
    }
  }
  if (!best || bestDeg < TWO_POINT_SPAN_MIN_DEG) return null
  const axis = cross(reference, best)
  return norm(axis) < 1e-6 ? null : unit(axis)
}

export function estimateLimbFrame(input: LimbInput): { ok: true; frame: LimbFrame } | { ok: false; error: LimbError } {
  const ref = unit(input.reference)
  const samples = input.samples.map(unit)
  if (!finite(ref) || samples.length < 3 || !samples.every(finite)) return { ok: false, error: 'invalidInput' }

  const planar = [ref, ...samples]
  const spanDeg = angularSpanDeg(planar)
  if (spanDeg < TWO_POINT_SPAN_MIN_DEG) return { ok: false, error: 'sweepTooSmall' }

  const fit = fitPlaneNormal(planar)
  const warnings: HingeWarning[] = []
  let axis: V3 | null = null
  let source: HingeSource = 'sweep'
  let gyroAgreeDeg: number | null = null
  const planeOk = spanDeg >= SWEEP_SPAN_MIN_DEG && fit.planarityDeg <= SWEEP_PLANARITY_MAX_DEG
  if (planeOk) {
    axis = fit.normal
    if (input.gyro && input.gyro.length > 0) {
      const g = estimateHingeFromGyro(input.gyro)
      if (!g || g.dominance < GYRO_MIN_DOMINANCE) warnings.push('gyroWeak')
      else {
        const fused = fuseHingeAxes(g.axis, axis)
        gyroAgreeDeg = fused.disagreeDeg
        if (fused.disagreeDeg !== null && fused.disagreeDeg > GYRO_PLANE_DISAGREE_DEG) warnings.push('gyroDisagrees')
        else {
          axis = fused.axis
          source = 'sweepGyro'
        }
      }
    }
  } else {
    // Short or slightly non-planar sweep: A's cross product of reference and end position.
    const two = twoPointAxis(ref, samples)
    if (!two) return { ok: false, error: spanDeg < SWEEP_SPAN_MIN_DEG ? 'sweepTooSmall' : 'sweepNotPlanar' }
    axis = two
    source = 'twoPoint'
    warnings.push('twoPoint')
  }

  // The reference must lie in the hinge plane, otherwise the angle about the hinge is not observable.
  const offPlaneDeg = Math.asin(Math.max(-1, Math.min(1, dot(ref, axis)))) * DEG
  if (Math.abs(offPlaneDeg) > REFERENCE_OFF_PLANE_MAX_DEG) return { ok: false, error: 'referenceOffPlane' }
  const zero = unit({ x: ref.x - dot(ref, axis) * axis.x, y: ref.y - dot(ref, axis) * axis.y, z: ref.z - dot(ref, axis) * axis.z })

  // Orient the axis so the defining movement's largest excursion has the expected sign.
  const angles = samples.map((s) => projectOntoHingeFrame(s, axis!, zero).pitch)
  const extreme = angles.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0)
  if (extreme * input.expectedSign < 0) axis = neg(axis)

  return {
    ok: true,
    frame: { hinge: axis, zero, source, spanDeg, planarityDeg: planeOk ? fit.planarityDeg : null, gyroAgreeDeg, offPlaneDeg, warnings }
  }
}

// ---------- runtime angles ----------

export interface LimbAngles {
  /** Rotation about the hinge from `zero`, forward tilt positive (deg). */
  pitch: number
  /** Out-of-plane tilt (deg, asin of the hinge component). */
  roll: number
}

export function limbAngles(frame: LimbFrame, vector: V3): LimbAngles {
  return projectOntoHingeFrame(vector, frame.hinge, frame.zero)
}

/** Signed knee: thigh forward tilt minus shin forward tilt. Negative = hyperextension. A missing thigh frame
 *  falls back to the shin alone (no compensation for thigh motion). */
export function kneeSigned(thigh: LimbFrame | null, shin: LimbFrame, thighVec: V3, shinVec: V3): number {
  const shinAngle = limbAngles(shin, shinVec).pitch
  const thighAngle = thigh ? limbAngles(thigh, thighVec).pitch : 0
  return thighAngle - shinAngle
}

// ---------- profile ----------

export interface CalibrationProfile {
  schema: 1
  id: string
  method: 'unified'
  createdAt: string
  side: Side
  protocol: 'vector' | 'euler'
  firmware: { version: string | null; rawStream: boolean }
  reference: Reference
  limbs: { thigh: LimbFrame | null; shin: LimbFrame }
  /** +1 = outward roll reads positive with the stored hinge; null = not verified on a device. */
  rollSign: { thigh: 1 | -1 | null; shin: 1 | -1 | null }
  quality: { level: CalibrationQuality; warnings: string[] }
}

export interface SolveInput {
  id: string
  createdAt: string
  side: Side
  firmware: { version: string | null; rawStream: boolean }
  reference: Reference
  /** Hip-flexion sweep of the thigh; omit for a shin-only profile. */
  thighSweep?: { samples: V3[]; gyro?: V3[] }
  /** Knee-flexion sweep of the shin (the thigh should stay still). */
  shinSweep: { samples: V3[]; gyro?: V3[] }
}

export type SolveError = { limb: Limb; error: LimbError }

export function assessQuality(
  reference: Reference,
  thigh: LimbFrame | null,
  shin: LimbFrame
): { level: CalibrationQuality; warnings: string[] } {
  const warnings: string[] = []
  const frames: LimbFrame[] = thigh ? [thigh, shin] : [shin]
  for (const f of frames) for (const w of f.warnings) if (!warnings.includes(w)) warnings.push(w)
  if (!thigh) warnings.push('shinOnly')

  const limbLevel = (f: LimbFrame): CalibrationQuality => {
    if (f.warnings.includes('gyroDisagrees') || (f.planarityDeg !== null && f.planarityDeg > QUALITY_LOW_PLANARITY_DEG)) return 'low'
    if (
      f.source === 'sweepGyro' &&
      f.spanDeg >= QUALITY_HIGH_SPAN_DEG &&
      f.planarityDeg !== null &&
      f.planarityDeg <= QUALITY_HIGH_PLANARITY_DEG
    ) {
      return 'high'
    }
    return 'medium'
  }
  const rank: Record<CalibrationQuality, number> = { low: 0, medium: 1, high: 2 }
  let level: CalibrationQuality = reference.stillRmsDeg <= QUALITY_HIGH_REFERENCE_RMS_DEG ? 'high' : 'medium'
  for (const f of frames) if (rank[limbLevel(f)] < rank[level]) level = limbLevel(f)
  if (!thigh && level === 'high') level = 'medium'
  return { level, warnings }
}

export function solveProfile(input: SolveInput): { ok: true; profile: CalibrationProfile } | { ok: false; failure: SolveError } {
  const shin = estimateLimbFrame({ reference: input.reference.shin, samples: input.shinSweep.samples, gyro: input.shinSweep.gyro, expectedSign: -1 })
  if (!shin.ok) return { ok: false, failure: { limb: 'shin', error: shin.error } }
  let thigh: LimbFrame | null = null
  if (input.thighSweep) {
    const t = estimateLimbFrame({ reference: input.reference.thigh, samples: input.thighSweep.samples, gyro: input.thighSweep.gyro, expectedSign: 1 })
    if (!t.ok) return { ok: false, failure: { limb: 'thigh', error: t.error } }
    thigh = t.frame
  }
  // Forward-positive axes point along the patient's left in the frame used by calibrationB's priors, so an outward
  // tilt reads positive for the left leg and negative for the right. Derived from geometry and pinned by the
  // simulator tests; not verified on a device.
  const roll: 1 | -1 = input.side === 'left' ? 1 : -1
  return {
    ok: true,
    profile: {
      schema: 1,
      id: input.id,
      method: 'unified',
      createdAt: input.createdAt,
      side: input.side,
      protocol: 'vector',
      firmware: input.firmware,
      reference: input.reference,
      limbs: { thigh, shin: shin.frame },
      rollSign: { thigh: thigh ? roll : null, shin: roll },
      quality: assessQuality(input.reference, thigh, shin.frame)
    }
  }
}

/**
 * Compile a profile into the flat Settings fields the runtime reads. Both inverts are false because the limb
 * frames are already forward-positive; roll invert comes from the side. The Euler fields are not touched.
 */
export function compileProfile(profile: CalibrationProfile): Partial<Settings> {
  const { thigh, shin } = profile.limbs
  const patch: Partial<Settings> = {
    calibrationMethod: 'unified',
    calibrationId: profile.id,
    referenceKind: profile.reference.kind,
    referencePosture: profile.reference.posture,
    calibrationQuality: profile.quality.level,
    firmwareProtocol: profile.protocol,
    proximalInvert: false,
    distalInvert: false,
    distalHingeAxis: shin.hinge,
    distalZeroAccel: shin.zero,
    distalRollInvert: profile.rollSign.shin === -1,
    distalRollVerified: profile.rollSign.shin !== null,
    kneeZeroRaw: vectorAngleDeg(profile.reference.thigh, profile.reference.shin),
    lastCalibratedAt: profile.createdAt
  }
  if (thigh) {
    patch.proximalHingeAxis = thigh.hinge
    patch.proximalZeroAccel = thigh.zero
    patch.proximalRollInvert = profile.rollSign.thigh === -1
    patch.proximalRollVerified = profile.rollSign.thigh !== null
  } else {
    // Shin-only: a thigh frame equal to the shin's would be wrong, so leave the thigh on the (identity-less)
    // legacy path; the runtime shows "thigh not compensated" (stage S4/S6).
    patch.proximalHingeAxis = null
    patch.proximalZeroAccel = null
  }
  return patch
}

// ---------- movements ----------

export type MovementId = 'kneeFlexion' | 'hipFlexion' | 'hipExtension' | 'hipAbduction'

export interface MovementSpec {
  id: MovementId
  limb: Limb
  /** Largest value accepted as physiologically plausible. */
  plausibleMaxDeg: number
  /** The sweep value is positive in the movement's own direction. */
  needsThigh: boolean
}

export const MOVEMENTS: Record<MovementId, MovementSpec> = {
  kneeFlexion: { id: 'kneeFlexion', limb: 'shin', plausibleMaxDeg: 170, needsThigh: false },
  hipFlexion: { id: 'hipFlexion', limb: 'thigh', plausibleMaxDeg: 150, needsThigh: true },
  hipExtension: { id: 'hipExtension', limb: 'thigh', plausibleMaxDeg: 50, needsThigh: true },
  hipAbduction: { id: 'hipAbduction', limb: 'thigh', plausibleMaxDeg: 70, needsThigh: true }
}

export type MovementError =
  | 'invalidInput'
  | 'needsThighFrame'
  | 'wrongDirection'
  | 'referenceMoved'
  | 'noHold'
  | 'peakTooSmall'
  | 'implausible'

export interface MovementResult {
  movement: MovementId
  peakDeg: number
  holdSec: number
  spreadDeg: number
  instantMaxDeg: number
  warnings: ('referenceDrift')[]
}

/** Value of the measured quantity for one frame, positive in the movement's own direction. */
export function movementValue(profile: CalibrationProfile, id: MovementId, f: Frame): number {
  const { thigh, shin } = profile.limbs
  switch (id) {
    case 'kneeFlexion':
      return kneeSigned(thigh, shin, f.thigh, f.shin)
    case 'hipFlexion':
      return limbAngles(thigh as LimbFrame, f.thigh).pitch
    case 'hipExtension':
      return -limbAngles(thigh as LimbFrame, f.thigh).pitch
    case 'hipAbduction':
      return (profile.rollSign.thigh ?? 1) * limbAngles(thigh as LimbFrame, f.thigh).roll
  }
}

/**
 * Evaluate one movement from timestamped frames that cover the whole sweep and hold. The knee uses the thigh
 * frame to remove thigh motion (plan W4-7); the thigh drifting more than 10 deg is a warning, more than 20 a
 * failure. A sweep whose largest excursion points the wrong way is rejected instead of being sign-flipped.
 */
export function evaluateMovement(
  profile: CalibrationProfile,
  id: MovementId,
  input: Frame[]
): { ok: true; result: MovementResult } | { ok: false; error: MovementError } {
  const spec = MOVEMENTS[id]
  if (spec.needsThigh && !profile.limbs.thigh) return { ok: false, error: 'needsThighFrame' }
  const { frames } = conditionFrames(input)
  if (frames.length < 3) return { ok: false, error: 'invalidInput' }

  const values: TimedValue[] = frames.map((f) => ({ tMs: f.tMs, value: movementValue(profile, id, f) }))
  if (!values.every((v) => Number.isFinite(v.value))) return { ok: false, error: 'invalidInput' }

  const warnings: MovementResult['warnings'] = []
  if (id === 'kneeFlexion' && profile.limbs.thigh) {
    const drift = Math.max(...frames.map((f) => Math.abs(limbAngles(profile.limbs.thigh as LimbFrame, f.thigh).pitch)))
    if (drift > REFERENCE_DRIFT_FAIL_DEG) return { ok: false, error: 'referenceMoved' }
    if (drift > REFERENCE_DRIFT_WARN_DEG) warnings.push('referenceDrift')
  }

  const extreme = values.reduce((a, b) => (Math.abs(b.value) > Math.abs(a) ? b.value : a), 0)
  if (extreme < 0 && Math.abs(extreme) >= MIN_PEAK_DEG) return { ok: false, error: 'wrongDirection' }

  const hold = heldPeakTimed(values, 1)
  if (!hold) return { ok: false, error: 'noHold' }
  if (hold.peak < MIN_PEAK_DEG) return { ok: false, error: 'peakTooSmall' }
  if (hold.peak > spec.plausibleMaxDeg) return { ok: false, error: 'implausible' }
  return {
    ok: true,
    result: { movement: id, peakDeg: hold.peak, holdSec: hold.holdSec, spreadDeg: hold.spread, instantMaxDeg: Math.max(...values.map((v) => v.value)), warnings }
  }
}

// ---------- re-zero and reference check ----------

/**
 * Quick re-zero: keep the hinge axes, replace the reference with the current still pose, and re-orthogonalise
 * (finding X1: the old quick re-zero left `zero` skewed against the hinge). Rejects a pose that is off the hinge
 * plane by more than `REFERENCE_OFF_PLANE_MAX_DEG`.
 */
export function rezeroLimb(frame: LimbFrame, reference: V3): { ok: true; frame: LimbFrame } | { ok: false; error: 'referenceOffPlane' | 'invalidInput' } {
  const ref = unit(reference)
  if (!finite(ref)) return { ok: false, error: 'invalidInput' }
  const offPlaneDeg = Math.asin(Math.max(-1, Math.min(1, dot(ref, frame.hinge)))) * DEG
  if (Math.abs(offPlaneDeg) > REFERENCE_OFF_PLANE_MAX_DEG) return { ok: false, error: 'referenceOffPlane' }
  const zero = unit({
    x: ref.x - dot(ref, frame.hinge) * frame.hinge.x,
    y: ref.y - dot(ref, frame.hinge) * frame.hinge.y,
    z: ref.z - dot(ref, frame.hinge) * frame.hinge.z
  })
  return { ok: true, frame: { ...frame, zero, offPlaneDeg } }
}

export type ReferenceVerdict = 'ok' | 'rezero' | 'recalibrate'

export interface ReferenceCheck {
  verdict: ReferenceVerdict
  /** Per limb: in-plane offset (signed pitch) and out-of-plane tilt (signed roll) of the current pose vs `zero`. */
  limbs: Partial<Record<Limb, { inPlaneDeg: number; outOfPlaneDeg: number }>>
}

/**
 * Pre-session wearing check (plan 3.6): compare the current still pose with the stored reference within and out
 * of the hinge plane. A large out-of-plane difference means the strap rotated (full recalibration); only an
 * in-plane offset can be fixed by a quick re-zero.
 */
export function checkReference(profile: CalibrationProfile, current: { thigh: V3; shin: V3 }): ReferenceCheck {
  const limbs: ReferenceCheck['limbs'] = {}
  let verdict: ReferenceVerdict = 'ok'
  for (const limb of ['thigh', 'shin'] as const) {
    const frame = profile.limbs[limb]
    if (!frame) continue
    const a = limbAngles(frame, current[limb])
    limbs[limb] = { inPlaneDeg: a.pitch, outOfPlaneDeg: a.roll }
    if (Math.abs(a.roll) > RECHECK_OUT_OF_PLANE_DEG) verdict = 'recalibrate'
    else if (Math.abs(a.pitch) > RECHECK_IN_PLANE_DEG && verdict === 'ok') verdict = 'rezero'
  }
  return { verdict, limbs }
}

/** The unified runtime knee is only meaningful when the profile came from this core. */
export function isUnified(settings: Pick<Settings, 'calibrationMethod'>): boolean {
  return settings.calibrationMethod === 'unified'
}

/**
 * Segment elevation/extension read the thigh angle against the zero, so they mean "from upright" only when the
 * zero is an upright leg. A zero recorded with "cannot fully straighten" (neutral) or in a sitting/lying posture
 * would silently shift every reading, so the triggers and the pose views that assume an upright zero are withheld.
 * Legacy calibrations keep their existing behaviour untouched.
 */
export function zeroIsUpright(
  settings: Pick<Settings, 'calibrationMethod' | 'referenceKind' | 'referencePosture' | 'proximalZeroAccel' | 'proximalHingeAxis'>
): boolean {
  if (settings.calibrationMethod !== 'unified') return true
  // A shin-only profile has no thigh frame, so the thigh reads 0 and every segment reading would be fiction.
  if (settings.proximalZeroAccel == null || settings.proximalHingeAxis == null) return false
  return settings.referenceKind !== 'neutral' && (settings.referencePosture == null || settings.referencePosture === 'standing')
}
