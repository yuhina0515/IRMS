// Calibration strategy C wizard: relaxed neutral pose -> one guided sweep-and-hold per movement -> summed record.
// Engine and rationale: services/mobilityC.ts, doc/plans/2026-10-03-calibration-c-plan.md.
// Peaks are recorded automatically on save (no confirmation prompts); nothing here changes alarm limits or Settings.
import { useEffect, useRef, useState } from 'react'
import type { AccelVector } from '@shared/protocol'
import { irms } from '../platform/irmsApi'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import {
  buildMobilityRecord,
  MOVEMENT_ORDER,
  MOVEMENTS,
  solveMovement,
  type MobilityError,
  type MovementId,
  type MovementResult,
  type Neutral
} from '../services/mobilityC'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { getT, rich, useLocale, useT } from '../i18n'
import { formatNumber } from '../i18n/format'

type V3 = AccelVector
const NEUTRAL_SECONDS = 2
const MOVE_SECONDS = 10
const HIP_IDS: MovementId[] = ['hipFlexion', 'hipExtension', 'hipAbduction']

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
}

type Step = { kind: 'intro' } | { kind: 'neutral' } | { kind: 'move'; index: number } | { kind: 'result' }

export function MobilityWizard({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }): JSX.Element {
  const m = useT()
  const c = m.mobility
  const locale = useLocale()
  const showToast = useUiStore((s) => s.showToast)
  const wearSide = useStore((s) => s.settings.wearSide)
  const [side, setSide] = useState<'left' | 'right' | null>(wearSide)
  const [selected, setSelected] = useState<MovementId[]>(MOVEMENT_ORDER)
  const [step, setStep] = useState<Step>({ kind: 'intro' })
  const [capturing, setCapturing] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [results, setResults] = useState<MovementResult[]>([])
  const [saving, setSaving] = useState(false)
  const neutral = useRef<Neutral | null>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    return () => {
      cancelled.current = true
    }
  }, [])
  useEscapeKey(capturing ? null : onClose)

  const plan = MOVEMENT_ORDER.filter((id) => selected.includes(id))
  const nameOf = (id: MovementId): string => c.movementNames[id]

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
        frames.push({ thigh: unitOf(a.thighAccel), shin: unitOf(a.shinAccel) })
      })
      setTimeout(() => {
        unsub()
        resolve()
      }, seconds * 1000)
    })
    setCapturing(false)
    if (cancelled.current) return null
    if (frames.length < 10) {
      setErr(getT().mobility.noData)
      return null
    }
    return frames
  }

  const toggle = (id: MovementId): void =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const advance = (index: number): void => {
    if (index + 1 < plan.length) setStep({ kind: 'move', index: index + 1 })
    else setStep({ kind: 'result' })
  }

  const doCapture = async (): Promise<void> => {
    if (step.kind === 'neutral') {
      const frames = await record(NEUTRAL_SECONDS)
      if (!frames) return
      neutral.current = { thigh: unitOf(mean(frames.map((f) => f.thigh))), shin: unitOf(mean(frames.map((f) => f.shin))) }
      setStep({ kind: 'move', index: 0 })
    } else if (step.kind === 'move' && neutral.current) {
      const id = plan[step.index]
      const spec = MOVEMENTS[id]
      const frames = await record(MOVE_SECONDS)
      if (!frames) return
      const pick = (limb: 'thigh' | 'shin'): V3[] => frames.map((f) => f[limb])
      const out = solveMovement(
        neutral.current,
        { moverSamples: pick(spec.mover), ...(spec.reference ? { referenceSamples: pick(spec.reference) } : {}) },
        spec
      )
      if (!out.ok) {
        setErr(c.errors[out.error satisfies MobilityError])
        return
      }
      setResults((cur) => [...cur.filter((r) => r.movement !== id), out.result])
      advance(step.index)
    }
  }

  const skip = (): void => {
    if (step.kind === 'move') {
      setErr(null)
      advance(step.index)
    }
  }

  const rec = buildMobilityRecord(results, new Date().toISOString())
  const complete = results.length === plan.length

  const save = async (): Promise<void> => {
    if (!rec || saving) return
    setSaving(true)
    try {
      await irms.mobility.add({
        movementSet: rec.movementSet.join('+'),
        totalDeg: rec.totalDeg,
        detail: JSON.stringify({
          peaks: rec.peaks,
          side,
          neutral: neutral.current,
          movements: results.map((r) => ({
            id: r.movement,
            peakDeg: r.peakDeg,
            instantMaxDeg: r.instantMaxDeg,
            hingeAxis: r.hingeAxis,
            planarityDeg: r.planarityDeg,
            spanDeg: r.spanDeg,
            holdSpreadDeg: r.holdSpreadDeg
          }))
        })
      })
      showToast(c.saved, 'success')
      onSaved?.()
      onClose()
    } catch {
      setErr(c.saveFailed)
      setSaving(false)
    }
  }

  const fmt = (n: number): string => formatNumber(locale, n, 0)
  const captureLabel = capturing ? (countdown != null ? `${countdown}…` : c.recording) : c.capture
  const progressTotal = 1 + plan.length

  return (
    <div className="overlay">
      <div className="modal glass" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{c.title}</h3>
          <button className="close-x" onClick={onClose}>
            ×
          </button>
        </div>

        {step.kind === 'intro' && (
          <div className="wizard-step">
            <p className="desc">{rich(c.intro)}</p>
            <p className="desc">{rich(c.painNote)}</p>
            <p className="desc">{c.sideHint}</p>
            <div className="row">
              <button className={`btn ${side === 'left' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSide('left')}>
                {m.clinical.terms.leftLeg}
              </button>
              <button className={`btn ${side === 'right' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSide('right')}>
                {m.clinical.terms.rightLeg}
              </button>
            </div>
            <h4>{c.movementsLabel}</h4>
            {MOVEMENT_ORDER.map((id) => (
              <label key={id} className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={selected.includes(id)} onChange={() => toggle(id)} />
                <span>{nameOf(id)}</span>
              </label>
            ))}
            {selected.some((id) => HIP_IDS.includes(id)) && <p className="desc">{rich(c.hipCaveat)}</p>}
            <button
              className="btn btn-primary"
              disabled={side == null || plan.length === 0}
              onClick={() => setStep({ kind: 'neutral' })}
            >
              {m.common.start}
            </button>
          </div>
        )}

        {(step.kind === 'neutral' || step.kind === 'move') && (
          <div className="wizard-step">
            <p className="metric-sub">
              {c.progress({ n: String(step.kind === 'neutral' ? 1 : step.index + 2), total: String(progressTotal) })}
            </p>
            {step.kind === 'neutral' ? (
              <>
                <h4>{c.neutralTitle}</h4>
                <p className="desc">{c.neutralDesc}</p>
              </>
            ) : (
              <>
                <h4>{nameOf(plan[step.index])}</h4>
                <p className="desc">{c.movementDesc[plan[step.index]]}</p>
                <p className="desc">{rich(c.painNote)}</p>
                {capturing && countdown == null && <p className="desc">{c.moveNow}</p>}
              </>
            )}
            {err && <p className="wizard-err">{err}</p>}
            {countdown != null && <div className="wizard-count">{countdown}</div>}
            <div className="row" style={{ gap: 10 }}>
              <button className="btn btn-primary" disabled={capturing} onClick={() => void doCapture()}>
                {err && step.kind === 'move' ? c.retry : captureLabel}
              </button>
              {step.kind === 'move' && (
                <button className="btn btn-secondary" disabled={capturing} onClick={skip}>
                  {c.skip}
                </button>
              )}
            </div>
          </div>
        )}

        {step.kind === 'result' && (
          <div className="wizard-step">
            <h4>{c.resultTitle}</h4>
            {results.length === 0 && <p className="wizard-err">{c.noData}</p>}
            {MOVEMENT_ORDER.filter((id) => results.some((r) => r.movement === id)).map((id) => (
              <p className="desc" key={id}>
                {c.resultLine({ name: nameOf(id), peak: fmt(results.find((r) => r.movement === id)!.peakDeg) })}
              </p>
            ))}
            {rec && <p className="desc"><b>{c.total({ total: fmt(rec.totalDeg) })}</b></p>}
            {rec && !complete && <p className="desc">{c.incomplete}</p>}
            {err && <p className="wizard-err">{err}</p>}
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-secondary" onClick={onClose}>
                {m.common.cancel}
              </button>
              <button className="btn btn-success" disabled={!rec || saving} onClick={() => void save()}>
                {c.save}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
