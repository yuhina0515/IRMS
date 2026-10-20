// Calibration strategy C: relative range of motion (mobility). No absolute posture is assumed.
// Each limb's angle is the rotation of its gravity vector about a sweep-derived hinge axis, measured from a
// neutral pose the wearer holds. The held peak per movement is summed into a long-term mobility total.
// Plan and rationale: doc/plans/2026-10-03-calibration-c-plan.md
import type { AccelVector } from '@shared/protocol'
import { angularSpanDeg, estimateHingeFromGyro, fitPlaneNormal, fuseHingeAxes, GYRO_MIN_DOMINANCE, GYRO_PLANE_DISAGREE_DEG, SWEEP_PLANARITY_MAX_DEG, SWEEP_SPAN_MIN_DEG } from './calibrationB'
import { projectOntoHingeFrame } from './angleMath'

type V3 = AccelVector

export type Limb = 'thigh' | 'shin'
export type MovementId = 'kneeFlexion' | 'hipFlexion' | 'hipExtension' | 'hipAbduction'

export interface MovementSpec {
  id: MovementId
  /** Limb whose angle is the measured range. */
  mover: Limb
  /** Limb that must stay put during the test (null = no sensor on the fixed side, e.g. the pelvis). */
  reference: Limb | null
  /** Largest value accepted as physiologically plausible; above it the result is rejected. */
  plausibleMaxDeg: number
}

export const MOVEMENTS: Record<MovementId, MovementSpec> = {
  kneeFlexion: { id: 'kneeFlexion', mover: 'shin', reference: 'thigh', plausibleMaxDeg: 170 },
  // Hip movements use the thigh sensor alone: the value is the thigh's tilt from the wearer's neutral, not a joint
  // angle. Trunk or pelvis motion is not seen, so the test asks the wearer to keep the trunk still. Sagittal-plane
  // IMU values agree better than coronal ones (KB PMID-39622186), so abduction carries the same caveat in the UI.
  hipFlexion: { id: 'hipFlexion', mover: 'thigh', reference: null, plausibleMaxDeg: 150 },
  hipExtension: { id: 'hipExtension', mover: 'thigh', reference: null, plausibleMaxDeg: 50 },
  hipAbduction: { id: 'hipAbduction', mover: 'thigh', reference: null, plausibleMaxDeg: 70 }
}

/** Every movement the wizard can offer, in the order it walks the wearer through them. */
export const MOVEMENT_ORDER: MovementId[] = ['kneeFlexion', 'hipFlexion', 'hipExtension', 'hipAbduction']

/** 最少樣本數與實際維持時間共同判定，避免高頻串流提早通過。 */
export const HOLD_MIN_SAMPLES = 10
export const HOLD_MIN_MS = 2000
export const HOLD_MAX_GAP_MS = 250
export const HOLD_STILL_TOLERANCE_DEG = 4
export const REFERENCE_MOVE_MAX_DEG = 10
export const NEUTRAL_OFF_PLANE_MAX_DEG = 15
export const MIN_PEAK_DEG = 5

const DEG = 180 / Math.PI

export type MobilityError =
  | 'invalidInput'
  | 'sweepTooSmall'
  | 'sweepNotPlanar'
  | 'neutralOffPlane'
  | 'referenceMoved'
  | 'noHold'
  | 'peakTooSmall'
  | 'implausible'

export interface Neutral {
  thigh: V3
  shin: V3
}

export interface MovementCapture {
  /** 與重力樣本對齊的單調時間戳（毫秒）。 */
  sampleTimesMs: number[]
  /** Gravity samples in sensor frames over the whole test (sweep and hold), in time order. */
  moverSamples: V3[]
  referenceSamples?: V3[]
  /** Bias-corrected gyro for the mover, only with the firmware `G:` stream. */
  moverGyro?: V3[]
}

export interface MovementResult {
  movement: MovementId
  /** Median angle of the stillest held window at the peak (deg, positive = away from neutral along the sweep). */
  peakDeg: number
  /** Largest instantaneous angle seen (deg); informational, never used as the result. */
  instantMaxDeg: number
  hingeAxis: V3
  /** Neutral gravity vector of the mover, made exactly perpendicular to the hinge axis. */
  neutral: V3
  planarityDeg: number
  spanDeg: number
  hingeUsedGyro: boolean
  holdSpreadDeg: number
  warnings: ('gyroWeak' | 'gyroDisagrees')[]
}

export type MovementOutcome = { ok: true; result: MovementResult } | { ok: false; error: MobilityError }

const finite = (v: V3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z
const unit = (v: V3): V3 => {
  const n = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / n, y: v.y / n, z: v.z / n }
}
const scale = (v: V3, k: number): V3 => ({ x: v.x * k, y: v.y * k, z: v.z * k })
const median = (a: number[]) => {
  const s = a.slice().sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Signed rotation (deg) of `v` about `axis`, measured from `neutral` (already perpendicular to `axis`). */
export function angleFromNeutral(v: V3, axis: V3, neutral: V3): number {
  return projectOntoHingeFrame(v, axis, neutral).pitch
}

/**
 * Held peak: the highest median over a continuous window spanning at least HOLD_MIN_MS and
 * HOLD_MIN_SAMPLES, within the stillness tolerance. Gaps larger than HOLD_MAX_GAP_MS break a hold.
 */
export function heldPeak(angles: number[], timesMs: number[]): { peakDeg: number; spreadDeg: number } | null {
  if (angles.length !== timesMs.length || !angles.every(Number.isFinite) || !timesMs.every(Number.isFinite)) return null
  let best: { peakDeg: number; spreadDeg: number } | null = null
  for (let i = 0; i + HOLD_MIN_SAMPLES <= angles.length; i++) {
    let end = i
    // 中斷或倒序資料不能橋接成一段穩定維持。
    while (end + 1 < angles.length && (end - i + 1 < HOLD_MIN_SAMPLES || timesMs[end] - timesMs[i] < HOLD_MIN_MS)) {
      const gap = timesMs[end + 1] - timesMs[end]
      if (gap <= 0 || gap > HOLD_MAX_GAP_MS) break
      end++
    }
    if (end - i + 1 < HOLD_MIN_SAMPLES || timesMs[end] - timesMs[i] < HOLD_MIN_MS) continue
    const w = angles.slice(i, end + 1)
    const spread = Math.max(...w) - Math.min(...w)
    if (spread > HOLD_STILL_TOLERANCE_DEG) continue
    const m = median(w)
    if (!best || m > best.peakDeg) best = { peakDeg: m, spreadDeg: spread }
  }
  return best
}

export function solveMovement(neutral: Neutral, capture: MovementCapture, spec: MovementSpec): MovementOutcome {
  const n0 = unit(neutral[spec.mover])
  const samples = capture.moverSamples.map(unit)
  const ref = (capture.referenceSamples ?? []).map(unit)
  if (!finite(n0) || samples.length < HOLD_MIN_SAMPLES || !samples.every(finite) || !ref.every(finite) ||
      capture.sampleTimesMs.length !== samples.length || !capture.sampleTimesMs.every(Number.isFinite) ||
      capture.sampleTimesMs.some((t, i, ts) => i > 0 && t <= ts[i - 1])) {
    return { ok: false, error: 'invalidInput' }
  }

  if (spec.reference) {
    if (ref.length !== samples.length) return { ok: false, error: 'invalidInput' }
    const refNeutral = unit(neutral[spec.reference])
    if (!finite(refNeutral)) return { ok: false, error: 'invalidInput' }
    if (ref.length > 0 && angularSpanDeg([refNeutral, ...ref]) > REFERENCE_MOVE_MAX_DEG) {
      return { ok: false, error: 'referenceMoved' }
    }
  }

  const planar = [n0, ...samples]
  const spanDeg = angularSpanDeg(planar)
  if (spanDeg < SWEEP_SPAN_MIN_DEG) return { ok: false, error: 'sweepTooSmall' }
  const fit = fitPlaneNormal(planar)
  if (fit.planarityDeg > SWEEP_PLANARITY_MAX_DEG) return { ok: false, error: 'sweepNotPlanar' }

  let axis = fit.normal
  let usedGyro = false
  const warnings: MovementResult['warnings'] = []
  if (capture.moverGyro && capture.moverGyro.length > 0) {
    const g = estimateHingeFromGyro(capture.moverGyro)
    if (!g || g.dominance < GYRO_MIN_DOMINANCE) warnings.push('gyroWeak')
    else {
      const fused = fuseHingeAxes(g.axis, axis)
      if (fused.disagreeDeg !== null && fused.disagreeDeg > GYRO_PLANE_DISAGREE_DEG) warnings.push('gyroDisagrees')
      else {
        axis = fused.axis
        usedGyro = true
      }
    }
  }

  // The neutral must lie in the sweep plane; project it exactly onto the plane so the frame is orthonormal.
  const offPlaneDeg = Math.asin(Math.max(-1, Math.min(1, dot(n0, axis)))) * DEG
  if (Math.abs(offPlaneDeg) > NEUTRAL_OFF_PLANE_MAX_DEG) return { ok: false, error: 'neutralOffPlane' }
  const neutralInPlane = unit({
    x: n0.x - dot(n0, axis) * axis.x,
    y: n0.y - dot(n0, axis) * axis.y,
    z: n0.z - dot(n0, axis) * axis.z
  })

  // 法向量正負任意；使用穩定維持決定方向，避免單筆反向雜訊翻轉整次量測。
  let angles = samples.map((s) => angleFromNeutral(s, axis, neutralInPlane))
  let hold = heldPeak(angles, capture.sampleTimesMs)
  const reverseHold = heldPeak(angles.map((a) => -a), capture.sampleTimesMs)
  if (reverseHold && (!hold || reverseHold.peakDeg > hold.peakDeg)) {
    axis = scale(axis, -1)
    angles = angles.map((a) => -a)
    hold = reverseHold
  }

  const instantMaxDeg = Math.max(...angles)
  if (!hold) return { ok: false, error: 'noHold' }
  if (hold.peakDeg < MIN_PEAK_DEG) return { ok: false, error: 'peakTooSmall' }
  if (hold.peakDeg > spec.plausibleMaxDeg) return { ok: false, error: 'implausible' }

  return {
    ok: true,
    result: {
      movement: spec.id,
      peakDeg: hold.peakDeg,
      instantMaxDeg,
      hingeAxis: axis,
      neutral: neutralInPlane,
      planarityDeg: fit.planarityDeg,
      spanDeg,
      hingeUsedGyro: usedGyro,
      holdSpreadDeg: hold.spreadDeg,
      warnings
    }
  }
}

// ---------- long-term record ----------

export interface MobilityRecord {
  /** 未記錄側別的舊資料只與同樣未知的資料比較。 */
  side?: 'left' | 'right' | null
  measuredAt: string
  /** Sorted movement ids; trends compare only records with the same set. */
  movementSet: MovementId[]
  peaks: Partial<Record<MovementId, number>>
  totalDeg: number
}

export function movementSetKey(set: MovementId[]): string {
  return [...set].sort().join('+')
}

/** Sum of the held peaks; refuses an incomplete set so a partial sum is never saved as a total. */
export function buildMobilityRecord(results: MovementResult[], measuredAt: string): MobilityRecord | null {
  if (results.length === 0) return null
  const peaks: Partial<Record<MovementId, number>> = {}
  for (const r of results) peaks[r.movement] = r.peakDeg
  const movementSet = (Object.keys(peaks) as MovementId[]).sort()
  if (movementSet.length !== results.length) return null
  const totalDeg = movementSet.reduce((s, id) => s + (peaks[id] ?? 0), 0)
  return { measuredAt, movementSet, peaks, totalDeg }
}

/** Records comparable with `current` (same movement set), oldest first. */
export function comparableTrend(records: MobilityRecord[], current: MobilityRecord): MobilityRecord[] {
  const key = movementSetKey(current.movementSet)
  return records.filter((r) => movementSetKey(r.movementSet) === key && (r.side ?? null) === (current.side ?? null))
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
}
