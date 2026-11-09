// Long-term range-of-motion trend (strategy C). Only records with the same movement set are compared.
import { useCallback, useEffect, useState } from 'react'
import { irms } from '../platform/irmsApi'
import type { MobilityRecordRow } from '@shared/types'
import { comparableTrend, MOVEMENT_ORDER, trendWithBreaks, type MobilityRecord, type MovementId } from '../services/mobilityC'
import { useLocale, useT } from '../i18n'
import { DATE_TIME, formatDateTime, formatNumber } from '../i18n/format'
import { MobilityWizard } from './MobilityWizard'
import { CalibrationFlow } from './CalibrationFlow'

const toRecord = (r: MobilityRecordRow): MobilityRecord => {
  const ids = r.movementSet.split('+').filter((x): x is MovementId => (MOVEMENT_ORDER as string[]).includes(x))
  let peaks: MobilityRecord['peaks'] = {}
  let side: MobilityRecord['side'] = null
  try {
    const detail = JSON.parse(r.detail) as { peaks?: MobilityRecord['peaks']; side?: unknown }
    peaks = detail.peaks ?? {}
    if (detail.side === 'left' || detail.side === 'right') side = detail.side
  } catch {
    // detail is informational; the total and set key are authoritative
  }
  return {
    measuredAt: r.measuredAt,
    movementSet: ids,
    peaks,
    totalDeg: r.totalDeg,
    schema: r.schema,
    // Column (migration 10) first; pre-migration wizard rows only carry the side in detail.
    side: r.side ?? side,
    referenceKind: r.referenceKind,
    posture: r.posture,
    calibrationId: r.calibrationId
  }
}

/** `legacy` opens the old mobility wizard (developer toggle); otherwise the unified flow with the mobility preset. */
export function MobilityTrend({ disabled = false, legacy = false }: { disabled?: boolean; legacy?: boolean }): JSX.Element {
  const m = useT()
  const c = m.mobility
  const locale = useLocale()
  const [rows, setRows] = useState<MobilityRecordRow[] | null>(null)
  const [open, setOpen] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const reload = useCallback((): void => {
    setLoadFailed(false)
    irms.mobility
      .list()
      .then(setRows)
      .catch(() => setLoadFailed(true))
  }, [])
  useEffect(reload, [reload])
  // 連線失效即結束這次量測；重連後須重新取得起始姿勢。
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])

  const records = (rows ?? []).map(toRecord)
  const latest = records[0] // list() is newest first
  const same = latest ? comparableTrend(records, latest) : []
  const entries = latest ? trendWithBreaks(records, latest) : []
  const hasBreak = entries.some((e) => e.kind === 'methodBreak')
  const best = same.length ? Math.max(...same.map((r) => r.totalDeg)) : null
  const names = latest ? latest.movementSet.map((id) => c.movementNames[id]).join(m.common.listSeparator) : ''
  const fmt = (n: number): string => formatNumber(locale, n, 0)

  return (
    <>
      <div className="v3-set-row" data-testid="mobility-row">
        <div>
          <strong>{c.viewTitle}</strong>
          {latest ? (
            <>
              <p>
                {c.latest({ total: fmt(latest.totalDeg) })}
                {best != null && ` · ${c.best({ total: fmt(best) })}`}
                {` · ${formatDateTime(locale, new Date(latest.measuredAt), DATE_TIME)}`}
              </p>
              <p>{c.setLabel({ names })}</p>
              {latest.side && <p>{latest.side === 'left' ? m.clinical.terms.leftLeg : m.clinical.terms.rightLeg}</p>}
              <p className="field-hint">{c.compareNote}</p>
            </>
          ) : (
            <p>{rows === null || loadFailed ? '' : c.noRecords}</p>
          )}
          {loadFailed && <p role="alert">{m.history.loadFailed} <button onClick={reload}>{m.common.retry}</button></p>}
        </div>
        <button className="btn btn-primary" data-testid="mobility-open" disabled={disabled} onClick={() => setOpen(true)}>
          {c.startMeasure}
        </button>
      </div>
      {(same.length > 1 || hasBreak) && (
        <ul className="v3-scope" data-testid="mobility-history">
          {entries
            .slice(-10)
            .reverse()
            .map((e, i) =>
              e.kind === 'methodBreak' ? (
                <li key={`break-${i}`} className="warn" data-testid="mobility-method-break">
                  {c.methodBreak}
                </li>
              ) : (
                <li key={e.record.measuredAt} className="ok">
                  {formatDateTime(locale, new Date(e.record.measuredAt), DATE_TIME)} · {fmt(e.record.totalDeg)}°
                </li>
              )
            )}
        </ul>
      )}
      {open && !disabled && legacy && <MobilityWizard onClose={() => setOpen(false)} onSaved={reload} />}
      {open && !disabled && !legacy && <CalibrationFlow preset="mobility" onClose={() => setOpen(false)} onApplied={reload} />}
    </>
  )
}
