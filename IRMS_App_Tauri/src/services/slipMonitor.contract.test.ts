// Contract test shared with the Rust port (IRMS_Core/src/slip_monitor.rs).
//
// fixtures/slip-monitor.json holds simulated sessions as the monitor sees them (time, thigh gravity
// vector, shin gravity vector per sample, rounded to 4 decimals) with what this TypeScript monitor
// reports for them, plus direct calls of jacobiEigen. The Rust test replays the same file.
//
// To regenerate after an intended change (then mirror it in slip_monitor.rs):
//   IRMS_WRITE_FIXTURES=1 node node_modules/vitest/vitest.mjs run src/services/slipMonitor.contract.test.ts
import { describe, expect, it } from 'vitest'
import storedJson from '../../fixtures/slip-monitor.json'
import { estimateLimbFrame } from './calibrationCore'
import { angularSpanDeg, jacobiEigen } from './calibrationB'
import { axisDrift, SlipMonitor, type SlipReading } from './slipMonitor'
import {
  between,
  buildTrajectory,
  createRig,
  kneeCurl,
  meanUnit,
  mulM,
  rotX,
  rotY,
  rotZ,
  simulate,
  type ImuFrame,
  type Mat3,
  type Rig,
  type Step
} from './simulation/imuModel'

type V = { x: number; y: number; z: number }
type Triple = [number | null, number | null, number | null]
type Frame = [number | null, Triple | null, Triple | null]
interface Scenario {
  name: string
  hinge: Triple | null
  frames: Frame[]
  events: ({ index: number } & SlipReading)[]
  summary: { last: SlipReading | null; worstDeg: number }
  firstWindow: { samples: Triple[]; spanDeg: number; drift: SlipReading | null }
}
interface Fixture {
  jacobi: { matrix: number[][]; values: number[]; vectors: number[][] }[]
  scenarios: Scenario[]
}

const NOISE = { accSigmaG: 0.01, accBiasG: 0.03, accScale: 0.02 }
const r4 = (n: number): number => Math.round(n * 1e4) / 1e4
const num = (n: number): number | null => (Number.isFinite(n) ? r4(n) : null)
const triple = (v: V): Triple => [num(v.x), num(v.y), num(v.z)]
const vec = (t: Triple): V => ({ x: t[0] ?? NaN, y: t[1] ?? NaN, z: t[2] ?? NaN })

function shinHinge(rig: Rig): V {
  const k = kneeCurl(80)
  const f = simulate(k.traj, k.durationSec, rig, { seed: 1 })
  const out = estimateLimbFrame({
    reference: meanUnit(between(f, ...k.still).map((x) => x.shinV)),
    samples: f.map((x) => x.shinV),
    expectedSign: -1
  })
  if (!out.ok) throw new Error(`calibration failed: ${out.error}`)
  return out.frame.hinge
}

function sim(rig: Rig, steps: Step[], seed = 2): ImuFrame[] {
  const { traj, durationSec } = buildTrajectory(steps)
  return simulate(traj, durationSec, rig, { seed })
}
function reps(n: number, kneeDeg = 70): Step[] {
  const steps: Step[] = [{ to: {}, moveSec: 0, holdSec: 1 }]
  for (let i = 0; i < n; i++) {
    steps.push({ to: { kneeFlex: kneeDeg }, moveSec: 2, holdSec: 1 })
    steps.push({ to: { kneeFlex: 0 }, moveSec: 2, holdSec: 1 })
  }
  return steps
}
const slipped = (rig: Rig, slip: Mat3): Rig => ({ ...rig, mountShin: mulM(rig.mountShin, slip) })

/** Appends simulated frames after the ones already there, as rounded monitor input. */
function append(frames: Frame[], more: ImuFrame[], opts: { noThigh?: boolean } = {}): void {
  const last = frames.length > 0 ? frames[frames.length - 1][0] : null
  const t0 = last == null ? 0 : last + 40
  for (const f of more) frames.push([Math.round(t0 + f.tMs), opts.noThigh ? null : triple(f.thighV), triple(f.shinV)])
}

function record(name: string, hinge: V | null, frames: Frame[]): Scenario {
  const h = hinge ? triple(hinge) : null
  const monitor = new SlipMonitor(h ? vec(h) : null)
  const events: Scenario['events'] = []
  frames.forEach((f, index) => {
    const e = monitor.push(f[0] ?? NaN, { thigh: f[1] ? vec(f[1]) : null, shin: f[2] ? vec(f[2]) : null })
    if (e) events.push({ index, axisDriftDeg: e.axisDriftDeg, spanDeg: e.spanDeg, planarityDeg: e.planarityDeg })
  })
  // The helper functions on the first 8 s of usable shin vectors.
  const samples = frames.filter((f) => f[0] != null && f[0] <= 8000 && f[2] && f[2].every((c) => c != null)).map((f) => f[2] as Triple)
  const shins = samples.map(vec)
  return {
    name,
    hinge: h,
    frames,
    events,
    summary: { last: monitor.summary().last, worstDeg: monitor.summary().worstDeg },
    firstWindow: { samples, spanDeg: angularSpanDeg(shins), drift: h ? axisDrift(vec(h), shins) : null }
  }
}

function build(): Fixture {
  const rig = createRig({ seed: 3, ...NOISE })
  const hinge = shinHinge(rig)
  // The turn the monitor can see (not the one about the hinge axis).
  const slip = [rotX(25), rotY(25), rotZ(25)].find(
    (s) => axisDrift(hinge, sim(slipped(rig, s), reps(2)).map((f) => f.shinV))!.axisDriftDeg > 15
  )!
  const scenarios: Scenario[] = []

  const unchanged: Frame[] = []
  append(unchanged, sim(rig, reps(6)))
  scenarios.push(record('unchanged mounting', hinge, unchanged))

  const shifted: Frame[] = []
  append(shifted, sim(rig, reps(2)))
  append(shifted, sim(slipped(rig, slip), reps(6), 4))
  scenarios.push(record('shin sensor shifted and stays shifted', hinge, shifted))

  const brief: Frame[] = []
  append(brief, sim(rig, reps(2)))
  append(brief, sim(slipped(rig, slip), reps(1)))
  append(brief, sim(rig, reps(4)))
  scenarios.push(record('brief disturbance that goes away', hinge, brief))

  const squat: Step[] = [{ to: {}, moveSec: 0, holdSec: 1 }]
  for (let i = 0; i < 4; i++) {
    squat.push({ to: { hipFlex: 60, kneeFlex: 90 }, moveSec: 2, holdSec: 1 })
    squat.push({ to: { hipFlex: 0, kneeFlex: 0, hipAbd: i % 2 ? 25 : 0 }, moveSec: 2, holdSec: 1 })
  }
  const moving: Frame[] = []
  append(moving, sim(rig, squat))
  scenarios.push(record('thigh moves, nothing to judge', hinge, moving))

  // Unusable input mixed in: a stretch without the thigh vector, non-finite components, a non-finite
  // time, then time running backwards over a second pass of the same exercise.
  const messy: Frame[] = []
  append(messy, sim(rig, reps(1)), { noThigh: true })
  append(messy, sim(rig, reps(2)))
  messy[messy.length - 30][2] = [null, 0, 0]
  messy[messy.length - 20][0] = null
  const again = sim(rig, reps(2))
  for (const f of again) messy.push([Math.round(f.tMs), triple(f.thighV), triple(f.shinV)])
  scenarios.push(record('missing vectors, bad numbers, time running backwards', hinge, messy))

  const small: Frame[] = []
  append(small, sim(rig, reps(2, 15)))
  scenarios.push(record('movement too small to read', hinge, small))

  const noHinge: Frame[] = []
  append(noHinge, sim(rig, reps(1)))
  scenarios.push(record('no calibrated hinge', null, noHinge))

  const matrices = [
    [[2, 0, 0], [0, 3, 0], [0, 0, 1]],
    [[4, 1, 0.5], [1, 3, 0.2], [0.5, 0.2, 1]],
    [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
    [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    [[5.1, -2.3, 0.7], [-2.3, 0.9, 1.4], [0.7, 1.4, 3.3]],
    [[1e-6, 2e-7, 0], [2e-7, 3e-6, 1e-7], [0, 1e-7, 2e-6]]
  ]
  return { jacobi: matrices.map((matrix) => ({ matrix, ...jacobiEigen(matrix) })), scenarios }
}

describe('slipMonitor contract fixture (shared with IRMS_Core/src/slip_monitor.rs)', () => {
  // Through JSON, so the comparison sees what the file can hold.
  const actual = JSON.parse(JSON.stringify(build())) as Fixture

  // This project's tsconfig has no Node types, so the write path reaches Node through names the
  // type checker does not resolve.
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  if (env?.IRMS_WRITE_FIXTURES === '1') {
    it('writes fixtures/slip-monitor.json', async () => {
      const fsModule: string = 'node:fs'
      const fs = await import(/* @vite-ignore */ fsModule)
      const target = new URL('../../fixtures/slip-monitor.json', import.meta.url)
      fs.writeFileSync(target, JSON.stringify(actual) + String.fromCharCode(10))
    })
    return
  }

  const stored = storedJson as unknown as Fixture

  it('the monitor reproduces the stored sessions', () => {
    expect(actual.scenarios.map((s) => s.name)).toEqual(stored.scenarios.map((s) => s.name))
    for (let i = 0; i < actual.scenarios.length; i++) {
      expect(actual.scenarios[i], actual.scenarios[i].name).toEqual(stored.scenarios[i])
    }
    expect(actual.jacobi).toEqual(stored.jacobi)
  })

  it('the sessions cover a reported shift, clean readings and silence', () => {
    const byName = Object.fromEntries(stored.scenarios.map((s) => [s.name, s]))
    expect(stored.scenarios.flatMap((s) => s.events)).toHaveLength(1)
    expect(byName['shin sensor shifted and stays shifted'].events).toHaveLength(1)
    expect(byName['unchanged mounting'].summary.last).not.toBeNull()
    expect(byName['brief disturbance that goes away'].summary.worstDeg).toBeGreaterThan(12)
    expect(byName['thigh moves, nothing to judge'].summary.last).toBeNull()
    expect(byName['no calibrated hinge'].summary.last).toBeNull()
  })
})
