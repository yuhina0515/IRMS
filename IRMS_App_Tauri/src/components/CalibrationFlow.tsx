// Unified calibration flow (plan section 3.3): Prepare -> Reference -> Movement[i] -> Review -> Apply or Discard.
// State transitions live in services/calibrationFlow.ts; this component owns timers, the BLE streams and the DOM.
// Nothing is written to settings or the database until the user presses Apply. A lost connection or a started
// session closes the flow and discards everything.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { RawMotion } from '@shared/protocol'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { bluetoothService } from '../services/bluetooth'
import { newCalibrationId } from '../services/calibration'
import {
  captureReference,
  compileProfile,
  type CalibrationProfile,
  type Frame,
  type MovementId
} from '../services/calibrationCore'
import type { ReferencePosture } from '@shared/types'
import {
  flowReducer,
  initialFlow,
  isMandatory,
  isStillWindow,
  mobilityRecordFromResults,
  needsLegacyBranch,
  presetMovements,
  recaptureNeedsConfirm,
  rezeroProfile,
  solveFlow,
  type FlowOutcome,
  type Preset
} from '../services/calibrationFlow'
import { loadProfileById } from '../services/calibrationRuntime'
import { MOBILITY_UNIFIED_SCHEMA } from '../services/mobilityC'
import { speak } from '../services/voice'
import { irms } from '../platform/irmsApi'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { rich, useT } from '../i18n'
import { CalibrationWizard } from './CalibrationWizard'

const POSTURES: ReferencePosture[] = ['standing', 'longSitting', 'supine', 'seated', 'other']
const REFERENCE_SECONDS = 2
const MOVEMENT_SECONDS = 10
const COUNTDOWN_SECONDS = 3
const AUTO_STILL_MS = 1500
const AUTO_STILL_DEG = 2
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function CalibrationFlow({
  preset: initialPreset = 'calibrate',
  onClose,
  onApplied
}: {
  preset?: Preset
  onClose: () => void
  onApplied?: () => void
}): JSX.Element {
  const m = useT()
  const c = m.calibrationFlow
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const isConnected = useStore((s) => s.isConnected)
  const linkTruncated = useStore((s) => s.linkTruncated)
  const sessionRunning = useStore((s) => s.session.running)
  const showToast = useUiStore((s) => s.showToast)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const legacy = needsLegacyBranch(settings.firmwareProtocol, linkTruncated)

  const [flow, dispatch] = useReducer(flowReducer, undefined, () => initialFlow(initialPreset, settings.wearSide))
  const [posture, setPosture] = useState<ReferencePosture>('standing')
  const [capturing, setCapturing] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [stored, setStored] = useState<CalibrationProfile | null | undefined>(undefined)
  const [saveMobility, setSaveMobility] = useState(true)
  const [saving, setSaving] = useState(false)
  const latestMotion = useRef<RawMotion | null>(null)
  const cancelled = useRef(false)
  const autoTried = useRef<string>('')
  const newId = useRef(newCalibrationId())

  const quick = flow.preset === 'quickRezero'
  const list = presetMovements(flow.preset)

  // Raw stream (gyro + linear-acceleration gate) when the firmware has it; the flow works without it.
  useEffect(() => {
    cancelled.current = false
    const off = bluetoothService.onRawMotion((motion) => {
      latestMotion.current = motion
    })
    void bluetoothService.enableRawStream(true)
    return () => {
      cancelled.current = true
      off()
      void bluetoothService.enableRawStream(false)
    }
  }, [])

  // Quick re-zero needs the stored profile of the calibration currently applied.
  useEffect(() => {
    if (!quick) return
    let live = true
    void loadProfileById(settings.calibrationId).then((p) => {
      if (!live) return
      setStored(p)
      if (p) dispatch({ type: 'setSide', side: p.side })
    })
    return () => {
      live = false
    }
  }, [quick, settings.calibrationId])

  // Any disconnect or session start abandons the flow without writing anything.
  const startedConnected = useRef(isConnected)
  useEffect(() => {
    if ((startedConnected.current && !isConnected) || sessionRunning) {
      cancelled.current = true
      showToast(c.cancelledLink, 'warning')
      onClose()
    }
  }, [isConnected, sessionRunning, onClose, showToast, c.cancelledLink])

  useEscapeKey(capturing ? null : onClose)

  const kind = flow.neutral ? 'neutral' : 'straight'
  const refPosture: ReferencePosture = quick && stored ? stored.reference.posture : posture
  const refKind = quick && stored ? stored.reference.kind : kind

  /** Collects timestamped frames for `seconds` after an optional countdown. */
  const record = useCallback(async (seconds: number, countdownSec: number): Promise<Frame[] | null> => {
    setErr(null)
    setCapturing(true)
    for (let n = countdownSec; n > 0; n--) {
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
        const mo = latestMotion.current
        frames.push({
          tMs: Date.now(),
          thigh: a.thighAccel,
          shin: a.shinAccel,
          ...(mo ? { thighGyro: mo.thighGyro, shinGyro: mo.shinGyro, thighRawG: mo.thighAcc, shinRawG: mo.shinAcc } : {})
        })
      })
      setTimeout(() => {
        unsub()
        resolve()
      }, seconds * 1000)
    })
    setCapturing(false)
    if (cancelled.current) return null
    if (frames.length < 10) {
      setErr(c.noData)
      return null
    }
    return frames
  }, [c.noData])

  const captureRef = useCallback(
    async (countdownSec: number): Promise<void> => {
      speak(c.referenceTitle)
      const frames = await record(REFERENCE_SECONDS, countdownSec)
      if (!frames) return
      const out = captureReference(frames, refKind, refPosture)
      if (!out.ok) {
        setErr(c.referenceErrors[out.error])
        return
      }
      dispatch({ type: 'referenceCaptured', reference: out.reference })
    },
    [record, refKind, refPosture, c.referenceTitle, c.referenceErrors]
  )

  const captureMove = async (id: MovementId): Promise<void> => {
    speak(c.moveNow)
    const frames = await record(MOVEMENT_SECONDS, COUNTDOWN_SECONDS)
    if (frames) dispatch({ type: 'movementCaptured', id, frames })
  }

  // Hands-free reference: once the legs have been still for AUTO_STILL_MS, capture without a button press.
  // One automatic attempt per reference step; a failed capture falls back to the manual button.
  const refStepKey = 'reference'
  useEffect(() => {
    if (flow.step.kind !== 'reference' || capturing || (quick && !stored)) return
    if (autoTried.current === refStepKey) return
    let window: { t: number; thigh: Frame['thigh']; shin: Frame['shin'] }[] = []
    const unsub = useStore.subscribe((s, prev) => {
      const a = s.rawAngles
      if (!a || a === prev.rawAngles || !a.thighAccel || !a.shinAccel) return
      const now = Date.now()
      window = [...window.filter((w) => now - w.t <= AUTO_STILL_MS), { t: now, thigh: a.thighAccel, shin: a.shinAccel }]
      if (window.length < 8 || now - window[0].t < AUTO_STILL_MS * 0.9) return
      if (!isStillWindow(window, AUTO_STILL_DEG)) {
        window = [window[window.length - 1]]
        return
      }
      autoTried.current = refStepKey
      unsub()
      void captureRef(0)
    })
    return unsub
  }, [flow.step.kind, capturing, quick, stored, refStepKey, captureRef])

  const solved = useMemo(() => {
    if (flow.step.kind !== 'review' || quick) return null
    return solveFlow(flow, {
      id: newId.current,
      createdAt: new Date().toISOString(),
      firmware: { version: null, rawStream: latestMotion.current != null }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow])

  const rezeroed = useMemo(() => {
    if (flow.step.kind !== 'review' || !quick || !stored || !flow.reference) return null
    return rezeroProfile(stored, flow.reference, { id: newId.current, createdAt: new Date().toISOString() })
  }, [flow, quick, stored])

  const outcome: FlowOutcome | null = solved && solved.ok ? solved.outcome : null
  const profile: CalibrationProfile | null = quick ? (rezeroed && rezeroed.ok ? rezeroed.profile : null) : (outcome?.profile ?? null)

  const legName = (limb: 'thigh' | 'shin'): string => (limb === 'thigh' ? m.clinical.terms.thigh : m.clinical.terms.shin)

  const reviewError = ((): string | null => {
    if (flow.step.kind !== 'review') return null
    if (quick) return rezeroed && !rezeroed.ok ? c.solveFailed({ limb: legName(rezeroed.limb), reason: c.limbErrors[rezeroed.error === 'referenceOffPlane' ? 'referenceOffPlane' : 'invalidInput'] }) : null
    if (!solved) return null
    if (solved.ok) return null
    return solved.failure.kind === 'missing'
      ? c.missing[solved.failure.what]
      : c.solveFailed({ limb: legName(solved.failure.failure.limb), reason: c.limbErrors[solved.failure.failure.error] })
  })()

  const apply = async (): Promise<void> => {
    if (!profile || saving) return
    setSaving(true)
    setErr(null)
    const side = profile.side
    // Write first: the live settings change only once the profile row is stored, so a failed write cannot leave
    // the device running a calibration that exists nowhere on disk (and cannot be re-zeroed or audited later).
    try {
      await irms.calibrationProfiles.add({ id: profile.id, side, profile: JSON.stringify(profile), active: true })
    } catch {
      setSaving(false)
      setErr(c.applyFailed)
      showToast(c.applyFailed, 'error')
      return
    }
    setSettings({ ...compileProfile(profile), calibrationId: profile.id, wearSide: side, lastCalibratedAt: profile.createdAt })
    let mobilityOk = true
    if (!quick && flow.preset === 'mobility' && saveMobility && outcome) {
      try {
        const rec = mobilityRecordFromResults(outcome.results, new Date().toISOString(), {
          schema: MOBILITY_UNIFIED_SCHEMA,
          side,
          referenceKind: profile.reference.kind,
          posture: profile.reference.posture,
          calibrationId: profile.id
        })
        if (rec) {
          await irms.mobility.add({
            movementSet: rec.movementSet.join('+'),
            totalDeg: rec.totalDeg,
            detail: JSON.stringify({ peaks: rec.peaks, side, neutral: profile.reference.kind === 'neutral', movements: outcome.results }),
            schema: MOBILITY_UNIFIED_SCHEMA,
            side,
            referenceKind: profile.reference.kind,
            posture: profile.reference.posture,
            calibrationId: profile.id
          })
        }
      } catch {
        mobilityOk = false
      }
    }
    showToast(mobilityOk ? c.applied : c.mobilityNotSaved, mobilityOk ? 'success' : 'warning')
    onApplied?.()
    onClose()
  }

  const recapture = async (): Promise<void> => {
    if (recaptureNeedsConfirm(flow) && !(await requestConfirm(c.recaptureConfirmTitle, c.recaptureConfirmBody))) return
    autoTried.current = ''
    setErr(null)
    dispatch({ type: 'recaptureReference' })
  }

  if (flow.step.kind === 'legacy') return <CalibrationWizard onClose={onClose} />

  const captureLabel = capturing ? (countdown != null ? `${countdown}…` : c.recording) : c.capture
  const total = 1 + list.length
  const stepNumber = flow.step.kind === 'reference' ? 1 : flow.step.kind === 'movement' ? 2 + flow.step.index : total
  const quickWaiting = quick && stored === undefined

  return (
    <div className="overlay">
      <div className="modal glass" data-testid="calibration-flow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{c.title}</h3>
          <button className="close-x" onClick={onClose} disabled={capturing}>
            ×
          </button>
        </div>

        {flow.step.kind === 'prepare' && (
          <div className="wizard-step">
            {legacy && (
              <>
                <h4>{c.legacyTitle}</h4>
                <p className="desc">{c.legacyDesc}</p>
              </>
            )}
            <p className="desc">{rich(c.intro)}</p>
            <div className="row" role="group" aria-label={c.presetLabel}>
              {(['calibrate', 'mobility', 'quickRezero'] as Preset[]).map((p) => (
                <button
                  key={p}
                  className={`btn ${flow.preset === p ? 'btn-primary' : 'btn-secondary'}`}
                  data-testid={`flow-preset-${p}`}
                  onClick={() => dispatch({ type: 'setPreset', preset: p })}
                >
                  {c.presets[p].name}
                </button>
              ))}
            </div>
            <p className="desc">{c.presets[flow.preset].desc}</p>
            {!quick && (
              <>
                <p className="desc">{c.sideHint}</p>
                <div className="row">
                  <button className={`btn ${flow.side === 'left' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => dispatch({ type: 'setSide', side: 'left' })}>
                    {m.clinical.terms.leftLeg}
                  </button>
                  <button className={`btn ${flow.side === 'right' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => dispatch({ type: 'setSide', side: 'right' })}>
                    {m.clinical.terms.rightLeg}
                  </button>
                </div>
                <label className="field-hint">
                  <input
                    type="checkbox"
                    data-testid="flow-neutral"
                    checked={flow.neutral}
                    onChange={(e) => dispatch({ type: 'setNeutral', neutral: e.target.checked })}
                  />{' '}
                  {c.neutralLabel}
                </label>
                {flow.neutral && <p className="field-hint">{c.neutralHint}</p>}
                <label className="field-hint">
                  {c.postureLabel}{' '}
                  <select value={posture} onChange={(e) => setPosture(e.target.value as ReferencePosture)}>
                    {POSTURES.map((p) => (
                      <option key={p} value={p}>
                        {c.postures[p]}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {quick && stored === null && <p className="wizard-err">{c.noProfile}</p>}
            <button
              className="btn btn-primary"
              data-testid="flow-start"
              disabled={flow.side == null || quickWaiting || (quick && stored === null)}
              onClick={() => dispatch({ type: 'start', legacy })}
            >
              {c.start}
            </button>
          </div>
        )}

        {flow.step.kind === 'reference' && (
          <div className="wizard-step">
            <p className="metric-sub">{c.progress({ n: String(stepNumber), total: String(total) })}</p>
            <h4>{c.referenceTitle}</h4>
            <p className="desc">{rich(refKind === 'neutral' ? c.referenceNeutral : c.referenceStraight)}</p>
            <p className="field-hint">{c.handsFree({ sec: String(AUTO_STILL_MS / 1000) })}</p>
            {err && <p className="wizard-err">{err}</p>}
            {countdown != null && <div className="wizard-count">{countdown}</div>}
            <button className="btn btn-primary" data-testid="flow-capture" disabled={capturing} onClick={() => void captureRef(COUNTDOWN_SECONDS)}>
              {captureLabel}
            </button>
          </div>
        )}

        {flow.step.kind === 'movement' && (() => {
          const id = list[flow.step.index]
          return (
            <div className="wizard-step">
              <p className="metric-sub">{c.progress({ n: String(stepNumber), total: String(total) })}</p>
              <h4>{c.movementTitle({ name: m.mobility.movementNames[id] })}</h4>
              <p className="desc">{m.mobility.movementDesc[id]}</p>
              <p className="field-hint">{isMandatory(id) ? c.mandatoryNote : c.optionalNote}</p>
              {err && <p className="wizard-err">{err}</p>}
              {countdown != null && <div className="wizard-count">{countdown}</div>}
              <div className="row">
                <button className="btn btn-primary" data-testid="flow-capture" disabled={capturing} onClick={() => void captureMove(id)}>
                  {captureLabel}
                </button>
                {!isMandatory(id) && (
                  <button className="btn btn-secondary" data-testid="flow-skip" disabled={capturing} onClick={() => dispatch({ type: 'skip', id })}>
                    {c.skip}
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" data-testid="flow-recapture" disabled={capturing} onClick={() => void recapture()}>
                  {c.recapture}
                </button>
              </div>
            </div>
          )
        })()}

        {flow.step.kind === 'review' && (
          <div className="wizard-step">
            <h4>{c.reviewTitle}</h4>
            {reviewError && <p className="wizard-err">{reviewError}</p>}
            {err && <p className="wizard-err">{err}</p>}
            {profile && (
              <>
                <p className="desc">{c.quality[profile.quality.level]}</p>
                {profile.quality.warnings.map((w) => (
                  <p className="field-hint" key={w}>
                    {w in c.warnings ? c.warnings[w as keyof typeof c.warnings] : w}
                  </p>
                ))}
              </>
            )}
            {outcome?.results.map((r) => (
              <p className="desc" key={r.movement}>
                {c.resultLine({ name: m.mobility.movementNames[r.movement], peak: r.peakDeg.toFixed(0) })}
                {r.warnings.includes('referenceDrift') && ` ${c.driftWarn}`}
              </p>
            ))}
            {outcome?.failed.map((f) => (
              <p className="wizard-err" key={f.id}>
                {m.mobility.movementNames[f.id]}: {c.movementErrors[f.error]}{' '}
                <button className="btn btn-secondary btn-sm" onClick={() => dispatch({ type: 'backToMovement', index: list.indexOf(f.id) })}>
                  {c.redo}
                </button>
              </p>
            ))}
            {!quick && flow.preset === 'mobility' && outcome && outcome.results.length > 0 && (
              <label className="field-hint">
                <input type="checkbox" checked={saveMobility} onChange={(e) => setSaveMobility(e.target.checked)} /> {c.saveMobility}
              </label>
            )}
            <p className="field-hint">{c.unverified}</p>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-secondary btn-sm" data-testid="flow-recapture" onClick={() => void recapture()}>
                {c.recapture}
              </button>
              <button className="btn btn-secondary" data-testid="flow-discard" onClick={onClose}>
                {c.discard}
              </button>
              <button className="btn btn-success" data-testid="flow-apply" disabled={!profile || saving} onClick={() => void apply()}>
                {c.apply}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

