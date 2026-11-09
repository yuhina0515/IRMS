// Pure state machine and solve glue for the unified calibration flow (plan section 3.3).
// The component (components/CalibrationFlow.tsx) owns timers, the BLE streams and the DOM; everything that decides
// WHICH step comes next, what a skip or a re-capture discards, and what gets solved lives here so it is unit tested.
// Nothing in this module writes settings or the database: the flow only produces a profile the user may apply.
import {
  MOVEMENTS,
  checkReference,
  evaluateMovement,
  rezeroLimb,
  solveProfile,
  type CalibrationProfile,
  type Frame,
  type MovementError,
  type MovementId,
  type MovementResult,
  type Reference,
  type ReferenceCheck,
  type Side,
  type SolveError
} from './calibrationCore'
import type { MobilityIdentity, MobilityRecord } from './mobilityC'
import type { AccelVector } from '@shared/protocol'

type V3 = AccelVector

export type Preset = 'calibrate' | 'mobility' | 'quickRezero'

/** Order matters: knee flexion first (mandatory), then the thigh sweep, then the optional mobility movements. */
export function presetMovements(preset: Preset): MovementId[] {
  switch (preset) {
    case 'calibrate':
      return ['kneeFlexion', 'hipFlexion']
    case 'mobility':
      return ['kneeFlexion', 'hipFlexion', 'hipExtension', 'hipAbduction']
    case 'quickRezero':
      return []
  }
}

/** Only the knee sweep is required: it defines the shin frame. Everything else may be skipped (shin-only profile). */
export function isMandatory(id: MovementId): boolean {
  return id === 'kneeFlexion'
}

/** Vector-protocol firmware over a link that delivers roll. Anything else takes the legacy Euler branch. */
export function needsLegacyBranch(firmwareProtocol: 'vector' | 'euler' | null, linkTruncated: boolean): boolean {
  return firmwareProtocol === 'euler' || linkTruncated
}

export type FlowStep =
  | { kind: 'prepare' }
  | { kind: 'reference' }
  | { kind: 'movement'; index: number }
  | { kind: 'review' }
  | { kind: 'legacy' }

export interface FlowState {
  step: FlowStep
  preset: Preset
  side: Side | null
  /** "Cannot fully straighten": the reference is recorded as `neutral`, which withholds the upright-only features. */
  neutral: boolean
  reference: Reference | null
  captured: Partial<Record<MovementId, Frame[]>>
  skipped: MovementId[]
}

export function initialFlow(preset: Preset, side: Side | null): FlowState {
  return { step: { kind: 'prepare' }, preset, side, neutral: false, reference: null, captured: {}, skipped: [] }
}

export type FlowAction =
  | { type: 'setSide'; side: Side }
  | { type: 'setPreset'; preset: Preset }
  | { type: 'setNeutral'; neutral: boolean }
  | { type: 'start'; legacy: boolean }
  | { type: 'referenceCaptured'; reference: Reference }
  | { type: 'movementCaptured'; id: MovementId; frames: Frame[] }
  | { type: 'skip'; id: MovementId }
  | { type: 'recaptureReference' }
  | { type: 'backToMovement'; index: number }

function afterMovement(state: FlowState, index: number): FlowStep {
  const list = presetMovements(state.preset)
  return index + 1 < list.length ? { kind: 'movement', index: index + 1 } : { kind: 'review' }
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'setSide':
      // The side is part of the profile identity; changing it invalidates anything captured so far.
      if (state.step.kind !== 'prepare') return state
      return { ...state, side: action.side }
    case 'setPreset':
      if (state.step.kind !== 'prepare') return state
      return { ...state, preset: action.preset }
    case 'setNeutral':
      if (state.step.kind !== 'prepare') return state
      return { ...state, neutral: action.neutral }
    case 'start':
      if (state.step.kind !== 'prepare' || state.side == null) return state
      return { ...state, step: action.legacy ? { kind: 'legacy' } : { kind: 'reference' } }
    case 'referenceCaptured': {
      if (state.step.kind !== 'reference') return state
      const first = presetMovements(state.preset).length > 0
      return { ...state, reference: action.reference, step: first ? { kind: 'movement', index: 0 } : { kind: 'review' } }
    }
    case 'movementCaptured': {
      if (state.step.kind !== 'movement') return state
      const list = presetMovements(state.preset)
      if (list[state.step.index] !== action.id) return state
      return {
        ...state,
        captured: { ...state.captured, [action.id]: action.frames },
        skipped: state.skipped.filter((s) => s !== action.id),
        step: afterMovement(state, state.step.index)
      }
    }
    case 'skip': {
      if (state.step.kind !== 'movement') return state
      const list = presetMovements(state.preset)
      if (list[state.step.index] !== action.id || isMandatory(action.id)) return state
      const { [action.id]: _dropped, ...rest } = state.captured
      void _dropped
      return { ...state, captured: rest, skipped: [...state.skipped.filter((s) => s !== action.id), action.id], step: afterMovement(state, state.step.index) }
    }
    case 'recaptureReference':
      // Every movement was measured against the old reference, so none of them may survive a new one.
      if (state.step.kind !== 'movement' && state.step.kind !== 'review') return state
      return { ...state, reference: null, captured: {}, skipped: [], step: { kind: 'reference' } }
    case 'backToMovement': {
      if (state.step.kind !== 'review') return state
      const list = presetMovements(state.preset)
      if (action.index < 0 || action.index >= list.length) return state
      return { ...state, step: { kind: 'movement', index: action.index } }
    }
  }
}

/** Whether re-capturing the reference would throw away work, so the UI must ask first. */
export function recaptureNeedsConfirm(state: FlowState): boolean {
  return Object.keys(state.captured).length > 0 || state.skipped.length > 0
}

export type SolveFailure = { kind: 'solve'; failure: SolveError } | { kind: 'missing'; what: 'reference' | 'side' | 'kneeFlexion' }

export interface FlowOutcome {
  profile: CalibrationProfile
  /** Movements that evaluated cleanly (peak held). Used for the optional mobility record. */
  results: MovementResult[]
  /** Movements that were captured but rejected, with the reason, so the review can offer a redo. */
  failed: { id: MovementId; error: MovementError }[]
}

const gyroOf = (frames: Frame[], key: 'thighGyro' | 'shinGyro'): V3[] | undefined => {
  const g = frames.map((f) => f[key])
  return g.every((v): v is V3 => v != null) && g.length > 0 ? (g as V3[]) : undefined
}

/**
 * Solve the profile from the captured sweeps and evaluate every captured movement against it.
 * The knee sweep defines the shin frame and the hip-flexion sweep (when not skipped) the thigh frame.
 */
export function solveFlow(
  state: FlowState,
  ctx: { id: string; createdAt: string; firmware: { version: string | null; rawStream: boolean } }
): { ok: true; outcome: FlowOutcome } | { ok: false; failure: SolveFailure } {
  if (!state.reference) return { ok: false, failure: { kind: 'missing', what: 'reference' } }
  if (!state.side) return { ok: false, failure: { kind: 'missing', what: 'side' } }
  const knee = state.captured.kneeFlexion
  if (!knee) return { ok: false, failure: { kind: 'missing', what: 'kneeFlexion' } }
  const hip = state.captured.hipFlexion
  const out = solveProfile({
    id: ctx.id,
    createdAt: ctx.createdAt,
    side: state.side,
    firmware: ctx.firmware,
    reference: state.reference,
    shinSweep: { samples: knee.map((f) => f.shin), gyro: gyroOf(knee, 'shinGyro') },
    ...(hip ? { thighSweep: { samples: hip.map((f) => f.thigh), gyro: gyroOf(hip, 'thighGyro') } } : {})
  })
  if (!out.ok) return { ok: false, failure: { kind: 'solve', failure: out.failure } }
  const results: MovementResult[] = []
  const failed: FlowOutcome['failed'] = []
  for (const id of Object.keys(state.captured) as MovementId[]) {
    const frames = state.captured[id]
    if (!frames || !(id in MOVEMENTS)) continue
    const ev = evaluateMovement(out.profile, id, frames)
    if (ev.ok) results.push(ev.result)
    else failed.push({ id, error: ev.error })
  }
  return { ok: true, outcome: { profile: out.profile, results, failed } }
}

/**
 * Quick re-zero: keep the stored hinge axes, replace the reference with a fresh still pose (same kind and posture as
 * the stored profile) and re-orthogonalise each limb's zero. A pose off the hinge plane is refused, never forced.
 */
export function rezeroProfile(
  profile: CalibrationProfile,
  reference: Reference,
  ctx: { id: string; createdAt: string }
): { ok: true; profile: CalibrationProfile } | { ok: false; limb: 'thigh' | 'shin'; error: 'referenceOffPlane' | 'invalidInput' } {
  const shin = rezeroLimb(profile.limbs.shin, reference.shin)
  if (!shin.ok) return { ok: false, limb: 'shin', error: shin.error }
  let thigh = profile.limbs.thigh
  if (thigh) {
    const t = rezeroLimb(thigh, reference.thigh)
    if (!t.ok) return { ok: false, limb: 'thigh', error: t.error }
    thigh = t.frame
  }
  return {
    ok: true,
    profile: {
      ...profile,
      id: ctx.id,
      createdAt: ctx.createdAt,
      reference: { ...reference, kind: profile.reference.kind, posture: profile.reference.posture },
      limbs: { thigh, shin: shin.frame }
    }
  }
}

/** Pre-session wearing check result for the stored profile; null when no profile or no live vectors. */
export function wearingVerdict(profile: CalibrationProfile | null, current: { thigh: V3; shin: V3 } | null): ReferenceCheck | null {
  if (!profile || !current) return null
  return checkReference(profile, current)
}

/** Median-free quick check that a window of live vectors is still enough to use as a reference. */
export function isStillWindow(frames: { thigh: V3; shin: V3 }[], maxSpreadDeg: number): boolean {
  if (frames.length < 2) return false
  const ang = (a: V3, b: V3): number => {
    const d = a.x * b.x + a.y * b.y + a.z * b.z
    const n = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z)
    return n === 0 ? 180 : (Math.acos(Math.max(-1, Math.min(1, d / n))) * 180) / Math.PI
  }
  const first = frames[0]
  return frames.every((f) => ang(f.thigh, first.thigh) <= maxSpreadDeg && ang(f.shin, first.shin) <= maxSpreadDeg)
}

/**
 * Mobility record from unified-core results. Refuses an empty or duplicated set so a partial sum is never saved as
 * a total, mirroring the legacy builder (the two result types differ, hence a separate function).
 */
export function mobilityRecordFromResults(results: MovementResult[], measuredAt: string, identity: MobilityIdentity): MobilityRecord | null {
  if (results.length === 0) return null
  const peaks: Partial<Record<MovementId, number>> = {}
  for (const r of results) peaks[r.movement] = r.peakDeg
  const movementSet = (Object.keys(peaks) as MovementId[]).sort()
  if (movementSet.length !== results.length) return null
  return { measuredAt, movementSet, peaks, totalDeg: movementSet.reduce((s, id) => s + (peaks[id] ?? 0), 0), ...identity }
}
