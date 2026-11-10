// IO glue for the unified calibration: stored profile lookup and live still-pose sampling.
// Kept apart from calibrationFlow.ts so that module stays pure and unit-testable without a store or Tauri.
import type { AccelVector } from '@shared/protocol'
import { irms } from '../platform/irmsApi'
import { useStore } from '../store/useStore'
import { captureReference, compileProfile, type CalibrationProfile, type Frame, type ReferenceCheck } from './calibrationCore'
import { newCalibrationId } from './calibration'
import { isStillWindow, rezeroProfile, wearingVerdict } from './calibrationFlow'

type V3 = AccelVector

function parseProfile(json: string): CalibrationProfile | null {
  try {
    const p = JSON.parse(json) as Partial<CalibrationProfile>
    return p && p.schema === 1 && p.method === 'unified' && p.limbs?.shin && p.reference ? (p as CalibrationProfile) : null
  } catch {
    return null
  }
}

/** The stored profile for `calibrationId` (the one currently applied), or null when none matches or it is unreadable. */
export async function loadProfileById(calibrationId: string | null): Promise<CalibrationProfile | null> {
  if (!calibrationId) return null
  try {
    const rows = await irms.calibrationProfiles.list()
    const row = rows.find((r) => r.id === calibrationId)
    return row ? parseProfile(row.profile) : null
  } catch {
    return null
  }
}

const mean = (vs: V3[]): V3 => {
  const n = vs.length || 1
  return { x: vs.reduce((s, v) => s + v.x, 0) / n, y: vs.reduce((s, v) => s + v.y, 0) / n, z: vs.reduce((s, v) => s + v.z, 0) / n }
}

/**
 * Collect live gravity vectors for `ms`, or null when there was no data or the legs were not still (an unsteady
 * window says nothing about the strap, so the caller proceeds without a verdict). Timestamps are receiver time.
 */
export function sampleStillFrames(ms: number, maxSpreadDeg = 4): Promise<Frame[] | null> {
  return new Promise((resolve) => {
    const frames: Frame[] = []
    const unsub = useStore.subscribe((s, prev) => {
      const a = s.rawAngles
      if (!a || a === prev.rawAngles || !a.thighAccel || !a.shinAccel) return
      frames.push({ tMs: performance.now(), thigh: a.thighAccel, shin: a.shinAccel })
    })
    setTimeout(() => {
      unsub()
      resolve(frames.length < 5 || !isStillWindow(frames, maxSpreadDeg) ? null : frames)
    }, ms)
  })
}

/** The stored profile the wearing check compares against, or null for non-unified calibrations / no stored row. */
export async function wearingProfile(): Promise<CalibrationProfile | null> {
  const { settings } = useStore.getState()
  if (settings.calibrationMethod !== 'unified') return null
  return loadProfileById(settings.calibrationId)
}

export interface WearingResult {
  check: ReferenceCheck
  /** The still frames the verdict came from; a quick re-zero can reuse them instead of asking for the pose again. */
  frames: Frame[]
}

/** Samples a still pose and compares it with `profile`; null when the reading is inconclusive (moving or no data). */
export async function wearingCheck(profile: CalibrationProfile): Promise<WearingResult | null> {
  const frames = await sampleStillFrames(2000)
  if (!frames) return null
  const check = wearingVerdict(profile, { thigh: mean(frames.map((f) => f.thigh)), shin: mean(frames.map((f) => f.shin)) })
  return check ? { check, frames } : null
}

export type QuickRezeroOutcome = 'applied' | 'refused' | 'failed'

/**
 * Largest in-plane offset the one-step re-zero will absorb. The check cannot tell a sensor that sits differently
 * from a wearer who is not in the reference posture; a small offset is plausibly the strap, a large one is more
 * likely the posture, and re-zeroing on a wrong posture would shift every angle of the session. Provisional.
 */
export const QUICK_REZERO_MAX_DEG = 20

/** True when a 'rezero' verdict is small enough on every limb to be fixed on the spot. */
export function rezeroWithinReach(check: ReferenceCheck): boolean {
  return (
    check.verdict === 'rezero' &&
    Object.values(check.limbs).every((l) => l != null && Math.abs(l.inPlaneDeg) <= QUICK_REZERO_MAX_DEG)
  )
}

/**
 * Quick re-zero from frames already held in the reference posture: same hinge axes, new zero. Mirrors the flow's
 * apply order (stored row first, live settings second) so a failed write never leaves an unrecorded calibration
 * running. 'refused' = the pose was unusable (shaking, too short, off the hinge plane); nothing was changed.
 */
export async function applyQuickRezero(profile: CalibrationProfile, frames: Frame[]): Promise<QuickRezeroOutcome> {
  const ref = captureReference(frames, profile.reference.kind, profile.reference.posture)
  if (!ref.ok) return 'refused'
  const next = rezeroProfile(profile, ref.reference, { id: newCalibrationId(), createdAt: new Date().toISOString() })
  if (!next.ok) return 'refused'
  try {
    await irms.calibrationProfiles.add({ id: next.profile.id, side: next.profile.side, profile: JSON.stringify(next.profile), active: true })
  } catch {
    return 'failed'
  }
  useStore.getState().setSettings({
    ...compileProfile(next.profile),
    calibrationId: next.profile.id,
    wearSide: next.profile.side,
    lastCalibratedAt: next.profile.createdAt
  })
  return 'applied'
}
