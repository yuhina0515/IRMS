import { describe, expect, it } from 'vitest'
import {
  buildMobilityRecord,
  comparableTrend,
  heldPeak,
  HOLD_MIN_SAMPLES,
  MOVEMENTS,
  needsJumpConfirmation,
  solveMovement,
  type MobilityRecord,
  type MovementResult
} from './mobilityC'

type V3 = { x: number; y: number; z: number }
type Mat3 = number[][]

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
// sensor reading = R^T * segment vector
const toSensor = (rot: Mat3, v: V3): V3 => ({
  x: rot[0][0] * v.x + rot[1][0] * v.y + rot[2][0] * v.z,
  y: rot[0][1] * v.x + rot[1][1] * v.y + rot[2][1] * v.z,
  z: rot[0][2] * v.x + rot[1][2] * v.y + rot[2][2] * v.z
})
// Gravity in a segment frame after rotating `deg` about the hinge (x) from a stance angle `a0`.
const seg = (a0: number, deg: number): V3 => {
  const t = ((a0 + deg) * Math.PI) / 180
  return { x: 0, y: Math.cos(t), z: Math.sin(t) }
}
const noisy = (v: V3, deg: number, r: () => number): V3 => {
  const s = (deg * Math.PI) / 180
  return norm({ x: v.x + gauss(r) * s, y: v.y + gauss(r) * s, z: v.z + gauss(r) * s })
}

/** ramp out, hold at `peak`, ramp back; returns angles about the hinge relative to the neutral. */
function profile(peak: number, ramp = 30, hold = 15): number[] {
  const out: number[] = []
  for (let i = 1; i <= ramp; i++) out.push((peak * i) / ramp)
  for (let i = 0; i < hold; i++) out.push(peak)
  for (let i = ramp - 1; i >= 0; i--) out.push((peak * i) / ramp)
  return out
}

function run(opts: { seed: number; a0: number; peak: number; dir?: 1 | -1; noise?: number; angles?: number[]; refMove?: number }) {
  const r = rng(opts.seed)
  const rotShin = randomRotation(r)
  const rotThigh = randomRotation(r)
  const dir = opts.dir ?? 1
  const noise = opts.noise ?? 0.4
  const angles = opts.angles ?? profile(opts.peak)
  const neutral = { thigh: toSensor(rotThigh, seg(10, 0)), shin: toSensor(rotShin, seg(opts.a0, 0)) }
  const moverSamples = angles.map((a) => noisy(toSensor(rotShin, seg(opts.a0, dir * a)), noise, r))
  const referenceSamples = angles.map((_, i) =>
    noisy(toSensor(rotThigh, seg(10, (opts.refMove ?? 0) * Math.sin(i / 5))), noise, r)
  )
  return solveMovement(neutral, { moverSamples, referenceSamples }, MOVEMENTS.kneeFlexion)
}

describe('solveMovement (strategy C)', () => {
  it('recovers the held peak under random mounting, both sweep directions, any stance', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const dir of [1, -1] as const) {
        for (const a0 of [0, 25, 70]) {
          const out = run({ seed, a0, peak: 95, dir })
          expect(out.ok, `seed ${seed} dir ${dir} a0 ${a0}`).toBe(true)
          if (out.ok) expect(Math.abs(out.result.peakDeg - 95)).toBeLessThan(3)
        }
      }
    }
  })

  it('does not count a one-sample overshoot as the held peak', () => {
    const angles = profile(80)
    angles[30 + 14] = 100
    const out = run({ seed: 11, a0: 15, peak: 80, angles })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.result.peakDeg).toBeLessThan(84)
      expect(out.result.instantMaxDeg).toBeGreaterThan(95)
    }
  })

  it('reports the same peak when the stance is far from straight (neutral is only a zero)', () => {
    const a = run({ seed: 21, a0: 0, peak: 90 })
    const b = run({ seed: 21, a0: 55, peak: 90 })
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) expect(Math.abs(a.result.peakDeg - b.result.peakDeg)).toBeLessThan(2)
  })

  it('returns an orthonormal frame: neutral is perpendicular to the hinge axis', () => {
    const out = run({ seed: 31, a0: 20, peak: 90 })
    expect(out.ok).toBe(true)
    if (out.ok) {
      const { hingeAxis: h, neutral: n } = out.result
      expect(Math.abs(h.x * n.x + h.y * n.y + h.z * n.z)).toBeLessThan(1e-9)
      expect(Math.hypot(h.x, h.y, h.z)).toBeCloseTo(1, 9)
    }
  })

  it('fails loudly: small sweep, no hold, moving reference, implausible peak', () => {
    const small = run({ seed: 41, a0: 0, peak: 15 })
    expect(small).toEqual({ ok: false, error: 'sweepTooSmall' })

    const moving = profile(90, 40, 0).slice(0, 70)
    const noHold = run({ seed: 42, a0: 0, peak: 90, angles: moving })
    expect(noHold).toEqual({ ok: false, error: 'noHold' })

    const refMoved = run({ seed: 43, a0: 0, peak: 90, refMove: 25 })
    expect(refMoved).toEqual({ ok: false, error: 'referenceMoved' })

    const huge = run({ seed: 44, a0: 0, peak: 175, noise: 0.1 })
    expect(huge).toEqual({ ok: false, error: 'implausible' })
  })

  it('rejects non-finite input', () => {
    const bad = { x: NaN, y: 0, z: 1 }
    const out = solveMovement(
      { thigh: { x: 0, y: 1, z: 0 }, shin: { x: 0, y: 1, z: 0 } },
      { moverSamples: Array.from({ length: HOLD_MIN_SAMPLES }, () => bad) },
      MOVEMENTS.kneeFlexion
    )
    expect(out).toEqual({ ok: false, error: 'invalidInput' })
  })
})

describe('heldPeak', () => {
  it('needs a still window and ignores a faster pass', () => {
    expect(heldPeak(Array.from({ length: 30 }, (_, i) => i * 4))).toBeNull()
    const held = heldPeak([0, 20, 40, ...Array(12).fill(70), 40, 0])
    expect(held?.peakDeg).toBe(70)
  })
})

describe('mobility record', () => {
  const result = (peakDeg: number): MovementResult => ({
    movement: 'kneeFlexion',
    peakDeg,
    instantMaxDeg: peakDeg,
    hingeAxis: { x: 1, y: 0, z: 0 },
    neutral: { x: 0, y: 1, z: 0 },
    planarityDeg: 1,
    spanDeg: 90,
    hingeUsedGyro: false,
    holdSpreadDeg: 1,
    warnings: []
  })

  it('sums peaks, and refuses an empty or duplicated set', () => {
    const rec = buildMobilityRecord([result(100)], '2026-10-03T00:00:00Z')
    expect(rec?.totalDeg).toBe(100)
    expect(rec?.movementSet).toEqual(['kneeFlexion'])
    expect(buildMobilityRecord([], 'x')).toBeNull()
    expect(buildMobilityRecord([result(90), result(95)], 'x')).toBeNull()
  })

  it('compares only the same movement set and asks before a big jump', () => {
    const mk = (t: string, total: number): MobilityRecord => ({
      measuredAt: t,
      movementSet: ['kneeFlexion'],
      peaks: { kneeFlexion: total },
      totalDeg: total
    })
    const old = [mk('2026-09-01', 90), mk('2026-09-10', 100)]
    expect(comparableTrend([...old, { ...mk('2026-09-05', 50), movementSet: [] }], mk('x', 0))).toHaveLength(2)
    expect(needsJumpConfirmation(old, mk('2026-10-03', 140))).toBe(true)
    expect(needsJumpConfirmation(old, mk('2026-10-03', 110))).toBe(false)
    expect(needsJumpConfirmation([], mk('2026-10-03', 170))).toBe(false)
  })
})
