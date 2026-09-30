// renderer/views/HistoryView.tsx
// UI v3 療程紀錄 (PROPOSAL §4 History, §7): a paged session list, and a full-page review that
// replaces the old modal. Statistics come from full-resolution readings; the chart shows only
// the judged metric (the Varus/Valgus overlay is gone — roll is not validated anatomy).
import { useEffect, useRef, useState } from 'react'
import { Chart } from '../services/chartSetup'
import { useUiStore } from '../store/useUiStore'
import { chartTheme } from '../services/theme'
import type { Session, StoredReading } from '@shared/types'
import { computeMetricZone, metricInfo, type MetricZone } from '../services/movementMetric'
import { analyzeSession, type SessionAnalysis } from '../services/sessionAnalysis'
import { calibrationDrift, parseCalibrationSnapshot } from '../services/calibration'
import { useStore } from '../store/useStore'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { usePageSize } from '../hooks/usePageSize'
import { irms } from '../platform/irmsApi'
import { DATE_TIME, TIME_SECONDS, formatDateTime, formatNumber, t, useLocale, useT } from '../i18n'

/** 圖表抽樣後的目標點數:視覺上足夠細緻,又遠低於會拖垮 Chart.js 的量級 */
const CHART_MAX_POINTS = 1200
const ROW_HEIGHT = 56

/** 畫出/分析「這場實際被判定的那個指標」。舊資料沒有 triggerType 快照,退回膝角。 */
function sessionMetricOf(session: Session, r: StoredReading): number | null {
  return session.triggerType === 'segment_elevation'
    ? r.proximalAngle
    : session.triggerType === 'segment_extension'
      ? r.proximalAngle == null
        ? null
        : -r.proximalAngle
      : r.kneeAngle
}

function sessionZone(session: Session): MetricZone | null {
  return session.targetAngle != null && session.tolerance != null
    ? computeMetricZone({
        targetAngle: session.targetAngle,
        tolerance: session.tolerance,
        holdTimeMs: session.holdTimeMs ?? 2000,
        triggerType: session.triggerType ?? 'joint_angle'
      })
    : null
}

/** 這場「當下實際生效」的個人舒適角度/極限範圍(膝角)快照;舊資料與未量測為 null */
function sessionLimits(session: Session): { comfort: number | null; limit: number | null } {
  return { comfort: session.comfortAngle ?? null, limit: session.limitAngle ?? null }
}

function durationText(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

async function exportCsv(session: Session): Promise<boolean> {
  // 圖表吃的是抽樣後的資料;匯出必須另外取全量,否則使用者拿到的是被抽掉的資料集
  const full = await irms.sessions.getData(session.id)
  // 前置 metadata:沒有 target/tolerance/動作 的話,匯出的 CSV 單獨拿去分析是無法解讀的
  const meta = [
    // source 放第一行:讀到 CSV 的人未必知道這個 app 有示範模式
    `# source,${session.source}`,
    `# session,${session.id}`,
    `# action,${session.actionName ?? ''}`,
    `# protocol,${session.protocol ?? ''}`,
    `# triggerType,${session.triggerType ?? ''}`,
    `# targetAngle,${session.targetAngle ?? ''}`,
    `# tolerance,${session.tolerance ?? ''}`,
    `# holdTimeMs,${session.holdTimeMs ?? ''}`,
    // 個人角度範圍快照(膝角);空值 = 當時尚未量測
    `# comfortAngle,${session.comfortAngle ?? ''}`,
    `# limitAngle,${session.limitAngle ?? ''}`,
    `# startTime,${session.startTime}`,
    `# endTime,${session.endTime ?? ''}`,
    `# repsCompleted,${session.repsCompleted}`,
    `# abandoned,${session.abandoned}`,
    // JSON 含逗號與雙引號,必須照 CSV 規則整段包起來並把 " 加倍
    `# calibration,"${(session.calibration ?? '').replace(/"/g, '""')}"`,
    // Roll 欄位保留供排錯,但它不是驗證過的內外翻量測
    '# note,thighRoll/shinRoll/kneeRoll are sensor-mounting diagnostics, not validated varus/valgus'
  ].join('\n')
  const header = '\ntimestamp,kneeAngle,thighAngle,shinAngle,kneeRoll,thighRoll,shinRoll\n'
  const body = full
    .map((r) => [r.timestamp, r.kneeAngle, r.proximalAngle, r.distalAngle, r.kneeRoll, r.proximalRoll, r.distalRoll].join(','))
    .join('\n')
  // 檔名比表頭重要:每一個拿到檔案的人都會看到檔名
  const name = session.source === 'demo' ? `irms_DEMO_session_${session.id}.csv` : `irms_session_${session.id}.csv`
  return irms.sessions.exportText(name, meta + header + body)
}

function SessionReview({ session, onBack }: { session: Session; onBack: () => void }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [readings, setReadings] = useState<StoredReading[]>([])
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null)
  const settings = useStore((s) => s.settings)
  const m = useT()
  const locale = useLocale()
  const info = metricInfo(session.triggerType ?? 'joint_angle', locale)
  const zone = sessionZone(session)
  const limits = sessionLimits(session)
  // 舊資料沒有 triggerType 快照時,曲線退回膝角(見 sessionMetricOf)
  const kneeCurve = (session.triggerType ?? 'joint_angle') === 'joint_angle'

  // 這條曲線是由「當時那組校準轉換」算出來的;之後重跑過精靈,意義就變了。
  // migration 6 之前的舊列沒有快照:不宣稱一致,也不宣稱不一致。
  const snapshot = parseCalibrationSnapshot(session.calibration)
  const drift = calibrationDrift(snapshot, settings)

  useEscapeKey(onBack)

  const showToast = useUiStore((s) => s.showToast)
  const runExport = async (): Promise<void> => {
    try {
      if (await exportCsv(session)) showToast(m.history.exported, 'success')
    } catch (e) {
      showToast(m.history.exportFailed({ message: e instanceof Error ? e.message : String(e) }), 'error')
    }
  }

  useEffect(() => {
    let chart: Chart<'line'> | null = null
    // 資料是非同步取回的:cleanup 可能在圖表建立前就跑(StrictMode 重複掛載或 deps 變動),
    // 此時舊流程仍會在同一個 canvas 上 new Chart。用旗標讓過期的流程直接放棄。
    let cancelled = false
    void (async () => {
      // LTTB 抽樣保留峰值;全量另取給摘要統計(抽樣資料不保留時間分佈)
      const data = await irms.sessions.getData(session.id, CHART_MAX_POINTS)
      if (cancelled) return
      setReadings(data)
      void irms.sessions.getData(session.id).then((full) => {
        if (cancelled) return
        setAnalysis(
          analyzeSession(
            full.map((r) => ({ t: Date.parse(r.timestamp), v: sessionMetricOf(session, r), k: r.kneeAngle })),
            sessionZone(session),
            sessionLimits(session)
          )
        )
      })
      if (!canvasRef.current) return
      const th = chartTheme()
      // Resolved inside the effect (not the render-time `m`) so the chart text always matches the
      // locale in this effect's dependency list.
      const mx = t(locale)
      const constantLine = (label: string, value: number, color: string, dash: number[]) => ({
        label,
        data: data.map(() => value),
        borderColor: color,
        borderWidth: 1.5,
        borderDash: dash,
        pointRadius: 0,
        fill: false
      })
      chart = new Chart(canvasRef.current, {
        type: 'line',
        data: {
          labels: data.map((r) => formatDateTime(locale, new Date(r.timestamp), TIME_SECONDS)),
          datasets: [
            {
              label: info.label,
              data: data.map((r) => sessionMetricOf(session, r)),
              borderColor: th.knee,
              borderWidth: 3,
              fill: false,
              pointRadius: 0,
              tension: 0.2
            },
            ...(zone
              ? [
                  constantLine(mx.history.targetMin, zone.min, th.shin, [6, 4]),
                  ...(Number.isFinite(zone.max) ? [constantLine(mx.history.targetMax, zone.max, th.shin, [6, 4])] : [])
                ]
              : []),
            // 個人範圍是膝角;只有這條曲線本身就是膝角時才畫在同一張圖上
            ...(kneeCurve && limits.comfort != null
              ? [constantLine(mx.clinical.terms.comfortAngle, limits.comfort, th.warning, [4, 3])]
              : []),
            ...(kneeCurve && limits.limit != null
              ? [constantLine(mx.clinical.terms.limitRange, limits.limit, th.danger, [2, 3])]
              : [])
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          scales: {
            x: { grid: { color: th.grid }, ticks: { color: th.tick, maxTicksLimit: 8 } },
            y: { grid: { color: th.grid }, ticks: { color: th.tick } }
          },
          plugins: { legend: { labels: { color: th.text, boxHeight: 2 } } }
        }
      })
    })()
    return () => {
      cancelled = true
      chart?.destroy()
    }
  }, [session.id, session.triggerType, session.targetAngle, session.tolerance, session.holdTimeMs, session.comfortAngle, session.limitAngle, locale])

  const wallSec =
    session.endTime != null ? (Date.parse(session.endTime) - Date.parse(session.startTime)) / 1000 : null
  const n0 = (v: number): string => formatNumber(locale, v, 0)
  const n1 = (v: number): string => formatNumber(locale, v, 1)
  const deg = (v: number | null | undefined): string => (v == null ? '—' : `${n1(v)}°`)
  const summary: { label: string; value: string; danger?: boolean }[] = [
    { label: m.history.reps, value: m.common.reps({ n: session.repsCompleted }) },
    { label: m.history.peak({ label: info.label }), value: deg(analysis?.peak) },
    { label: m.history.mean, value: deg(analysis?.mean) },
    {
      label: m.history.inZone,
      value: analysis?.inZoneRatio == null ? '—' : `${Math.round(analysis.inZoneRatio * 100)}%`
    },
    {
      label: m.clinical.history.overComfort,
      value: analysis?.overComfortSec == null ? m.common.notMeasured : m.common.seconds({ n: n1(analysis.overComfortSec) })
    },
    {
      label: m.clinical.history.overLimit,
      value:
        session.limitAngle == null
          ? m.common.notSet
          : analysis
            ? m.history.overLimitValue({ events: analysis.overLimitEvents, sec: n1(analysis.overLimitSec) })
            : '—',
      danger: (analysis?.overLimitEvents ?? 0) > 0
    },
    { label: m.history.active, value: analysis ? durationText(analysis.activeSec) : '—' }
  ]

  return (
    <div className="v3-page">
      <div className="v3-page-head">
        <div>
          <h1>{m.history.reviewTitle}</h1>
          <p>
            {session.actionName ?? m.history.unknownAction} · {formatDateTime(locale, new Date(session.startTime), DATE_TIME)} ·{' '}
            {m.history.sessionNo({ id: session.id })}
            {session.source === 'demo' ? m.history.demoSuffix : ''}
          </p>
        </div>
        <div className="v3-page-actions">
          <button className="btn btn-secondary" onClick={onBack}>
            {m.common.backToList}
          </button>
          <button className="btn btn-primary" onClick={() => void runExport()} disabled={readings.length === 0}>
            {m.history.export}
          </button>
        </div>
      </div>
      <section className="v3-sheet v3-review" aria-label={m.history.reviewTitle}>
        <div className="v3-review-summary" aria-label={m.history.summaryAria}>
          {summary.map((i) => (
            <div key={i.label}>
              <span>{i.label}</span>
              <strong className={i.danger ? 'text-danger' : undefined}>{i.value}</strong>
            </div>
          ))}
        </div>
        <div className="v3-review-body">
          <div className="v3-review-chart">
            <canvas ref={canvasRef} aria-label={m.history.chartAria({ label: info.label })} role="img" />
          </div>
          <aside className="v3-review-aside v3-scroll" aria-label={m.history.detailsAria}>
            {session.source === 'demo' && (
              <p className="v3-note warn">{m.clinical.history.demoNote}</p>
            )}
            {session.abandoned === 1 && (
              <p className="v3-note warn">{m.history.abandonedNote}</p>
            )}
            <h3>{m.history.prescription}</h3>
            <dl className="v3-kv">
              <div>
                <dt>{m.history.trigger}</dt>
                <dd>{session.triggerType ? m.clinical.triggerShort[session.triggerType] : m.history.legacy}</dd>
              </div>
              <div>
                <dt>{m.clinical.terms.targetZone}</dt>
                <dd>
                  {zone == null
                    ? '—'
                    : Number.isFinite(zone.max)
                      ? `${n0(zone.min)}–${n0(zone.max)}°`
                      : `≥ ${n0(zone.min)}°`}
                </dd>
              </div>
              <div>
                <dt>{m.history.hold}</dt>
                <dd>{session.holdTimeMs != null ? m.common.seconds({ n: n1(session.holdTimeMs / 1000) }) : '—'}</dd>
              </div>
              <div>
                <dt>{m.clinical.terms.comfortAngle}</dt>
                <dd>{session.comfortAngle != null ? `${n0(session.comfortAngle)}°` : m.common.notMeasured}</dd>
              </div>
              <div>
                <dt>{m.clinical.terms.limitRange}</dt>
                <dd>{session.limitAngle != null ? `${n0(session.limitAngle)}°` : m.common.notSet}</dd>
              </div>
              <div>
                <dt>{m.history.duration}</dt>
                <dd>{wallSec != null ? durationText(wallSec) : '—'}</dd>
              </div>
            </dl>
            <h3>{m.history.calibration}</h3>
            {snapshot == null ? (
              <p className="v3-note">{m.history.noSnapshot}</p>
            ) : drift.length > 0 ? (
              <p className="v3-note warn">{m.history.drift({ keys: drift.join(m.common.listSeparator) })}</p>
            ) : (
              <p className="v3-note">{m.history.sameCalibration}</p>
            )}
            <h3>{m.history.perRep}</h3>
            <p className="v3-note">{m.history.perRepNote}</p>
          </aside>
        </div>
      </section>
    </div>
  )
}

export function HistoryView(): JSX.Element {
  const [sessions, setSessions] = useState<Session[]>([])
  const [reviewing, setReviewing] = useState<Session | null>(null)
  const [page, setPage] = useState(0)
  const showToast = useUiStore((s) => s.showToast)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const m = useT()
  const locale = useLocale()
  const bodyRef = useRef<HTMLDivElement>(null)
  const pageRows = usePageSize(bodyRef, ROW_HEIGHT, 6)

  const load = async (): Promise<void> => {
    try {
      setSessions(await irms.sessions.list())
    } catch {
      showToast(m.history.loadFailed, 'error')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const remove = async (s: Session): Promise<void> => {
    const ok = await requestConfirm(m.history.deleteTitle, m.history.deleteBody({ id: s.id }))
    if (!ok) return
    await irms.sessions.delete(s.id)
    showToast(m.history.deleted({ id: s.id }), 'success')
    await load()
  }

  // 回顧取代列表;返回時頁碼保留(state 仍在這個元件)
  if (reviewing) return <SessionReview session={reviewing} onBack={() => setReviewing(null)} />

  const pageCount = Math.max(1, Math.ceil(sessions.length / pageRows))
  const current = Math.min(page, pageCount - 1)
  const visible = sessions.slice(current * pageRows, (current + 1) * pageRows)

  return (
    <div className="v3-page">
      <div className="v3-page-head">
        <div>
          <h1>{m.history.title}</h1>
          <p>{m.history.subtitle}</p>
        </div>
      </div>
      <section className="v3-sheet v3-history">
        <div className="work-history-table">
        <div className="v3-history-head" role="row">
          <span>{m.history.colStart}</span>
          <span>{m.history.colAction}</span>
          <span>{m.history.colDone}</span>
          <span>{m.history.colDuration}</span>
          <span>{m.history.colOps}</span>
        </div>
        <div className="v3-history-body" ref={bodyRef}>
          {sessions.length === 0 ? (
            <div className="v3-empty">
              <p>{m.history.empty}</p>
            </div>
          ) : (
            visible.map((s) => (
              <div key={s.id} className="v3-history-row">
                <span className="v3-history-time">{formatDateTime(locale, new Date(s.startTime), DATE_TIME)}</span>
                <span className="v3-history-action">
                  {s.actionName ?? '—'}
                  {/* 示範資料刻意不從列表隱藏:藏起來的列在資料庫裡依然存在,只是更難察覺 */}
                  {s.source === 'demo' && (
                    <span className="badge-demo" title={m.history.demoBadgeTitle}>
                      {m.history.demoBadge}
                    </span>
                  )}
                </span>
                <span className="v3-history-reps">
                  {m.common.reps({ n: s.repsCompleted })}
                  {/* 非正常結束:結束時間是推估的,次數可能少計——把不確定性標示出來 */}
                  {s.abandoned === 1 && (
                    <span className="badge-warn" title={m.history.abandonedTitle}>
                      {m.history.abandonedBadge}
                    </span>
                  )}
                </span>
                <span className="v3-history-dur" data-label={m.history.colDuration}>
                  {s.endTime ? durationText((Date.parse(s.endTime) - Date.parse(s.startTime)) / 1000) : '—'}
                </span>
                <span className="row v3-history-ops" style={{ gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => setReviewing(s)}>
                    {m.history.review}
                  </button>
                  <button className="btn btn-danger-ghost btn-sm" aria-label={m.history.deleteAria({ id: s.id })} onClick={() => void remove(s)}>
                    {m.common.delete}
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
        </div>
        <div className="v3-pager">
          <span>
            {m.history.pager({ total: sessions.length, page: current + 1, pages: pageCount })}
          </span>
          <span className="row" style={{ gap: 8 }}>
            <button className="btn btn-secondary btn-sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
              {m.common.prevPage}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              {m.common.nextPage}
            </button>
          </span>
        </div>
      </section>
    </div>
  )
}
