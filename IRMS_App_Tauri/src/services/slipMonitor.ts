// In-session mounting check for unified calibrations (plan 2026-11-10, section 4.3).
//
// A sensor that turns on the limb changes the direction of the joint's hinge axis as seen from the sensor. While
// the thigh rests and the knee bends and straightens, gravity sweeps a cone in the shin sensor's frame whose axis
// IS the knee hinge, so the exercise itself shows where the axis now lies. Comparing it with the calibrated axis
// reveals a turn of the shin sensor about the leg or a sideways tilt of its board.
//
// What it cannot do, by construction:
// - see a tilt about the hinge axis itself (a pure zero offset); that needs the reference posture of the
//   pre-session wearing check;
// - judge the shin while the thigh moves (the sweep then mixes hip and knee motion and proves nothing);
// - judge the thigh while the knee bends: the hip is not a hinge, so the thigh's sweep axis only means something
//   when the knee is held still and the whole leg swings as one piece (a straight leg raise or a hip swing in
//   the sagittal plane). That check is opt-in: it needs the calibrated thigh axis and the knee angle.
//
// Pure and store-free. The thresholds are provisional: they come from the simulator, not from a worn device.
import type { AccelVector } from '@shared/protocol'
import { angularSpanDeg, jacobiEigen } from './calibrationB'

type V3 = AccelVector

/** History kept. Long enough for one slow repetition, short enough to follow a change. */
export const SLIP_WINDOW_MS = 8000
export const SLIP_EVAL_EVERY_MS = 1000
export const SLIP_MIN_SAMPLES = 40
/** The sweep must be wide and regular before its axis means anything. */
export const SLIP_SPAN_MIN_DEG = 30
export const SLIP_PLANARITY_MAX_DEG = 6
/** The thigh counts as resting while its gravity vector stays within this spread over the window. */
export const SLIP_THIGH_STILL_MAX_DEG = 8
/** The knee counts as held while its angle stays within this spread over the window (thigh check). */
export const SLIP_KNEE_STILL_MAX_DEG = 8
/** Axis difference that counts as a shifted sensor. */
export const SLIP_AXIS_WARN_DEG = 12
/**
 * The difference must persist this long before it is reported. One window of history keeps a past disturbance
 * visible for `SLIP_WINDOW_MS`, so this is that plus ten seconds of the shift really being there.
 */
export const SLIP_CONFIRM_MS = SLIP_WINDOW_MS + 10000

export interface SlipReading {
  /** Angle between the calibrated knee hinge and the axis of the recent shin movement (0 to 90 deg). */
  axisDriftDeg: number
  spanDeg: number
  planarityDeg: number
}

export interface SlipEvent extends SlipReading {
  kind: 'shift'
  limb: 'shin' | 'thigh'
}

const finite = (v: V3): boolean => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
const unit = (v: V3): V3 | null => {
  const n = Math.hypot(v.x, v.y, v.z)
  return n > 1e-9 ? { x: v.x / n, y: v.y / n, z: v.z / n } : null
}

/**
 * Axis of the cone (or plane) that unit vectors sweep: the direction of least variance about their mean. Centred
 * on the mean so a hinge that is not level (leg held out to the side, wearer lying down) still gives the hinge.
 * `planarityDeg` is the RMS distance of the samples from that cone, as an angle.
 */
export function fitSweepAxis(units: V3[]): { axis: V3; planarityDeg: number } {
  const n = units.length || 1
  const m = units.reduce((a, u) => ({ x: a.x + u.x / n, y: a.y + u.y / n, z: a.z + u.z / n }), { x: 0, y: 0, z: 0 })
  const c = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ]
  for (const u of units) {
    const d = [u.x - m.x, u.y - m.y, u.z - m.z]
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[i][j] += d[i] * d[j]
  }
  const { values, vectors } = jacobiEigen(c)
  const k = values.indexOf(Math.min(...values))
  const axis = unit({ x: vectors[k][0], y: vectors[k][1], z: vectors[k][2] }) ?? { x: 0, y: 0, z: 1 }
  const rms = Math.sqrt(Math.max(0, values[k]) / n)
  return { axis, planarityDeg: (Math.asin(Math.min(1, rms)) * 180) / Math.PI }
}

/** Axis of a window of unit shin vectors compared with the calibrated hinge; null when it is not a clean sweep. */
export function axisDrift(hinge: V3, samples: V3[]): SlipReading | null {
  const h = unit(hinge)
  if (!h || samples.length < SLIP_MIN_SAMPLES) return null
  const spanDeg = angularSpanDeg(samples)
  if (spanDeg < SLIP_SPAN_MIN_DEG) return null
  const fit = fitSweepAxis(samples)
  if (!(fit.planarityDeg <= SLIP_PLANARITY_MAX_DEG)) return null
  const c = Math.min(1, Math.abs(fit.axis.x * h.x + fit.axis.y * h.y + fit.axis.z * h.z))
  return { axisDriftDeg: (Math.acos(c) * 180) / Math.PI, spanDeg, planarityDeg: fit.planarityDeg }
}

/** Latched warning state of one sensor. */
class LimbWatch {
  /** Time of the first evaluation of the current unbroken run above the warning threshold. */
  overSince: number | null = null
  reported = false
  last: SlipReading | null = null
  worst = 0

  /** Record a clean reading; returns true once the shift has persisted long enough to report (once only). */
  update(tMs: number, reading: SlipReading): boolean {
    this.last = reading
    this.worst = Math.max(this.worst, reading.axisDriftDeg)
    if (reading.axisDriftDeg <= SLIP_AXIS_WARN_DEG) {
      this.overSince = null
      return false
    }
    if (this.overSince == null) this.overSince = tMs
    if (this.reported || tMs - this.overSince < SLIP_CONFIRM_MS) return false
    this.reported = true
    return true
  }
}

const usable = (v: V3 | null | undefined): V3 | null => (v && finite(v) && unit(v) ? v : null)

export class SlipMonitor {
  private readonly hinge: V3 | null
  private readonly thighHinge: V3 | null
  private samples: { tMs: number; thigh: V3; shin: V3; kneeDeg: number | null }[] = []
  private lastEval = -Infinity
  private readonly shinWatch = new LimbWatch()
  private readonly thighWatch = new LimbWatch()

  /**
   * `shinHinge` is the calibrated knee hinge in the shin sensor frame; without one nothing is watched.
   * `thighHinge` (the calibrated thigh-raise axis in the thigh frame) additionally enables the thigh check.
   */
  constructor(shinHinge: V3 | null | undefined, thighHinge?: V3 | null) {
    this.hinge = usable(shinHinge)
    this.thighHinge = this.hinge ? usable(thighHinge) : null
  }

  get active(): boolean {
    return this.hinge != null
  }

  /** Most recent clean shin reading and the largest drift seen (for logs and session notes). */
  summary(): { last: SlipReading | null; worstDeg: number } {
    return { last: this.shinWatch.last, worstDeg: this.shinWatch.worst }
  }

  /** The same for the thigh sensor; `last` stays null until a clean leg swing with a still knee was seen. */
  thighSummary(): { last: SlipReading | null; worstDeg: number } {
    return { last: this.thighWatch.last, worstDeg: this.thighWatch.worst }
  }

  /**
   * Feed one sample of both gravity vectors (both are needed: the thigh proves the knee moved alone). `kneeDeg`
   * is the current knee angle; it is only used by the thigh check. Returns at most one event per limb per monitor
   * lifetime: each report is latched, so a shifted sensor gives one warning.
   */
  push(tMs: number, vectors: { thigh?: V3 | null; shin?: V3 | null; kneeDeg?: number | null }): SlipEvent | null {
    if (!this.hinge || !Number.isFinite(tMs)) return null
    // A clock that runs backwards (reconnect, resume) makes the window meaningless: start over.
    if (this.samples.length > 0 && tMs < this.samples[this.samples.length - 1].tMs) {
      this.samples = []
      this.shinWatch.overSince = null
      this.thighWatch.overSince = null
      this.lastEval = -Infinity
    }
    const thigh = vectors.thigh && finite(vectors.thigh) ? unit(vectors.thigh) : null
    const shin = vectors.shin && finite(vectors.shin) ? unit(vectors.shin) : null
    const kneeDeg = typeof vectors.kneeDeg === 'number' && Number.isFinite(vectors.kneeDeg) ? vectors.kneeDeg : null
    if (thigh && shin) this.samples.push({ tMs, thigh, shin, kneeDeg })
    while (this.samples.length > 0 && this.samples[0].tMs < tMs - SLIP_WINDOW_MS) this.samples.shift()

    if (tMs - this.lastEval < SLIP_EVAL_EVERY_MS) return null
    this.lastEval = tMs

    // No clean sweep in the window says nothing either way: the current run is left as it is.
    if (this.samples.length < SLIP_MIN_SAMPLES) return null

    // Shin: the thigh rests and the knee sweeps.
    if (angularSpanDeg(this.samples.map((s) => s.thigh)) <= SLIP_THIGH_STILL_MAX_DEG) {
      const reading = axisDrift(this.hinge, this.samples.map((s) => s.shin))
      if (reading && this.shinWatch.update(tMs, reading)) return { kind: 'shift', limb: 'shin', ...reading }
    }

    // Thigh: the knee is held and the whole leg swings about the hip.
    if (this.thighHinge && this.samples.every((s) => s.kneeDeg != null)) {
      const knees = this.samples.map((s) => s.kneeDeg as number)
      if (Math.max(...knees) - Math.min(...knees) <= SLIP_KNEE_STILL_MAX_DEG) {
        const reading = axisDrift(this.thighHinge, this.samples.map((s) => s.thigh))
        if (reading && this.thighWatch.update(tMs, reading)) return { kind: 'shift', limb: 'thigh', ...reading }
      }
    }
    return null
  }
}
