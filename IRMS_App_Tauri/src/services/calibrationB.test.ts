import { describe, expect, it } from 'vitest'
import { vectorAngleDeg, projectOntoHingeFrame } from './angleMath'
import {
  applyAccelBias,
  buildCalibrationPatchB,
  classifyFace,
  estimateAccelBias,
  expectedFor,
  type Side,
  solveLimbMounting,
  type Limb,
  type PoseCapture,
  type PoseId,
  type SweepCapture
} from './calibrationB'

type V3 = { x: number; y: number; z: number }
type Mat3 = number[][]

// deterministic PRNG
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r())

const norm = (v: V3): V3 => {
  const n = Math.hypot(v.x, v.y, v.z)
  return { x: v.x / n, y: v.y / n, z: v.z / n }
}
const mulV = (m: Mat3, v: V3): V3 => ({
  x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
  y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
  z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z
})
const transpose = (m: Mat3): Mat3 => m[0].map((_, j) => m.map((row) => row[j]))
function randomRotation(r: () => number): Mat3 {
  const q = [gauss(r), gauss(r), gauss(r), gauss(r)]
  const n = Math.hypot(...q)
  const [w, x, y, z] = q.map((c) => c / n)
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]
  ]
}
function wobble(v: V3, deg: number, r: () => number): V3 {
  const s = (deg * Math.PI) / 180
  return norm({ x: v.x + gauss(r) * s, y: v.y + gauss(r) * s, z: v.z + gauss(r) * s })
}

// Sensor reading = R^T * segment-frame vector (R: sensor -> segment).
function synth(seed: number, noiseDeg: number, wobbleDeg: number, side: Side = 'left') {
  const r = rng(seed)
  const R: Record<Limb, Mat3> = { thigh: randomRotation(r), shin: randomRotation(r) }
  const read = (limb: Limb, seg: V3) => wobble(mulV(transpose(R[limb]), seg), noiseDeg + wobbleDeg, r)
  const poseIds: PoseId[] = ['standing', 'seated', 'supine', 'sideLying']
  const poses: PoseCapture[] = poseIds.map((pose) => ({
    pose,
    thigh: read('thigh', expectedFor(pose, 'thigh', side)),
    shin: read('shin', expectedFor(pose, 'shin', side))
  }))
  const sweep = (limb: Limb, zSign: number): SweepCapture => ({
    limb,
    samples: Array.from({ length: 80 }, (_, i) => {
      const a = ((i / 79) * 80 * Math.PI) / 180 // 0..80 deg sweep in the sagittal plane
      return wobble(mulV(transpose(R[limb]), { x: 0, y: Math.cos(a), z: zSign * Math.sin(a) }), noiseDeg, r)
    })
  })
  return { R, poses, sweeps: [sweep('thigh', 1), sweep('shin', -1)] }
}

describe('solveLimbMounting', () => {
  it('recovers random mountings within 5 deg under 1 deg noise + 3 deg wobble', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { R, poses, sweeps } = synth(seed, 1, 3)
      for (const limb of ['thigh', 'shin'] as Limb[]) {
        const res = solveLimbMounting(limb, poses, sweeps)
        expect(res.ok, `seed ${seed} ${limb}`).toBe(true)
        if (!res.ok) continue
        const gotHinge = res.solution.hingeAxis
        const wantHinge = { x: R[limb][0][0], y: R[limb][0][1], z: R[limb][0][2] }
        const gotUp = res.solution.zeroAccel
        const wantUp = { x: R[limb][1][0], y: R[limb][1][1], z: R[limb][1][2] }
        expect(vectorAngleDeg(gotHinge, wantHinge), `hinge seed ${seed} ${limb}`).toBeLessThan(5)
        expect(vectorAngleDeg(gotUp, wantUp), `up seed ${seed} ${limb}`).toBeLessThan(5)
      }
    }
  })

  it('resolves the normal-sign ambiguity from sweep direction', () => {
    const { R, poses, sweeps } = synth(7, 0.3, 0)
    // sagittal-only data (no side-lying) leaves a 180 deg flip about the long axis
    const sagittal = poses.filter((p) => p.pose !== 'sideLying')
    const res = solveLimbMounting('thigh', sagittal, sweeps)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const want = { x: R.thigh[0][0], y: R.thigh[0][1], z: R.thigh[0][2] }
    expect(vectorAngleDeg(res.solution.hingeAxis, want)).toBeLessThan(5)
  })

  it('rejects a gross outlier pose and still solves', () => {
    const { R, poses, sweeps } = synth(11, 0.5, 1)
    const bad = poses.map((p) => (p.pose === 'seated' ? { ...p, thigh: norm({ x: 1, y: -1, z: -1 }) } : p))
    const res = solveLimbMounting('thigh', bad, sweeps)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.solution.rejected).toContain('seated')
    const want = { x: R.thigh[1][0], y: R.thigh[1][1], z: R.thigh[1][2] }
    expect(vectorAngleDeg(res.solution.zeroAccel, want)).toBeLessThan(5)
  })

  it('fails loudly when under-determined (single pose, no sweep)', () => {
    const { poses } = synth(3, 0.5, 0)
    const res = solveLimbMounting('thigh', [poses[0]], [])
    expect(res).toEqual({ ok: false, error: 'underdetermined' })
  })

  it('fails loudly when poses contradict each other', () => {
    const { poses } = synth(5, 0.3, 0)
    // supine and standing read the same sensor vector: cannot both be true
    const same = poses.map((p) => (p.pose === 'supine' ? { ...p, thigh: poses[0].thigh } : p))
    const res = solveLimbMounting('thigh', same.filter((p) => p.pose === 'standing' || p.pose === 'supine'), [])
    expect(res.ok).toBe(false)
  })
})

describe('buildCalibrationPatchB', () => {
  it('feeds the runtime projection so pitch equals the segment angle', () => {
    const { R, poses, sweeps } = synth(21, 0.3, 0.5)
    const out = buildCalibrationPatchB(poses, sweeps)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const { proximalHingeAxis, proximalZeroAccel } = out.patch as {
      proximalHingeAxis: V3
      proximalZeroAccel: V3
    }
    for (const deg of [0, 30, 60, 90]) {
      const a = (deg * Math.PI) / 180
      const sensor = mulV(transpose(R.thigh), { x: 0, y: Math.cos(a), z: Math.sin(a) })
      const { pitch } = projectOntoHingeFrame(sensor, proximalHingeAxis, proximalZeroAccel)
      // segment angle from vertical is `deg`; allow sign convention, require magnitude within 6 deg
      expect(Math.abs(Math.abs(pitch) - deg)).toBeLessThan(6)
    }
  })
})

describe('floor stage', () => {
  it('classifies faces and ignores tilted captures', () => {
    expect(classifyFace({ x: 0.02, y: -0.99, z: 0.03 })).toBe('-y')
    expect(classifyFace({ x: 0.7, y: 0.7, z: 0.1 })).toBeNull()
  })

  it('estimates a known bias from six faces', () => {
    const bias = { x: 0.03, y: -0.02, z: 0.04 }
    const faces: V3[] = [
      { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }
    ]
    const measured = faces.map((e) => norm({ x: e.x + bias.x, y: e.y + bias.y, z: e.z + bias.z }))
    const est = estimateAccelBias(measured)
    expect(est.unobserved).toEqual([])
    expect(Math.abs(est.bias.x - bias.x)).toBeLessThan(0.005)
    expect(Math.abs(est.bias.y - bias.y)).toBeLessThan(0.005)
    expect(Math.abs(est.bias.z - bias.z)).toBeLessThan(0.005)
    // correction brings each face back within 0.5 deg
    measured.forEach((m, i) => expect(vectorAngleDeg(applyAccelBias(m, est.bias), faces[i])).toBeLessThan(0.5))
  })

  it('reports unobserved components when only one face is captured', () => {
    const est = estimateAccelBias([{ x: 0.01, y: 0.02, z: 1 }])
    expect(est.unobserved).toEqual(['z'])
  })
})

describe('review regressions', () => {
  it('solves the right leg with a medial x axis (right-handed frame)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { R, poses, sweeps } = synth(seed, 0.5, 2, 'right')
      const res = solveLimbMounting('thigh', poses, sweeps, 'right')
      expect(res.ok, `seed ${seed}`).toBe(true)
      if (!res.ok) continue
      expect(res.solution.rejected).toEqual([])
      const want = { x: R.thigh[0][0], y: R.thigh[0][1], z: R.thigh[0][2] }
      expect(vectorAngleDeg(res.solution.hingeAxis, want)).toBeLessThan(5)
    }
  })

  it('returns invalidInput instead of throwing on NaN', () => {
    const { poses, sweeps } = synth(2, 0.3, 0)
    const bad = poses.map((p) => (p.pose === 'standing' ? { ...p, thigh: { x: NaN, y: 1, z: 0 } } : p))
    expect(solveLimbMounting('thigh', bad, sweeps)).toEqual({ ok: false, error: 'invalidInput' })
  })

  it('uses the per-sweep direction (seated knee extension tips the shin front UP)', () => {
    const r = rng(99)
    const R = randomRotation(r)
    const read = (seg: V3) => wobble(mulV(transpose(R), seg), 0.3, r)
    const poses: PoseCapture[] = (['seated', 'supine'] as PoseId[]).map((pose) => ({
      pose,
      thigh: read(expectedFor(pose, 'thigh', 'left')),
      shin: read(expectedFor(pose, 'shin', 'left'))
    }))
    const samples = Array.from({ length: 60 }, (_, i) => {
      const a = ((i / 59) * 80 * Math.PI) / 180
      return read({ x: 0, y: Math.cos(a), z: Math.sin(a) })
    })
    const res = solveLimbMounting('shin', poses, [{ limb: 'shin', samples, zSign: 1 }])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const want = { x: R[0][0], y: R[0][1], z: R[0][2] }
    expect(vectorAngleDeg(res.solution.hingeAxis, want)).toBeLessThan(5)
  })

  it('rejects a tilted device as a floor face', () => {
    expect(classifyFace({ x: 0, y: 0.34, z: 0.94 })).toBeNull()
  })

  it('sets roll invert for the right leg in the patch', () => {
    const { poses, sweeps } = synth(4, 0.3, 0.5, 'right')
    const out = buildCalibrationPatchB(poses, sweeps, undefined, 'right')
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.patch.proximalRollInvert).toBe(true)
  })
})
