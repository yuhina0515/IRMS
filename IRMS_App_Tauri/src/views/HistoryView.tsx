// 療程紀錄(設計語言 v2 §9):連續資料表 + 分析對話框。示範資料與未正常結束的標記
// 必須在任何主題、任何語言下都一眼可辨——那是這個畫面防止誤判的主要手段。
import { useEffect, useRef, useState } from 'react'
import { Chart } from 'chart.js'
import type { Session, StoredReading } from '@shared/types'
import { metricLabel, useT, type Messages } from '../i18n'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { chartTheme } from '../services/theme'
import { computeMetricZone, metricInfo } from '../services/movementMetric'
import { calibrationDrift, parseCalibrationSnapshot } from '../services/calibration'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { irms } from '../platform/irmsApi'
import { AlertIcon, CloseIcon, InfoIcon } from '../components/Icons'

/** 圖表抽樣後的目標點數:視覺上足夠細緻,又遠低於會拖垮 Chart.js 的量級 */
const CHART_MAX_POINTS = 1200

/** 校準欄位名(CALIBRATION_TRANSFORM_KEYS)→ 目前語言的可讀名稱。舊版直接把欄位識別字丟給使用者看。 */
function calibrationFieldLabel(t: Messages, key: string): string {
  const f = t.history.calibrationFields
  const limb = key.startsWith('proximal') ? t.common.thigh : key.startsWith('distal') ? t.common.shin : ''
  const field = key.endsWith('AxisRotationDeg')
    ? f.axisRotation
    : key.endsWith('RollInvert')
      ? f.rollInvert
      : key.endsWith('RollZeroRaw')
        ? f.rollZero
        : key.endsWith('Invert')
          ? f.invert
          : key === 'kneeZeroRaw'
            ? f.kneeZero
            : key.endsWith('ZeroRaw')
              ? f.zero
              : key.endsWith('ZeroAccel')
                ? f.zeroAccel
                : key.endsWith('HingeAxis')
                  ? f.hingeAxis
                  : key
  return t.common.limbField(limb, field)
}

function AnalysisDialog({ session, onClose }: { session: Session; onClose: () => void }): JSX.Element {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [readings, setReadings] = useState<StoredReading[]>([])
  const settings = useStore((s) => s.settings)

  // 這條曲線是由「當時那組校準轉換」算出來的。之後重跑過精靈,同一條曲線的意義就變了。
  // migration 6 之前的舊列沒有快照(null):此時不宣稱一致,也不宣稱不一致。
  const snapshot = parseCalibrationSnapshot(session.calibration)
  const drift = calibrationDrift(snapshot, settings)

  useEffect(() => {
    let chart: Chart<'line'> | null = null
    void (async () => {
      // 原生層 LTTB 抽樣:25Hz × 10 分鐘約 15,000 列,全量餵 Chart.js 會明顯卡住。LTTB 保留峰值。
      const data = await irms.sessions.getData(session.id, CHART_MAX_POINTS)
      setReadings(data)
      if (!canvasRef.current) return
      const c = chartTheme()
      const m = t.chart

      // 畫出「這場實際被判定的那個指標」。舊資料沒有 triggerType 快照,退回膝角。
      const info = metricInfo(session.triggerType ?? 'joint_angle')
      const metricOf = (r: StoredReading): number | null =>
        session.triggerType === 'segment_elevation'
          ? r.proximalAngle
          : session.triggerType === 'segment_extension'
            ? r.proximalAngle == null
              ? null
              : -r.proximalAngle
            : r.kneeAngle

      const zone =
        session.targetAngle != null && session.tolerance != null
          ? computeMetricZone({
              targetAngle: session.targetAngle,
              tolerance: session.tolerance,
              holdTimeMs: session.holdTimeMs ?? 2000,
              triggerType: session.triggerType ?? 'joint_angle',
              // 必須用這場「當下實際生效」的安全上限,否則回顧圖上會畫出一條當時不存在的紅線。
              // 舊資料 safetyLimit 為 NULL,退回導出值才是對的(那時就是導出的)。
              safetyLimit: session.safetyLimit ?? null
            })
          : null

      const constantLine = (label: string, value: number, color: string, dash: number[]) => ({
        label,
        data: data.map(() => value),
        borderColor: color,
        borderWidth: 1,
        borderDash: dash,
        pointRadius: 0,
        fill: false
      })

      chart = new Chart(canvasRef.current, {
        type: 'line',
        data: {
          labels: data.map((r) => new Date(r.timestamp).toLocaleTimeString([], { hour12: false })),
          datasets: [
            {
              label: metricLabel(t, info),
              data: data.map(metricOf),
              borderColor: c.knee,
              borderWidth: 2,
              fill: true,
              backgroundColor: c.kneeFill,
              pointRadius: 0,
              tension: 0.3
            },
            ...(zone
              ? [
                  constantLine(m.targetMin, zone.min, c.target, [6, 4]),
                  ...(Number.isFinite(zone.max) ? [constantLine(m.targetMax, zone.max, c.target, [6, 4])] : []),
                  constantLine(m.overLimit, zone.overLimit, c.danger, [2, 3])
                ]
              : []),
            {
              label: m.varusValgusDisplay,
              data: data.map((r) => r.kneeRoll),
              borderColor: c.roll,
              borderWidth: 1,
              borderDash: [2, 3],
              fill: false,
              pointRadius: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { color: c.grid }, ticks: { color: c.tick, maxTicksLimit: 10 } },
            y: { grid: { color: c.grid }, ticks: { color: c.tick } }
          },
          plugins: { legend: { labels: { color: c.text } } }
        }
      })
    })()
    return () => chart?.destroy()
    // t 變化(切換語言)時重建圖表,讓圖例跟著換
  }, [session.id, session.triggerType, session.targetAngle, session.tolerance, session.holdTimeMs, session.safetyLimit, t])

  useEscapeKey(onClose)

  const exportCsv = async (): Promise<void> => {
    // 圖表吃的是抽樣後的資料;匯出必須另外取全量
    const full = await irms.sessions.getData(session.id)
    // CSV 表頭維持固定英文欄位名,不隨介面語言變動——匯出檔會被別的工具以欄位名解析。
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
      `# safetyLimit,${session.safetyLimit ?? ''}`,
      `# startTime,${session.startTime}`,
      `# endTime,${session.endTime ?? ''}`,
      `# repsCompleted,${session.repsCompleted}`,
      `# abandoned,${session.abandoned}`,
      // JSON 含逗號與雙引號,依 CSV 規則整段包起來並把 " 加倍
      `# calibration,"${(session.calibration ?? '').replace(/"/g, '""')}"`
    ].join('\n')
    const header = '\ntimestamp,kneeAngle,thighAngle,shinAngle,kneeRoll,thighRoll,shinRoll\n'
    const body = full
      .map((r) => [r.timestamp, r.kneeAngle, r.proximalAngle, r.distalAngle, r.kneeRoll, r.proximalRoll, r.distalRoll].join(','))
      .join('\n')
    const blob = new Blob([meta + header + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // 檔名比表頭重要:每一個人都會看到檔名
    a.download = session.source === 'demo' ? `irms_DEMO_session_${session.id}.csv` : `irms_session_${session.id}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const legacyLimbs = snapshot
    ? [!snapshot.proximalAxisRotationVerified && t.common.thigh, !snapshot.distalAxisRotationVerified && t.common.shin]
        .filter(Boolean)
        .join(t.common.listSep)
    : ''

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog dialog--xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analysis-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog__header">
          <h2 id="analysis-title" className="dialog__title">
            {t.history.analysisTitle(session.id)}
            {session.source === 'demo' && <span className="badge badge--warning">{t.history.demoBadge}</span>}
          </h2>
          <button type="button" className="btn btn--ghost btn--icon" aria-label={t.common.close} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="dialog__body">
          <div className="history-chart">
            <canvas ref={canvasRef} />
          </div>
          {/* 示範資料警示常駐,不與校準漂移提示互斥:兩者回答的是不同問題 */}
          {session.source === 'demo' && (
            <div className="notice notice--warning">
              <AlertIcon />
              {t.history.demoWarning}
            </div>
          )}
          {snapshot == null ? (
            <div className="notice">
              <InfoIcon />
              {t.history.noSnapshot}
            </div>
          ) : drift.length > 0 ? (
            <div className="notice notice--warning">
              <AlertIcon />
              {t.history.drift(drift.map((k) => calibrationFieldLabel(t, k)).join(t.common.listSep))}
            </div>
          ) : legacyLimbs ? (
            // 舊版布林 axisSwap 遷移來的貼裝角度未經新方法重新驗證——數字沒變但可信度低,語氣較輕
            <div className="notice">
              <InfoIcon />
              {t.history.legacyAxis(legacyLimbs)}
            </div>
          ) : null}
        </div>
        <div className="dialog__footer" style={{ justifyContent: 'space-between' }}>
          <span className="text-dim">{t.history.pointsSummary(readings.length, session.repsCompleted)}</span>
          <button type="button" className="btn" onClick={() => void exportCsv()} disabled={readings.length === 0}>
            {t.history.exportCsv}
          </button>
        </div>
      </div>
    </div>
  )
}

export function HistoryView(): JSX.Element {
  const t = useT()
  const language = useStore((s) => s.settings.language)
  const [sessions, setSessions] = useState<Session[]>([])
  const [analyzing, setAnalyzing] = useState<Session | null>(null)
  const showToast = useUiStore((s) => s.showToast)
  const requestConfirm = useUiStore((s) => s.requestConfirm)

  const load = async (): Promise<void> => {
    try {
      setSessions(await irms.sessions.list())
    } catch {
      showToast(t.history.loadFailed, 'error')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const remove = async (s: Session): Promise<void> => {
    const ok = await requestConfirm(t.history.deleteTitle, t.history.deleteConfirm(s.id))
    if (!ok) return
    await irms.sessions.delete(s.id)
    showToast(t.history.deleted(s.id), 'success')
    await load()
  }

  return (
    <section className="view">
      <p className="view__lead">{t.history.subtitle}</p>

      {sessions.length === 0 ? (
        <div className="empty">{t.history.empty}</div>
      ) : (
        <div className="table-surface">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.history.colId}</th>
                <th>{t.history.colStart}</th>
                <th>{t.history.colAction}</th>
                <th>{t.history.colReps}</th>
                <th style={{ textAlign: 'right' }}>{t.history.colOps}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className={s.source === 'demo' ? 'is-demo' : undefined}>
                  <td className="num">#{s.id}</td>
                  <td className="num">{new Date(s.startTime).toLocaleString(language)}</td>
                  <td>
                    <span>{s.actionName ?? t.common.none}</span>
                    {/* 示範資料刻意不從列表隱藏:藏起來的列在資料庫副本裡依然存在,只是更難察覺 */}
                    {s.source === 'demo' && (
                      <span className="cell-tags">
                        <span className="badge badge--warning" title={t.history.demoTitle}>
                          {t.history.demoBadge}
                        </span>
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="num">{s.repsCompleted}</span>
                    {/* 非正常結束:結束時間是推估的,reps 可能少計——把不確定性標示出來 */}
                    {s.abandoned === 1 && (
                      <span className="cell-tags">
                        <span className="badge badge--warning" title={t.history.abandonedTitle}>
                          {t.history.abandonedBadge}
                        </span>
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="cell-actions">
                      <button type="button" className="btn btn--sm" onClick={() => setAnalyzing(s)}>
                        {t.history.analyze}
                      </button>
                      <button
                        type="button"
                        className="btn btn--sm btn--danger-ghost btn--icon"
                        aria-label={t.history.deleteLabel(s.id)}
                        title={t.history.deleteLabel(s.id)}
                        onClick={() => void remove(s)}
                      >
                        <CloseIcon size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {analyzing && <AnalysisDialog session={analyzing} onClose={() => setAnalyzing(null)} />}
    </section>
  )
}
