// Contract test shared with the Rust port (IRMS_Core/src/judge.rs).
//
// fixtures/engine-sequences.json holds sample sequences (receive time, knee, thigh) for several
// prescriptions and, per sample, the events this TypeScript engine emits plus the phase afterwards.
// This test checks that the engine still reproduces the file; the Rust test replays the same file
// through its own engine. A behaviour change on either side fails one of the two tests.
//
// To regenerate after an intended behaviour change (then mirror the change in judge.rs):
//   IRMS_WRITE_FIXTURES=1 npx vitest run src/services/triggerEngine.contract.test.ts
import { describe, expect, it } from 'vitest'
import storedJson from '../../fixtures/engine-sequences.json'
import type { LiveAngles } from '@shared/protocol'
import { computeMetricSample, computeMetricZone, type TriggerConfig } from './movementMetric'
import { TriggerEngine, type TriggerEvents } from './triggerEngine'

interface Step {
  /** Receive time in ms; null stands for a non-finite clock reading (NaN). */
  t: number | null
  knee: number
  thigh: number
  /** true = engine.reset() is called before this sample. */
  reset?: boolean
}
interface Sequence {
  name: string
  config: { targetAngle: number; tolerance: number; holdTimeMs: number; triggerType: TriggerConfig['triggerType']; comfort: number | null; limit: number | null }
  steps: Step[]
  /** Per step: events in emission order, then the phase after the sample. */
  expected: { events: string[]; phase: string }[]
}

/** Small deterministic generator so the sequences do not depend on Math.random. */
function prng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/** A rep-like movement with tremor, occasional spikes out of the zone, gaps and clock anomalies. */
function buildSteps(seed: number, shape: (effort: number, noise: number) => { knee: number; thigh: number }, opts: { resets?: boolean } = {}): Step[] {
  const rand = prng(seed)
  const steps: Step[] = []
  let t = 1000
  for (let i = 0; i < 420; i++) {
    const r = rand()
    // Mostly 40 ms (25 Hz); sometimes a short stall, a long gap, a repeated or a backwards timestamp.
    if (r < 0.9) t += 40
    else if (r < 0.94) t += 200 + Math.floor(rand() * 80)
    else if (r < 0.97) t += 300 + Math.floor(rand() * 2500)
    else if (r < 0.985) t += 0
    else t -= 120
    const cycle = (i % 140) / 140
    const effort = cycle < 0.2 ? cycle / 0.2 : cycle < 0.7 ? 1 : cycle < 0.85 ? 1 - (cycle - 0.7) / 0.15 : 0
    let noise = (rand() - 0.5) * 3
    if (rand() < 0.04) noise -= 25 // spike out of the zone
    if (rand() < 0.02) noise += 40 // overshoot
    const { knee, thigh } = shape(effort, noise)
    const step: Step = { t: rand() < 0.006 ? null : t, knee: round1(knee), thigh: round1(thigh) }
    if (opts.resets && rand() < 0.01) step.reset = true
    steps.push(step)
  }
  return steps
}

const SEQUENCES: Omit<Sequence, 'expected'>[] = [
  {
    name: 'squat, no personal range',
    config: { targetAngle: 90, tolerance: 10, holdTimeMs: 3000, triggerType: 'joint_angle', comfort: null, limit: null },
    steps: buildSteps(11, (e, n) => ({ knee: 8 + 82 * e + n, thigh: 6 }))
  },
  {
    name: 'squat with comfort and limit',
    config: { targetAngle: 90, tolerance: 10, holdTimeMs: 1000, triggerType: 'joint_angle', comfort: 95, limit: 110 },
    steps: buildSteps(23, (e, n) => ({ knee: 8 + 84 * e + n, thigh: 6 }), { resets: true })
  },
  {
    name: 'gentle low-target knee flexion',
    config: { targetAngle: 35, tolerance: 10, holdTimeMs: 1000, triggerType: 'joint_angle', comfort: null, limit: null },
    steps: buildSteps(37, (e, n) => ({ knee: 4 + 30 * e + n / 2, thigh: 2 }))
  },
  {
    name: 'straight leg raise',
    config: { targetAngle: 45, tolerance: 10, holdTimeMs: 3000, triggerType: 'segment_elevation', comfort: 30, limit: 40 },
    steps: buildSteps(41, (e, n) => ({ knee: 6 + Math.max(0, n) * 1.2, thigh: 3 + 47 * e + n }))
  },
  {
    name: 'backward extension (shipped default)',
    config: { targetAngle: 20, tolerance: 8, holdTimeMs: 2000, triggerType: 'segment_extension', comfort: null, limit: null },
    steps: buildSteps(53, (e, n) => ({ knee: 3 + Math.max(0, n) / 2, thigh: -(2 + 24 * e) + n / 2 }), { resets: true })
  },
  {
    name: 'hyperextension around the tolerance',
    config: { targetAngle: 90, tolerance: 10, holdTimeMs: 1000, triggerType: 'joint_angle', comfort: null, limit: null },
    steps: buildSteps(67, (e, n) => ({ knee: -8 + 10 * e + n / 3, thigh: 0 }))
  },
  {
    name: 'zero hold time',
    config: { targetAngle: 90, tolerance: 10, holdTimeMs: 0, triggerType: 'joint_angle', comfort: null, limit: null },
    steps: buildSteps(71, (e, n) => ({ knee: 8 + 82 * e + n, thigh: 6 }))
  }
]

function angles(knee: number, thigh: number): LiveAngles {
  return { knee, thigh, shin: 0, kneeRoll: 0, thighRoll: 0, shinRoll: 0, rawThigh: thigh, rawShin: 0, rawThighRoll: 0, rawShinRoll: 0 }
}

function run(seq: Omit<Sequence, 'expected'>): Sequence['expected'] {
  let now = 0
  let events: string[] = []
  const handlers: TriggerEvents = {
    onZoneEnter: () => events.push('enter'),
    onZoneExit: () => events.push('exit'),
    onHoldProgress: (p) => events.push(`progress:${p}`),
    onRepCompleted: () => events.push('rep'),
    onRestCompleted: () => events.push('rest'),
    onOverExtension: (a) => events.push(`alarm:${a}`),
    onComfortExceeded: (a) => events.push(`comfort:${a}`),
    onHyperextension: (a) => events.push(`hyper:${a}`)
  }
  const engine = new TriggerEngine(handlers, () => now)
  const c = seq.config
  const cfg: TriggerConfig = {
    targetAngle: c.targetAngle,
    tolerance: c.tolerance,
    holdTimeMs: c.holdTimeMs,
    triggerType: c.triggerType,
    limits: { comfort: c.comfort, limit: c.limit }
  }
  const zone = computeMetricZone(cfg)
  return seq.steps.map((step) => {
    events = []
    if (step.reset) engine.reset()
    now = step.t ?? NaN
    engine.handle({
      sample: computeMetricSample(angles(step.knee, step.thigh), cfg.triggerType, cfg.tolerance),
      zone,
      holdTimeMs: cfg.holdTimeMs,
      limits: cfg.limits
    })
    return { events, phase: engine.phase }
  })
}

describe('TriggerEngine contract fixture (shared with IRMS_Core/src/judge.rs)', () => {
  const actual: Sequence[] = SEQUENCES.map((seq) => ({ ...seq, expected: run(seq) }))

  // This project's tsconfig has no Node types (the tests run without them), so the write path
  // reaches Node through names the type checker does not resolve.
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  if (env?.IRMS_WRITE_FIXTURES === '1') {
    it('writes fixtures/engine-sequences.json', async () => {
      const fsModule: string = 'node:fs'
      const fs = await import(/* @vite-ignore */ fsModule)
      const target = new URL('../../fixtures/engine-sequences.json', import.meta.url)
      fs.writeFileSync(target, JSON.stringify(actual) + String.fromCharCode(10))
    })
    return
  }

  const stored = storedJson as unknown as Sequence[]

  it('covers the same sequences as the fixture file', () => {
    expect(stored.map((s) => s.name)).toEqual(actual.map((s) => s.name))
  })

  it.each(actual.map((s, i) => [s.name, i] as const))('%s: engine reproduces the stored events', (_name, i) => {
    expect(actual[i].steps).toEqual(stored[i].steps)
    expect(actual[i].expected).toEqual(stored[i].expected)
  })

  it('the sequences exercise every event kind', () => {
    const seen = new Set(stored.flatMap((s) => s.expected.flatMap((e) => e.events.map((x) => x.split(':')[0]))))
    for (const kind of ['enter', 'exit', 'progress', 'rep', 'rest', 'alarm', 'comfort', 'hyper']) {
      expect(seen, `missing ${kind}`).toContain(kind)
    }
  })
})
