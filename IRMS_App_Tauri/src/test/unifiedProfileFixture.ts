// Shared fixture: a real unified profile solved from the IMU simulator.
import { captureReference, solveProfile, type CalibrationProfile } from '../services/calibrationCore'
import { between, createRig, kneeCurl, simulate, thighRaise } from '../services/simulation/imuModel'

export function makeUnifiedProfile(): CalibrationProfile {
  const rig = createRig({ seed: 3 })
  const k = kneeCurl(90)
  const t = thighRaise(80)
  const fk = simulate(k.traj, k.durationSec, rig, { seed: 1 })
  const ft = simulate(t.traj, t.durationSec, rig, { seed: 1 })
  const ref = captureReference(between(fk, ...k.still).map((f) => ({ tMs: f.tMs, thigh: f.thighV, shin: f.shinV })), 'straight', 'standing')
  if (!ref.ok) throw new Error(ref.error)
  const out = solveProfile({
    id: 'old',
    createdAt: '2026-10-15T00:00:00.000Z',
    side: 'left',
    firmware: { version: null, rawStream: false },
    reference: ref.reference,
    thighSweep: { samples: ft.map((f) => f.thighV) },
    shinSweep: { samples: fk.map((f) => f.shinV) }
  })
  if (!out.ok) throw new Error(out.failure.error)
  return out.profile
}

