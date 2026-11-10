import { describe, expect, it } from 'vitest'
import {
  buildMobilityRecord,
  comparableTrend,
  heldPeak,
  HOLD_MIN_SAMPLES,
  MOVEMENTS,
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
function profile(peak: number, ramp = 30, hold = 60): number[] {
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
  return solveMovement(neutral, { moverSamples, referenceSamples, sampleTimesMs: angles.map((_, i) => i * 40) }, MOVEMENTS.kneeFlexion)
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
    angles[30 + 59] = 100
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
      { moverSamples: Array.from({ length: HOLD_MIN_SAMPLES }, () => bad), sampleTimesMs: Array.from({ length: HOLD_MIN_SAMPLES }, (_, i) => i * 40) },
      MOVEMENTS.kneeFlexion
    )
    expect(out).toEqual({ ok: false, error: 'invalidInput' })
  })

  it('requires a full aligned reference stream for a knee measurement', () => {
    const angles = profile(90)
    const neutral = { thigh: seg(0, 0), shin: seg(0, 0) }
    const capture = { moverSamples: angles.map((a) => seg(0, a)), sampleTimesMs: angles.map((_, i) => i * 40) }
    expect(solveMovement(neutral, capture, MOVEMENTS.kneeFlexion)).toEqual({ ok: false, error: 'invalidInput' })
    expect(solveMovement(neutral, { ...capture, referenceSamples: [neutral.thigh] }, MOVEMENTS.kneeFlexion))
      .toEqual({ ok: false, error: 'invalidInput' })
    expect(solveMovement(neutral, { ...capture, referenceSamples: angles.map(() => neutral.thigh) }, MOVEMENTS.kneeFlexion).ok).toBe(true)
  })
})

describe('hip movements (thigh sensor only)', () => {
  function runHip(id: 'hipFlexion' | 'hipExtension' | 'hipAbduction', seed: number, peak: number, dir: 1 | -1) {
    const r = rng(seed)
    const rot = randomRotation(r)
    const angles = profile(peak)
    const neutral = { thigh: toSensor(rot, seg(5, 0)), shin: { x: 0, y: 1, z: 0 } }
    const moverSamples = angles.map((a) => noisy(toSensor(rot, seg(5, dir * a)), 0.4, r))
    return solveMovement(neutral, { moverSamples, sampleTimesMs: angles.map((_, i) => i * 40) }, MOVEMENTS[id])
  }

  it('recovers flexion, extension and abduction peaks with no reference sensor', () => {
    for (const [id, peak] of [['hipFlexion', 100], ['hipExtension', 25], ['hipAbduction', 40]] as const) {
      for (const dir of [1, -1] as const) {
        const out = runHip(id, 7, peak, dir)
        expect(out.ok, `${id} dir ${dir}`).toBe(true)
        if (out.ok) expect(Math.abs(out.result.peakDeg - peak)).toBeLessThan(3)
      }
    }
  })

  it('rejects an extension past the plausible ceiling', () => {
    expect(runHip('hipExtension', 8, 80, 1)).toEqual({ ok: false, error: 'implausible' })
  })

  it('sums several movements into one record keyed by the full set', () => {
    const mk = (movement: MovementResult['movement'], peakDeg: number): MovementResult => ({
      movement, peakDeg, instantMaxDeg: peakDeg, hingeAxis: { x: 1, y: 0, z: 0 }, neutral: { x: 0, y: 1, z: 0 },
      planarityDeg: 1, spanDeg: 60, hingeUsedGyro: false, holdSpreadDeg: 1, warnings: []
    })
    const rec = buildMobilityRecord([mk('hipFlexion', 100), mk('kneeFlexion', 120)], 't')
    expect(rec?.totalDeg).toBe(220)
    expect(rec?.movementSet).toEqual(['hipFlexion', 'kneeFlexion'])
  })
})

describe('heldPeak', () => {
  it('needs a still window and ignores a faster pass', () => {
    expect(heldPeak(Array.from({ length: 60 }, (_, i) => i * 4), Array.from({ length: 60 }, (_, i) => i * 40))).toBeNull()
    const angles = [0, 20, 40, ...Array(60).fill(70), 40, 0]
    const held = heldPeak(angles, angles.map((_, i) => i * 40))
    expect(held?.peakDeg).toBe(70)
  })

  it('requires two seconds at different stream rates and rejects gaps or invalid clocks', () => {
    for (const interval of [20, 40, 100, 200]) {
      const times = Array.from({ length: 2000 / interval + 1 }, (_, i) => i * interval)
      const angles = times.map(() => 70)
      expect(heldPeak(angles.slice(1), times.slice(1))).toBeNull()
      expect(heldPeak(angles, times)?.peakDeg).toBe(70)
    }
    expect(heldPeak(Array(10).fill(70), Array.from({ length: 10 }, (_, i) => i * 40))).toBeNull()
    const times = Array.from({ length: 60 }, (_, i) => i * 40 + (i >= 30 ? 1000 : 0))
    expect(heldPeak(Array(60).fill(70), times)).toBeNull()
    expect(heldPeak(Array(60).fill(70), Array(60).fill(0))).toBeNull()
  })

  it('ignores an opposite-direction instantaneous outlier when selecting the held direction', () => {
    const angles = profile(80)
    angles[30 + 59] = -100
    const out = run({ seed: 11, a0: 15, peak: 80, angles })
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.result.peakDeg).toBeCloseTo(80, 0)
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

  it('compares only the same movement set', () => {
    const mk = (t: string, total: number): MobilityRecord => ({
      measuredAt: t,
      movementSet: ['kneeFlexion'],
      peaks: { kneeFlexion: total },
      totalDeg: total
    })
    const old = [mk('2026-09-01', 90), mk('2026-09-10', 100)]
    expect(comparableTrend([...old, { ...mk('2026-09-05', 50), movementSet: [] }], mk('x', 0))).toHaveLength(2)
  })

  it('keeps left, right and legacy unknown sides in separate trends', () => {
    const base: MobilityRecord = { measuredAt: '2026-10-20', movementSet: ['kneeFlexion'], peaks: {}, totalDeg: 70 }
    const right = { ...base, side: 'right' as const }
    const left = { ...base, side: 'left' as const, totalDeg: 120 }
    const records = [base, { ...base, side: null }, right, left]
    expect(comparableTrend(records, right)).toEqual([right])
    expect(comparableTrend(records, left)).toEqual([left])
    expect(comparableTrend(records, base)).toHaveLength(2)
  })
})
