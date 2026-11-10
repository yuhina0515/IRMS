// Calibration B (beta) wizard: floor stage (optional, needs the firmware G: stream) -> worn poses -> sagittal sweeps -> solve.
// Engine and rationale: services/calibrationB.ts, doc/plans/2026-10-01-calibration-b-plan.md.
// Nothing is written to settings until the user confirms the result.
import { useEffect, useRef, useState } from 'react'
import type { AccelVector, RawMotion } from '@shared/protocol'
import { useStore, type Settings } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { bluetoothService } from '../services/bluetooth'
import {
  applyAccelBiasScale,
  buildCalibrationPatchB,
  estimateAccelBiasScale,
  type BiasScaleEstimate,
  type Limb,
  type PoseCapture,
  type PoseId,
  type SolveError,
  type SweepCapture
} from '../services/calibrationB'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { getT, rich, useT } from '../i18n'

type V3 = AccelVector
const POSES: PoseId[] = ['standing', 'seated', 'supine', 'sideLying']
const SWEEPS: Limb[] = ['thigh', 'shin']
const FACES = ['+x', '-x', '+y', '-y', '+z', '-z'] as const
const POSE_SECONDS = 2
const SWEEP_SECONDS = 6
const RAW_DETECT_MS = 2500

const mean = (vs: V3[]): V3 => {
  const n = vs.length || 1
  return { x: vs.reduce((s, v) => s + v.x, 0) / n, y: vs.reduce((s, v) => s + v.y, 0) / n, z: vs.reduce((s, v) => s + v.z, 0) / n }
}
const unitOf = (v: V3): V3 => {
  const n = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / n, y: v.y / n, z: v.z / n }
}
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface Frame {
  thigh: V3
  shin: V3
  motion: RawMotion | null
}

type Step =
  | { kind: 'intro' }
  | { kind: 'face'; index: number }
  | { kind: 'pose'; pose: PoseId }
  | { kind: 'sweep'; limb: Limb }
  | { kind: 'result' }

export function CalibrationWizardB({ onClose }: { onClose: () => void }): JSX.Element {
  const m = useT()
  const c = m.calibrationB
  const setSettings = useStore((s) => s.setSettings)
  const showToast = useUiStore((s) => s.showToast)
  const settings = useStore((s) => s.settings)
  const [side, setSide] = useState<'left' | 'right' | null>(settings.wearSide)
  const [hasRaw, setHasRaw] = useState<boolean | null>(null)
  const [step, setStep] = useState<Step>({ kind: 'intro' })
  const [capturing, setCapturing] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<ReturnType<typeof buildCalibrationPatchB> | null>(null)
  const poses = useRef<PoseCapture[]>([])
  const sweeps = useRef<SweepCapture[]>([])
  const faces = useRef<{ thigh: V3[]; shin: V3[] }>({ thigh: [], shin: [] })
  const correction = useRef<{ thigh: BiasScaleEstimate | null; shin: BiasScaleEstimate | null }>({ thigh: null, shin: null })
  const latestMotion = useRef<RawMotion | null>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    const off = bluetoothService.onRawMotion((motion) => {
      latestMotion.current = motion
    })
    void bluetoothService.enableRawStream(true)
    const timer = setTimeout(() => setHasRaw(latestMotion.current !== null), RAW_DETECT_MS)
    return () => {
      cancelled.current = true
      clearTimeout(timer)
      off()
      void bluetoothService.enableRawStream(false)
    }
  }, [])

  useEscapeKey(capturing ? null : onClose)

  /** Collects frames for `seconds`; each frame pairs the latest V: vectors with the latest raw motion. */
  const record = async (seconds: number): Promise<Frame[] | null> => {
    setErr(null)
    setCapturing(true)
    for (let n = 3; n > 0; n--) {
      setCountdown(n)
      await delay(1000)
      if (cancelled.current) return null
    }
    setCountdown(null)
    const frames: Frame[] = []
    await new Promise<void>((resolve) => {
      const unsub = useStore.subscribe((s, prev) => {
        const a = s.rawAngles
        if (!a || a === prev.rawAngles || !a.thighAccel || !a.shinAccel) return
        frames.push({ thigh: a.thighAccel, shin: a.shinAccel, motion: latestMotion.current })
      })
      setTimeout(() => {
        unsub()
        resolve()
      }, seconds * 1000)
    })
    setCapturing(false)
    if (cancelled.current) return null
    if (frames.length < 10) {
      setErr(getT().calibrationB.noData)
      return null
    }
    return frames
  }

  /** Per-limb unit gravity vector for a frame: corrected raw g when the floor stage ran, else the firmware V: vector. */
  const gravity = (f: Frame, limb: Limb): V3 => {
    const raw = f.motion ? (limb === 'thigh' ? f.motion.thighAcc : f.motion.shinAcc) : null
    const corr = correction.current[limb]
    if (raw && corr) return applyAccelBiasScale(raw, corr)
    return unitOf(limb === 'thigh' ? f.thigh : f.shin)
  }

  const next = (from: Step): Step => {
    switch (from.kind) {
      case 'intro':
        return hasRaw ? { kind: 'face', index: 0 } : { kind: 'pose', pose: POSES[0] }
      case 'face':
        if (from.index + 1 < FACES.length) return { kind: 'face', index: from.index + 1 }
        return { kind: 'pose', pose: POSES[0] }
      case 'pose': {
        const i = POSES.indexOf(from.pose)
        return i + 1 < POSES.length ? { kind: 'pose', pose: POSES[i + 1] } : { kind: 'sweep', limb: SWEEPS[0] }
      }
      case 'sweep': {
        const i = SWEEPS.indexOf(from.limb)
        return i + 1 < SWEEPS.length ? { kind: 'sweep', limb: SWEEPS[i + 1] } : { kind: 'result' }
      }
      default:
        return from
    }
  }

  const solve = (): void => {
    if (side == null) return
    const out = buildCalibrationPatchB(poses.current, sweeps.current, undefined, side)
    setResult(out)
    setStep({ kind: 'result' })
  }

  const finishFloor = (): void => {
    for (const limb of SWEEPS) {
      const est = estimateAccelBiasScale(faces.current[limb])
      correction.current[limb] = est.scaleObserved.length === 3 ? est : null
    }
    setStep({ kind: 'pose', pose: POSES[0] })
  }

  const doCapture = async (): Promise<void> => {
    if (step.kind === 'face') {
      const frames = await record(POSE_SECONDS)
      if (!frames) return
      const withRaw = frames.filter((f) => f.motion)
      if (withRaw.length < 10) {
        setErr(getT().calibrationB.noRaw)
        return
      }
      faces.current.thigh.push(mean(withRaw.map((f) => f.motion!.thighAcc)))
      faces.current.shin.push(mean(withRaw.map((f) => f.motion!.shinAcc)))
      if (step.index + 1 >= FACES.length) finishFloor()
      else setStep(next(step))
    } else if (step.kind === 'pose') {
      const frames = await record(POSE_SECONDS)
      if (!frames) return
      const entry: PoseCapture = {
        pose: step.pose,
        thigh: unitOf(mean(frames.map((f) => gravity(f, 'thigh')))),
        shin: unitOf(mean(frames.map((f) => gravity(f, 'shin'))))
      }
      poses.current = [...poses.current.filter((p) => p.pose !== step.pose), entry]
      setStep(next(step))
    } else if (step.kind === 'sweep') {
      const frames = await record(SWEEP_SECONDS)
      if (!frames) return
      const gyro = frames.filter((f) => f.motion).map((f) => (step.limb === 'thigh' ? f.motion!.thighGyro : f.motion!.shinGyro))
      const entry: SweepCapture = {
        limb: step.limb,
        samples: frames.map((f) => gravity(f, step.limb)),
        ...(gyro.length >= 10 ? { gyro } : {})
      }
      sweeps.current = [...sweeps.current.filter((s) => s.limb !== step.limb), entry]
      if (next(step).kind === 'result') solve()
      else setStep(next(step))
    }
  }

  const apply = (): void => {
    if (!result || !result.ok) return
    setSettings({ ...result.patch, wearSide: side, lastCalibratedAt: new Date().toISOString() })
    showToast(m.calibration.applied, 'success')
    onClose()
  }

  const errorText = (e: SolveError): string => c.errors[e]
  const legName = (limb: Limb): string => (limb === 'thigh' ? m.clinical.terms.thigh : m.clinical.terms.shin)
  const captureLabel = capturing ? (countdown != null ? `${countdown}…` : c.recording) : c.capture
  const progressTotal = (hasRaw ? FACES.length : 0) + POSES.length + SWEEPS.length

  return (
    <div className="overlay">
      <div className="modal glass" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {c.title} <span className="badge" data-testid="calib-b-beta">{c.beta}</span>
          </h3>
          <button className="close-x" onClick={onClose}>
            ×
          </button>
        </div>

        {step.kind === 'intro' && (
          <div className="wizard-step">
            <p className="desc">{rich(c.intro)}</p>
            <p className="desc">{rich(c.sideHint)}</p>
            <div className="row">
              <button className={`btn ${side === 'left' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSide('left')}>
                {m.clinical.terms.leftLeg}
              </button>
              <button className={`btn ${side === 'right' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSide('right')}>
                {m.clinical.terms.rightLeg}
              </button>
            </div>
            {hasRaw === null && <p className="desc">{c.rawChecking}</p>}
            {hasRaw === true && <p className="desc">{c.rawOn}</p>}
            {hasRaw === false && <p className="wizard-err">{c.rawOff}</p>}
            <button
              className="btn btn-primary"
              disabled={side == null || hasRaw === null}
              onClick={() => setStep(next(step))}
            >
              {m.common.start}
            </button>
          </div>
        )}

        {step.kind !== 'intro' && step.kind !== 'result' && (
          <div className="wizard-step">
            <p className="metric-sub">
              {c.progress({
                n: String(
                  step.kind === 'face'
                    ? step.index + 1
                    : step.kind === 'pose'
                      ? (hasRaw ? FACES.length : 0) + POSES.indexOf(step.pose) + 1
                      : (hasRaw ? FACES.length : 0) + POSES.length + SWEEPS.indexOf(step.limb) + 1
                ),
                total: String(progressTotal)
              })}
            </p>
            {step.kind === 'face' && (
              <>
                <h4>{c.floorTitle}</h4>
                <p className="desc">{rich(c.faceDesc({ face: c.faces[FACES[step.index]] }))}</p>
                <button className="btn btn-secondary btn-sm" disabled={capturing} onClick={() => setStep({ kind: 'pose', pose: POSES[0] })}>
                  {c.skipFloor}
                </button>
              </>
            )}
            {step.kind === 'pose' && (
              <>
                <h4>{c.poses[step.pose].title}</h4>
                <p className="desc">{rich(c.poses[step.pose].desc)}</p>
              </>
            )}
            {step.kind === 'sweep' && (
              <>
                <h4>{c.sweepTitle({ limb: legName(step.limb) })}</h4>
                <p className="desc">{rich(c.sweeps[step.limb])}</p>
                {hasRaw === false && <p className="desc">{c.gyroMissing}</p>}
              </>
            )}
            {err && <p className="wizard-err">{err}</p>}
            {countdown != null && <div className="wizard-count">{countdown}</div>}
            <button className="btn btn-primary" disabled={capturing} onClick={() => void doCapture()}>
              {captureLabel}
            </button>
          </div>
        )}

        {step.kind === 'result' && result && (
          <div className="wizard-step">
            {!result.ok && (
              <>
                <p className="wizard-err">{c.failed({ limb: legName(result.limb), reason: errorText(result.error) })}</p>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    poses.current = []
                    sweeps.current = []
                    setResult(null)
                    setStep({ kind: 'pose', pose: POSES[0] })
                  }}
                >
                  {m.calibration.recalibrate}
                </button>
              </>
            )}
            {result.ok && (
              <>
                <h4>{c.resultTitle}</h4>
                {([['thigh', result.thigh], ['shin', result.shin]] as const).map(([limb, sol]) => (
                  <p className="desc" key={limb}>
                    {c.resultLine({
                      limb: legName(limb),
                      confidence: c.confidence[sol.confidence],
                      rms: sol.rmsDeg.toFixed(1),
                      gyro: sol.hingeUsedGyro ? c.gyroUsed : c.gyroNotUsed
                    })}
                    {sol.warnings.length > 0 && ` ${sol.warnings.map(errorText).join(m.common.listSeparator)}`}
                    {sol.rejected.length > 0 && ` ${c.rejected({ poses: sol.rejected.join(m.common.listSeparator) })}`}
                  </p>
                ))}
                <p className="desc">{rich(c.unverified)}</p>
                <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
                  <button className="btn btn-secondary" onClick={onClose}>
                    {m.common.cancel}
                  </button>
                  <button className="btn btn-success" onClick={apply}>
                    {m.calibration.apply}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export type { Settings }
