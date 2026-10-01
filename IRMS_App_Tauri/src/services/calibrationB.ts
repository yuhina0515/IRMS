// Calibration module B: gravity-only mounting solve from many simple poses.
// Segment frame G: x = lateral (out), y = proximal along the long axis, z = anterior.
// Vectors are unit "specific force" readings (world-up in the sensor frame), as sent by `V:`.
// Plan and rationale: doc/plans/2026-10-01-calibration-b-plan.md
import type { AccelVector } from '@shared/protocol'
import type { Settings } from '../store/useStore'
import { vectorAngleDeg } from './angleMath'

type V3 = AccelVector
type Mat3 = number[][]

const DEG = 180 / Math.PI

export type Limb = 'thigh' | 'shin'
export type Side = 'left' | 'right'
export type PoseId = 'standing' | 'seated' | 'supine' | 'prone' | 'sideLying'

/**
 * Expected world-up vector in the segment frame, LEFT-leg convention (x lateral). For the right leg x is
 * medial instead, so the frame stays right-handed; `expectedFor` applies that flip.
 */
export const POSE_EXPECTED: Record<PoseId, Record<Limb, V3>> = {
  standing: { thigh: { x: 0, y: 1, z: 0 }, shin: { x: 0, y: 1, z: 0 } },
  seated: { thigh: { x: 0, y: 0, z: 1 }, shin: { x: 0, y: 1, z: 0 } },
  supine: { thigh: { x: 0, y: 0, z: 1 }, shin: { x: 0, y: 0, z: 1 } },
  prone: { thigh: { x: 0, y: 0, z: -1 }, shin: { x: 0, y: 0, z: -1 } },
  sideLying: { thigh: { x: 1, y: 0, z: 0 }, shin: { x: 1, y: 0, z: 0 } }
}

/**
 * Lying poses carry leg external rotation / droop, seated poses carry chair slope and shin lean, so they
 * count less than the sweeps. `prone` is not part of any protocol (patients often cannot tolerate it).
 */
export const POSE_WEIGHT: Record<PoseId, number> = {
  standing: 1,
  supine: 0.7,
  sideLying: 0.7,
  seated: 0.6,
  prone: 0.5
}

export function expectedFor(pose: PoseId, limb: Limb, side: Side): V3 {
  const v = POSE_EXPECTED[pose][limb]
  return side === 'right' ? { x: -v.x, y: v.y, z: v.z } : v
}

/** Sweep peak side: hip flexion lifts the thigh front up (+z), knee flexion tips the shin front down (-z). */
export const SWEEP_EXPECTED_Z_SIGN: Record<Limb, 1 | -1> = { thigh: 1, shin: -1 }

export const SWEEP_SPAN_MIN_DEG = 25
export const SWEEP_PLANARITY_MAX_DEG = 10
export const OUTLIER_RESIDUAL_DEG = 15
export const FAIL_RMS_DEG = 15
export const HINGE_WEIGHT = 2
const MIN_PAIR_SEPARATION_DEG = 30
const MAX_REJECTIONS = 2

export interface PoseCapture {
  pose: PoseId
  thigh: V3
  shin: V3
}

export interface SweepCapture {
  limb: Limb
  samples: V3[]
  /** Which way the segment front tips when the sweep peaks (+1 = front rises). Defaults per limb. */
  zSign?: 1 | -1
}

export type SolveError = 'invalidInput' | 'signAmbiguous' | 'underdetermined' | 'inconsistent' | 'sweepTooSmall' | 'sweepNotPlanar'

export interface LimbSolution {
  rotation: Mat3
  /** Lateral axis in sensor coordinates (runtime `*HingeAxis`). */
  hingeAxis: V3
  /** Vertical-segment gravity in sensor coordinates (runtime `*ZeroAccel`). */
  zeroAccel: V3
  rmsDeg: number
  residuals: { id: string; deg: number }[]
  rejected: string[]
  confidence: 'high' | 'medium' | 'low'
  constraintCount: number
  hingeFromSweep: boolean
  sweepPlanarityDeg: number | null
  sweepSpanDeg: number | null
  warnings: SolveError[]
}

export type LimbResult = { ok: true; solution: LimbSolution } | { ok: false; error: SolveError }

// ---------- small linear algebra ----------

const isFiniteV = (v: V3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z
const unit = (v: V3): V3 => {
  const n = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / n, y: v.y / n, z: v.z / n }
}
const apply = (m: Mat3, v: V3): V3 => ({
  x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
  y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
  z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z
})

/** Cyclic Jacobi for a small symmetric matrix. `vectors[k]` is the eigenvector of `values[k]`. */
export function jacobiEigen(input: Mat3): { values: number[]; vectors: number[][] } {
  const n = input.length
  const a = input.map((row) => row.slice())
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j]
    if (off < 1e-26) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < n; k++) {
          const akp = a[k][p]
          const akq = a[k][q]
          a[k][p] = c * akp - s * akq
          a[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k]
          const aqk = a[q][k]
          a[p][k] = c * apk - s * aqk
          a[q][k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p]
          const vkq = v[k][q]
          v[k][p] = c * vkp - s * vkq
          v[k][q] = s * vkp + c * vkq
        }
      }
    }
  }
  return {
    values: a.map((row, i) => row[i]),
    vectors: Array.from({ length: n }, (_, k) => v.map((row) => row[k]))
  }
}

/** Plane through the origin that best contains the vectors; `normal` is the least-variance axis. */
export function fitPlaneNormal(vectors: V3[]): { normal: V3; planarityDeg: number } {
  const c = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ]
  for (const raw of vectors) {
    const u = [raw.x, raw.y, raw.z]
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[i][j] += u[i] * u[j]
  }
  const { values, vectors: eig } = jacobiEigen(c)
  const k = values.indexOf(Math.min(...values))
  const normal = unit({ x: eig[k][0], y: eig[k][1], z: eig[k][2] })
  const outOfPlane = vectors.map((s) => Math.asin(Math.max(-1, Math.min(1, dot(unit(s), normal)))) * DEG)
  const planarityDeg = Math.sqrt(outOfPlane.reduce((sum, d) => sum + d * d, 0) / Math.max(1, vectors.length))
  return { normal, planarityDeg }
}

/** Largest pairwise angle among the vectors (subsampled to keep this O(1)-ish). */
export function angularSpanDeg(vectors: V3[]): number {
  const stride = Math.max(1, Math.ceil(vectors.length / 60))
  const pts = vectors.filter((_, i) => i % stride === 0)
  let span = 0
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) span = Math.max(span, vectorAngleDeg(pts[i], pts[j]))
  return span
}

export interface VectorPair {
  sensor: V3
  segment: V3
  weight: number
}

/** Horn (1987) closed-form rotation `R` minimising sum w |R a - b|^2; returns a proper rotation. */
export function solveRotation(pairs: VectorPair[]): Mat3 {
  let sxx = 0, sxy = 0, sxz = 0, syx = 0, syy = 0, syz = 0, szx = 0, szy = 0, szz = 0
  for (const { sensor: a, segment: b, weight: w } of pairs) {
    sxx += w * a.x * b.x; sxy += w * a.x * b.y; sxz += w * a.x * b.z
    syx += w * a.y * b.x; syy += w * a.y * b.y; syz += w * a.y * b.z
    szx += w * a.z * b.x; szy += w * a.z * b.y; szz += w * a.z * b.z
  }
  const n = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz]
  ]
  const { values, vectors } = jacobiEigen(n)
  const best = vectors[values.indexOf(Math.max(...values))]
  const norm = Math.hypot(best[0], best[1], best[2], best[3]) || 1
  const [w, x, y, z] = best.map((q) => q / norm)
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]
  ]
}

// ---------- per-limb solve ----------

interface Constraint {
  id: string
  sensor: V3
  segment: V3
  weight: number
}


function observable(segments: V3[]): boolean {
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (vectorAngleDeg(segments[i], segments[j]) >= MIN_PAIR_SEPARATION_DEG) return true
    }
  }
  return false
}

function weightedSse(rotation: Mat3, pairs: VectorPair[]): number {
  let sse = 0
  for (const p of pairs) {
    const d = vectorAngleDeg(apply(rotation, p.sensor), p.segment)
    sse += p.weight * d * d
  }
  return sse
}

const hingeTarget = (side: Side): V3 => ({ x: side === 'right' ? -1 : 1, y: 0, z: 0 })

export function solveLimbMounting(limb: Limb, poses: PoseCapture[], sweeps: SweepCapture[], side: Side = 'left'): LimbResult {
  const all: Constraint[] = poses.map((p) => ({
    id: p.pose,
    sensor: unit(p[limb]),
    segment: expectedFor(p.pose, limb, side),
    weight: POSE_WEIGHT[p.pose]
  }))
  const limbSweeps = sweeps.filter((s) => s.limb === limb)
  const sweepSamples = limbSweeps.flatMap((s) => s.samples.map(unit))
  const sweepSigns = limbSweeps.flatMap((s) => s.samples.map(() => s.zSign ?? SWEEP_EXPECTED_Z_SIGN[limb]))
  if (!all.every((c) => isFiniteV(c.sensor)) || !sweepSamples.every(isFiniteV)) return { ok: false, error: 'invalidInput' }

  let active = all.slice()
  const rejected: string[] = []
  for (;;) {
    // Re-fit the sagittal plane each pass so a rejected pose no longer tilts the hinge estimate.
    const planar = [...sweepSamples, ...active.filter((c) => c.segment.x === 0).map((c) => c.sensor)]
    const warnings: SolveError[] = []
    let hinge: V3 | null = null
    let planarityDeg: number | null = null
    let spanDeg: number | null = null
    if (sweepSamples.length > 0) {
      spanDeg = angularSpanDeg(planar)
      if (planar.length < 3 || spanDeg < SWEEP_SPAN_MIN_DEG) {
        warnings.push('sweepTooSmall')
      } else {
        const fit = fitPlaneNormal(sweepSamples.length >= 10 ? sweepSamples : planar)
        planarityDeg = fit.planarityDeg
        if (fit.planarityDeg > SWEEP_PLANARITY_MAX_DEG) warnings.push('sweepNotPlanar')
        else hinge = fit.normal
      }
    }
    const exactSegments = active.map((c) => c.segment)
    if (!observable(hinge ? [...exactSegments, hingeTarget(side)] : exactSegments)) {
      return { ok: false, error: 'underdetermined' }
    }
    const base: VectorPair[] = active.map((c) => ({ sensor: c.sensor, segment: c.segment, weight: c.weight }))
    const candidates: Mat3[] = hinge
      ? [1, -1].map((sign) =>
          solveRotation([...base, { sensor: { x: hinge!.x * sign, y: hinge!.y * sign, z: hinge!.z * sign }, segment: hingeTarget(side), weight: HINGE_WEIGHT }])
        )
      : [solveRotation(base)]
    const choice = chooseCandidate(candidates, base, sweepSamples, sweepSigns)
    const rotation = choice.rotation
    if (choice.ambiguous) warnings.push('signAmbiguous')

    const residuals = active.map((c) => ({ id: c.id, deg: vectorAngleDeg(apply(rotation, c.sensor), c.segment) }))
    const worst = residuals.reduce((a, b) => (b.deg > a.deg ? b : a), { id: '', deg: -1 })
    const canDrop = active.length > 2 && rejected.length < MAX_REJECTIONS
    if (worst.deg > OUTLIER_RESIDUAL_DEG && canDrop) {
      rejected.push(worst.id)
      active = active.filter((c) => c.id !== worst.id)
      continue
    }

    const sweepResidual = sweepSamples.length
      ? Math.sqrt(
          sweepSamples.reduce((s, v) => {
            const d = Math.asin(Math.max(-1, Math.min(1, apply(rotation, v).x))) * DEG
            return s + d * d
          }, 0) / sweepSamples.length
        )
      : null
    const terms = [...residuals.map((r, i) => ({ d: r.deg, w: active[i].weight }))]
    if (sweepResidual !== null) terms.push({ d: sweepResidual, w: 1 })
    const rmsDeg = Math.sqrt(terms.reduce((s, t) => s + t.w * t.d * t.d, 0) / terms.reduce((s, t) => s + t.w, 0))
    if (rmsDeg >= FAIL_RMS_DEG) return { ok: false, error: 'inconsistent' }

    const constraintCount = active.length + (hinge ? 1 : 0)
    const confidence = rmsDeg < 4 && constraintCount >= 4 ? 'high' : rmsDeg < 8 && constraintCount >= 3 ? 'medium' : 'low'
    return {
      ok: true,
      solution: {
        rotation,
        hingeAxis: { x: rotation[0][0], y: rotation[0][1], z: rotation[0][2] },
        zeroAccel: { x: rotation[1][0], y: rotation[1][1], z: rotation[1][2] },
        rmsDeg,
        residuals: sweepResidual !== null ? [...residuals, { id: 'sweep', deg: sweepResidual }] : residuals,
        rejected,
        confidence,
        constraintCount,
        hingeFromSweep: hinge !== null,
        sweepPlanarityDeg: planarityDeg,
        sweepSpanDeg: spanDeg,
        warnings
      }
    }
  }
}

/**
 * Two normal-sign candidates fit a sagittal-only data set equally well (180 deg about the long axis).
 * Lower weighted error wins; on a near tie the sweep direction (hip flexion lifts the front, knee
 * flexion tips it down) decides.
 */
function chooseCandidate(
  candidates: Mat3[],
  pairs: VectorPair[],
  sweepSamples: V3[],
  sweepSigns: number[]
): { rotation: Mat3; ambiguous: boolean } {
  if (candidates.length === 1) return { rotation: candidates[0], ambiguous: false }
  const sse = candidates.map((r) => weightedSse(r, pairs))
  const [a, b] = sse
  if (Math.abs(a - b) > 0.25 * Math.max(a, b, 1e-6)) return { rotation: candidates[a < b ? 0 : 1], ambiguous: false }
  const score = candidates.map((r) =>
    sweepSamples.reduce((s, v, i) => {
      const z = apply(r, v).z * sweepSigns[i]
      return s + (Math.abs(z) > 0.2 ? Math.sign(z) : 0)
    }, 0)
  )
  if (score[0] === score[1]) return { rotation: candidates[a <= b ? 0 : 1], ambiguous: true }
  return { rotation: candidates[score[0] > score[1] ? 0 : 1], ambiguous: false }
}

// ---------- floor stage: accelerometer bias from resting faces ----------

export type Face = '+x' | '-x' | '+y' | '-y' | '+z' | '-z'
export const FACE_MIN_DOMINANCE = 0.995 // ~5.7 deg from level; a tilt would otherwise be read as bias

export function classifyFace(v: V3): Face | null {
  const u = unit(v)
  const comps: [Face, number][] = [
    ['+x', u.x], ['-x', -u.x], ['+y', u.y], ['-y', -u.y], ['+z', u.z], ['-z', -u.z]
  ]
  const [face, value] = comps.reduce((a, b) => (b[1] > a[1] ? b : a))
  return value >= FACE_MIN_DOMINANCE ? face : null
}

export interface BiasEstimate {
  /** Zero-g offset in g units (first order). */
  bias: V3
  facesUsed: Face[]
  /** Components with no observation (bias left at 0). */
  unobserved: ('x' | 'y' | 'z')[]
  /** Largest spread (deg) between faces that should agree on the same bias component. */
  inconsistencyDeg: number
  /** Number of captures that matched no face (device not flat). */
  ignored: number
}

/**
 * For a device resting on face e, the unit reading is (e + b)/|e + b| ~ e + b_perp, so the two
 * components perpendicular to the up axis are direct observations of b. Scale error is not observable.
 */
export function estimateAccelBias(vectors: V3[]): BiasEstimate {
  const obs: Record<'x' | 'y' | 'z', number[]> = { x: [], y: [], z: [] }
  const faces = new Set<Face>()
  let ignored = 0
  for (const raw of vectors) {
    const face = classifyFace(raw)
    if (!face) {
      ignored++
      continue
    }
    faces.add(face)
    const u = unit(raw)
    if (!isFiniteV(u)) {
      ignored++
      continue
    }
    for (const axis of ['x', 'y', 'z'] as const) if (face[1] !== axis) obs[axis].push(u[axis])
  }
  const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
  const bias = { x: mean(obs.x), y: mean(obs.y), z: mean(obs.z) }
  const spread = (a: number[]) => (a.length ? Math.max(...a) - Math.min(...a) : 0)
  return {
    bias,
    facesUsed: [...faces],
    unobserved: (['x', 'y', 'z'] as const).filter((k) => obs[k].length === 0),
    inconsistencyDeg: Math.max(spread(obs.x), spread(obs.y), spread(obs.z)) * DEG,
    ignored
  }
}

export function applyAccelBias(v: V3, bias: V3): V3 {
  return unit({ x: v.x - bias.x, y: v.y - bias.y, z: v.z - bias.z })
}

// ---------- settings patch ----------

export type CalibrationBResult =
  | { ok: true; patch: Partial<Settings>; thigh: LimbSolution; shin: LimbSolution }
  | { ok: false; limb: Limb; error: SolveError }

/**
 * Same Settings fields as flow A's vector path, so `applyCalibration` works unchanged. The frames are
 * anatomical, hence invert = false (hip flexion +, knee flexion = thigh - shin) and lateral = +roll (right leg: frame x is medial, so roll is inverted).
 */
export function buildCalibrationPatchB(
  poses: PoseCapture[],
  sweeps: SweepCapture[],
  bias?: { thigh?: V3; shin?: V3 },
  side: Side = 'left'
): CalibrationBResult {
  const corrected = poses.map((p) => ({
    ...p,
    thigh: bias?.thigh ? applyAccelBias(p.thigh, bias.thigh) : p.thigh,
    shin: bias?.shin ? applyAccelBias(p.shin, bias.shin) : p.shin
  }))
  const correctedSweeps = sweeps.map((s) => {
    const b = s.limb === 'thigh' ? bias?.thigh : bias?.shin
    return b ? { ...s, samples: s.samples.map((v) => applyAccelBias(v, b)) } : s
  })
  const thigh = solveLimbMounting('thigh', corrected, correctedSweeps, side)
  if (!thigh.ok) return { ok: false, limb: 'thigh', error: thigh.error }
  const shin = solveLimbMounting('shin', corrected, correctedSweeps, side)
  if (!shin.ok) return { ok: false, limb: 'shin', error: shin.error }

  const standing = corrected.find((p) => p.pose === 'standing')
  const patch: Partial<Settings> = {
    proximalAxisRotationVerified: true,
    distalAxisRotationVerified: true,
    proximalInvert: false,
    distalInvert: false,
    proximalRollInvert: side === 'right',
    distalRollInvert: side === 'right',
    proximalRollVerified: true,
    distalRollVerified: true,
    proximalHingeAxis: thigh.solution.hingeAxis,
    distalHingeAxis: shin.solution.hingeAxis,
    proximalZeroAccel: thigh.solution.zeroAccel,
    distalZeroAccel: shin.solution.zeroAccel,
    kneeZeroRaw: standing ? vectorAngleDeg(standing.thigh, standing.shin) : 0
  }
  return { ok: true, patch, thigh: thigh.solution, shin: shin.solution }
}
