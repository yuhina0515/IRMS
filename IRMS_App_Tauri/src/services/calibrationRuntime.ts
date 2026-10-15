// IO glue for the unified calibration: stored profile lookup and live still-pose sampling.
// Kept apart from calibrationFlow.ts so that module stays pure and unit-testable without a store or Tauri.
import type { AccelVector } from '@shared/protocol'
import { irms } from '../platform/irmsApi'
import { useStore } from '../store/useStore'
import type { CalibrationProfile } from './calibrationCore'
import { isStillWindow, wearingVerdict } from './calibrationFlow'
import type { ReferenceCheck } from './calibrationCore'

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
 * Collect live gravity vectors for `ms` and return their mean, or null when there was no data or the legs were not
 * still (an unsteady window says nothing about the strap, so the caller proceeds without a verdict).
 */
export function sampleStillPose(ms: number, maxSpreadDeg = 4): Promise<{ thigh: V3; shin: V3 } | null> {
  return new Promise((resolve) => {
    const samples: { thigh: V3; shin: V3 }[] = []
    const unsub = useStore.subscribe((s, prev) => {
      const a = s.rawAngles
      if (!a || a === prev.rawAngles || !a.thighAccel || !a.shinAccel) return
      samples.push({ thigh: a.thighAccel, shin: a.shinAccel })
    })
    setTimeout(() => {
      unsub()
      if (samples.length < 5 || !isStillWindow(samples, maxSpreadDeg)) return resolve(null)
      resolve({ thigh: mean(samples.map((x) => x.thigh)), shin: mean(samples.map((x) => x.shin)) })
    }, ms)
  })
}

/** The stored profile the wearing check compares against, or null for non-unified calibrations / no stored row. */
export async function wearingProfile(): Promise<CalibrationProfile | null> {
  const { settings } = useStore.getState()
  if (settings.calibrationMethod !== 'unified') return null
  return loadProfileById(settings.calibrationId)
}

/** Samples a still pose and compares it with `profile`; null when the reading is inconclusive (moving or no data). */
export async function wearingCheck(profile: CalibrationProfile): Promise<ReferenceCheck | null> {
  const current = await sampleStillPose(2000)
  return wearingVerdict(profile, current)
}
