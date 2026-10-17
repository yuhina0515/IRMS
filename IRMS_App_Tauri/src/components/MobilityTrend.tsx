// Long-term range-of-motion trend (strategy C). Only records with the same movement set are compared.
import { useCallback, useEffect, useState } from 'react'
import { irms } from '../platform/irmsApi'
import type { MobilityRecordRow } from '@shared/types'
import { comparableTrend, MOVEMENT_ORDER, type MobilityRecord, type MovementId } from '../services/mobilityC'
import { useLocale, useT } from '../i18n'
import { DATE_TIME, formatDateTime, formatNumber } from '../i18n/format'
import { MobilityWizard } from './MobilityWizard'

const toRecord = (r: MobilityRecordRow): MobilityRecord => {
  const ids = r.movementSet.split('+').filter((x): x is MovementId => (MOVEMENT_ORDER as string[]).includes(x))
  let peaks: MobilityRecord['peaks'] = {}
  try {
    peaks = (JSON.parse(r.detail) as { peaks?: MobilityRecord['peaks'] }).peaks ?? {}
  } catch {
    // detail is informational; the total and set key are authoritative
  }
  return { measuredAt: r.measuredAt, movementSet: ids, peaks, totalDeg: r.totalDeg }
}

export function MobilityTrend({ disabled = false }: { disabled?: boolean }): JSX.Element {
  const m = useT()
  const c = m.mobility
  const locale = useLocale()
  const [rows, setRows] = useState<MobilityRecordRow[] | null>(null)
  const [open, setOpen] = useState(false)

  const reload = useCallback((): void => {
    irms.mobility
      .list()
      .then(setRows)
      .catch(() => setRows([]))
  }, [])
  useEffect(reload, [reload])

  const records = (rows ?? []).map(toRecord)
  const latest = records[0] // list() is newest first
  const same = latest ? comparableTrend(records, latest) : []
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
              <p className="field-hint">{c.compareNote}</p>
            </>
          ) : (
            <p>{rows === null ? '' : c.noRecords}</p>
          )}
        </div>
        <button className="btn btn-primary" data-testid="mobility-open" disabled={disabled} onClick={() => setOpen(true)}>
          {c.startMeasure}
        </button>
      </div>
      {same.length > 1 && (
        <ul className="v3-scope" data-testid="mobility-history">
          {same.slice(-8).reverse().map((r) => (
            <li key={r.measuredAt} className="ok">
              {formatDateTime(locale, new Date(r.measuredAt), DATE_TIME)} · {fmt(r.totalDeg)}°
            </li>
          ))}
        </ul>
      )}
      {open && <MobilityWizard onClose={() => setOpen(false)} onSaved={reload} />}
    </>
  )
}
