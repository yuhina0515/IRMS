import { describe, expect, it } from 'vitest'
import { estimateLimbFrame } from './calibrationCore'
import { axisDrift, SLIP_AXIS_WARN_DEG, SLIP_CONFIRM_MS, SlipMonitor, type SlipEvent } from './slipMonitor'
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

const NOISE = { accSigmaG: 0.01, accBiasG: 0.03, accScale: 0.02 }

/** Calibrated shin hinge from a standard knee curl on this rig. */
function shinHinge(rig: Rig) {
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

/** `reps` knee bends of about 6 s each. */
function exercise(reps: number, kneeDeg = 70): { frames: (rig: Rig, seed?: number) => ImuFrame[] } {
  const steps: Step[] = [{ to: {}, moveSec: 0, holdSec: 1 }]
  for (let i = 0; i < reps; i++) {
    steps.push({ to: { kneeFlex: kneeDeg }, moveSec: 2, holdSec: 1 })
    steps.push({ to: { kneeFlex: 0 }, moveSec: 2, holdSec: 1 })
  }
  const { traj, durationSec } = buildTrajectory(steps)
  return { frames: (rig, seed = 2) => simulate(traj, durationSec, rig, { seed }) }
}

/** The same rig after the shin sensor turned on the leg by `slip` (expressed in the segment frame). */
const slipped = (rig: Rig, slip: Mat3): Rig => ({ ...rig, mountShin: mulM(rig.mountShin, slip) })

function run(monitor: SlipMonitor, frames: ImuFrame[], t0 = 0): SlipEvent[] {
  const events: SlipEvent[] = []
  for (const f of frames) {
    const e = monitor.push(t0 + f.tMs, { thigh: f.thighV, shin: f.shinV })
    if (e) events.push(e)
  }
  return events
}

function simulateSteps(rig: Rig, steps: Step[], seed = 2): ImuFrame[] {
  const { traj, durationSec } = buildTrajectory(steps)
  return simulate(traj, durationSec, rig, { seed })
}

describe('axisDrift', () => {
  it('reads close to zero on the mounting it was calibrated with, across random mountings and sensor errors', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rig = createRig({ seed, ...NOISE })
      const reading = axisDrift(shinHinge(rig), exercise(2).frames(rig).map((f) => f.shinV))
      expect(reading, `seed ${seed}`).not.toBeNull()
      expect(reading!.axisDriftDeg, `seed ${seed}`).toBeLessThan(4)
    }
  })

  it('measures a turn of the sensor, except about the hinge axis itself, which it cannot see', () => {
    const rig = createRig({ seed: 3, ...NOISE })
    const hinge = shinHinge(rig)
    const drifts = [rotX(20), rotY(20), rotZ(20)].map(
      (slip) => axisDrift(hinge, exercise(2).frames(slipped(rig, slip)).map((f) => f.shinV))!.axisDriftDeg
    )
    const sorted = [...drifts].sort((a, b) => a - b)
    // One of the three segment axes is the hinge: turning about it leaves the axis where it was.
    expect(sorted[0]).toBeLessThan(4)
    expect(sorted[1]).toBeGreaterThan(16)
    expect(sorted[2]).toBeLessThan(24)
  })

  it('gives no reading for a still leg or a small movement', () => {
    const rig = createRig({ seed: 5, ...NOISE })
    const hinge = shinHinge(rig)
    expect(axisDrift(hinge, exercise(2, 15).frames(rig).map((f) => f.shinV))).toBeNull()
    const still = buildTrajectory([{ to: {}, moveSec: 0, holdSec: 8 }])
    expect(axisDrift(hinge, simulate(still.traj, still.durationSec, rig, { seed: 1 }).map((f) => f.shinV))).toBeNull()
  })

  it('still finds the hinge when it is not level (leg held out to the side throughout)', () => {
    const rig = createRig({ seed: 3, ...NOISE })
    const frames = simulateSteps(rig, [
      { to: { hipAbd: 15 }, moveSec: 0, holdSec: 1 },
      { to: { hipAbd: 15, kneeFlex: 70 }, moveSec: 2, holdSec: 1 },
      { to: { hipAbd: 15, kneeFlex: 0 }, moveSec: 2, holdSec: 1 }
    ])
    expect(axisDrift(shinHinge(rig), frames.map((f) => f.shinV))!.axisDriftDeg).toBeLessThan(4)
  })
})

describe('SlipMonitor', () => {
  it('stays silent through a long session on an unchanged mounting', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const rig = createRig({ seed, ...NOISE })
      const monitor = new SlipMonitor(shinHinge(rig))
      expect(run(monitor, exercise(10).frames(rig)), `seed ${seed}`).toEqual([])
      expect(monitor.summary().worstDeg).toBeLessThan(SLIP_AXIS_WARN_DEG)
    }
  })

  it('reports a shifted shin sensor once, and only after the shift has persisted', () => {
    const rig = createRig({ seed: 3, ...NOISE })
    const hinge = shinHinge(rig)
    // Pick the turn the monitor can see (not the one about the hinge axis).
    const slip = [rotX(25), rotY(25), rotZ(25)].find(
      (s) => axisDrift(hinge, exercise(2).frames(slipped(rig, s)).map((f) => f.shinV))!.axisDriftDeg > 15
    )!
    const monitor = new SlipMonitor(hinge)
    const before = exercise(3).frames(rig)
    expect(run(monitor, before)).toEqual([])
    const tSlip = before[before.length - 1].tMs + 40

    const after = exercise(10).frames(slipped(rig, slip), 4)
    const events: { at: number; e: SlipEvent }[] = []
    for (const f of after) {
      const e = monitor.push(tSlip + f.tMs, { thigh: f.thighV, shin: f.shinV })
      if (e) events.push({ at: f.tMs, e })
    }

    expect(events).toHaveLength(1)
    expect(events[0].e).toMatchObject({ kind: 'shift', limb: 'shin' })
    expect(events[0].e.axisDriftDeg).toBeGreaterThan(SLIP_AXIS_WARN_DEG)
    expect(events[0].at).toBeGreaterThanOrEqual(SLIP_CONFIRM_MS)
  })

  it('does not report a brief disturbance that goes away', () => {
    const rig = createRig({ seed: 3, ...NOISE })
    const hinge = shinHinge(rig)
    const slip = [rotX(25), rotY(25), rotZ(25)].find(
      (s) => axisDrift(hinge, exercise(2).frames(slipped(rig, s)).map((f) => f.shinV))!.axisDriftDeg > 15
    )!
    const monitor = new SlipMonitor(hinge)
    let t = 0
    const feed = (frames: ImuFrame[]): SlipEvent[] => {
      const out = run(monitor, frames, t)
      t += frames[frames.length - 1].tMs + 40
      return out
    }
    expect(feed(exercise(2).frames(rig))).toEqual([])
    // One repetition (about 7 s) with the sensor turned, then it is back in place.
    expect(feed(exercise(1).frames(slipped(rig, slip)))).toEqual([])
    expect(feed(exercise(6).frames(rig))).toEqual([])
  })

  it('says nothing about the shin while the thigh moves (squats, leg swings)', () => {
    const rig = createRig({ seed: 3, ...NOISE })
    const steps: Step[] = [{ to: {}, moveSec: 0, holdSec: 1 }]
    for (let i = 0; i < 8; i++) {
      steps.push({ to: { hipFlex: 60, kneeFlex: 90 }, moveSec: 2, holdSec: 1 })
      steps.push({ to: { hipFlex: 0, kneeFlex: 0, hipAbd: i % 2 ? 25 : 0 }, moveSec: 2, holdSec: 1 })
    }
    const monitor = new SlipMonitor(shinHinge(rig))
    expect(run(monitor, simulateSteps(rig, steps))).toEqual([])
    expect(monitor.summary()).toEqual({ last: null, worstDeg: 0 })
  })

  it('watches nothing without a calibrated hinge and ignores unusable vectors', () => {
    expect(new SlipMonitor(null).active).toBe(false)
    expect(new SlipMonitor(null).push(0, { thigh: { x: 0, y: 1, z: 0 }, shin: { x: 0, y: 1, z: 0 } })).toBeNull()
    const rig = createRig({ seed: 2, ...NOISE })
    const monitor = new SlipMonitor(shinHinge(rig))
    expect(monitor.active).toBe(true)
    expect(monitor.push(0, { thigh: { x: 0, y: 1, z: 0 }, shin: { x: NaN, y: 0, z: 0 } })).toBeNull()
    expect(monitor.push(Number.NaN, { thigh: { x: 0, y: 1, z: 0 }, shin: { x: 0, y: 1, z: 0 } })).toBeNull()
    // Without the thigh vector nothing proves the knee moved alone.
    for (const f of exercise(3).frames(rig)) expect(monitor.push(f.tMs, { shin: f.shinV })).toBeNull()
    expect(monitor.summary()).toEqual({ last: null, worstDeg: 0 })
  })

  it('starts its window over when time goes backwards', () => {
    const rig = createRig({ seed: 2, ...NOISE })
    const monitor = new SlipMonitor(shinHinge(rig))
    const frames = exercise(2).frames(rig)
    run(monitor, frames, 100000)
    expect(run(monitor, frames, 0)).toEqual([])
    expect(monitor.summary().last).not.toBeNull()
  })
})
