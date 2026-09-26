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
import { TRIGGER_SHORT } from './actionLabels'

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
        triggerType: session.triggerType ?? 'joint_angle',
        // 必須用這場「當下實際生效」的安全上限,否則回顧圖上會畫出一條當時不存在的紅線。
        // 舊資料 safetyLimit 為 NULL,退回導出值才是對的(那時就是導出的)。
        safetyLimit: session.safetyLimit ?? null
      })
    : null
}

function durationText(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

async function exportCsv(session: Session): Promise<void> {
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
    // 空值代表「當時沿用導出值」,與圖表的退回規則一致
    `# safetyLimit,${session.safetyLimit ?? ''}`,
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
  const blob = new Blob([meta + header + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  // 檔名比表頭重要:每一個拿到檔案的人都會看到檔名
  a.download = session.source === 'demo' ? `irms_DEMO_session_${session.id}.csv` : `irms_session_${session.id}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function SessionReview({ session, onBack }: { session: Session; onBack: () => void }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [readings, setReadings] = useState<StoredReading[]>([])
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null)
  const settings = useStore((s) => s.settings)
  const info = metricInfo(session.triggerType ?? 'joint_angle')
  const zone = sessionZone(session)

  // 這條曲線是由「當時那組校準轉換」算出來的;之後重跑過精靈,意義就變了。
  // migration 6 之前的舊列沒有快照:不宣稱一致,也不宣稱不一致。
  const snapshot = parseCalibrationSnapshot(session.calibration)
  const drift = calibrationDrift(snapshot, settings)

  useEscapeKey(onBack)

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
            full.map((r) => ({ t: Date.parse(r.timestamp), v: sessionMetricOf(session, r) })),
            sessionZone(session)
          )
        )
      })
      if (!canvasRef.current) return
      const t = chartTheme()
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
          labels: data.map((r) => new Date(r.timestamp).toLocaleTimeString([], { hour12: false })),
          datasets: [
            {
              label: info.label,
              data: data.map((r) => sessionMetricOf(session, r)),
              borderColor: t.knee,
              borderWidth: 3,
              fill: false,
              pointRadius: 0,
              tension: 0.2
            },
            ...(zone
              ? [
                  constantLine('目標下限', zone.min, t.shin, [6, 4]),
                  ...(Number.isFinite(zone.max) ? [constantLine('目標上限', zone.max, t.shin, [6, 4])] : []),
                  constantLine('超限門檻', zone.overLimit, t.danger, [2, 3])
                ]
              : [])
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          scales: {
            x: { grid: { color: t.grid }, ticks: { color: t.tick, maxTicksLimit: 8 } },
            y: { grid: { color: t.grid }, ticks: { color: t.tick } }
          },
          plugins: { legend: { labels: { color: t.text, boxHeight: 2 } } }
        }
      })
    })()
    return () => {
      cancelled = true
      chart?.destroy()
    }
  }, [session.id, session.triggerType, session.targetAngle, session.tolerance, session.holdTimeMs, session.safetyLimit])

  const wallSec =
    session.endTime != null ? (Date.parse(session.endTime) - Date.parse(session.startTime)) / 1000 : null
  const deg = (v: number | null | undefined): string => (v == null ? '—' : `${v.toFixed(1)}°`)
  const summary: { label: string; value: string; danger?: boolean }[] = [
    { label: '完成次數', value: `${session.repsCompleted} 次` },
    { label: `峰值 ${info.label}`, value: deg(analysis?.peak) },
    { label: '平均', value: deg(analysis?.mean) },
    {
      label: '目標區時間',
      value: analysis?.inZoneRatio == null ? '—' : `${Math.round(analysis.inZoneRatio * 100)}%`
    },
    {
      label: '超限事件',
      value: analysis ? `${analysis.overLimitEvents} 次 · ${analysis.overLimitSec.toFixed(1)} 秒` : '—',
      danger: (analysis?.overLimitEvents ?? 0) > 0
    },
    { label: '有效量測', value: analysis ? durationText(analysis.activeSec) : '—' }
  ]

  return (
    <div className="v3-page">
      <div className="v3-page-head">
        <div>
          <h1>療程回顧</h1>
          <p>
            {session.actionName ?? '未知動作'} · {new Date(session.startTime).toLocaleString()} · 療程 #{session.id}
            {session.source === 'demo' ? ' · 示範資料' : ''}
          </p>
        </div>
        <div className="v3-page-actions">
          <button className="btn btn-secondary" onClick={onBack}>
            ← 返回列表
          </button>
          <button className="btn btn-primary" onClick={() => void exportCsv(session)} disabled={readings.length === 0}>
            匯出紀錄
          </button>
        </div>
      </div>
      <section className="v3-sheet v3-review" aria-label="療程回顧">
        <div className="v3-review-summary" aria-label="訓練摘要">
          {summary.map((i) => (
            <div key={i.label}>
              <span>{i.label}</span>
              <strong className={i.danger ? 'text-danger' : undefined}>{i.value}</strong>
            </div>
          ))}
        </div>
        <div className="v3-review-body">
          <div className="v3-review-chart">
            <canvas ref={canvasRef} aria-label={`${info.label}隨時間變化圖`} role="img" />
          </div>
          <aside className="v3-review-aside v3-scroll" aria-label="療程細節">
            {session.source === 'demo' && (
              <p className="v3-note warn">這是示範模式產生的模擬資料,不是真實量測,不可作為臨床判讀依據。</p>
            )}
            {session.abandoned === 1 && (
              <p className="v3-note warn">這場療程未正常結束(關窗或當機),結束時間為推估值,次數可能不完整。</p>
            )}
            <h3>處方(當時生效)</h3>
            <dl className="v3-kv">
              <div>
                <dt>判定</dt>
                <dd>{session.triggerType ? TRIGGER_SHORT[session.triggerType] : '—(舊資料)'}</dd>
              </div>
              <div>
                <dt>目標區間</dt>
                <dd>
                  {zone == null
                    ? '—'
                    : Number.isFinite(zone.max)
                      ? `${zone.min.toFixed(0)}–${zone.max.toFixed(0)}°`
                      : `≥ ${zone.min.toFixed(0)}°`}
                </dd>
              </div>
              <div>
                <dt>保持</dt>
                <dd>{session.holdTimeMs != null ? `${(session.holdTimeMs / 1000).toFixed(1)} 秒` : '—'}</dd>
              </div>
              <div>
                <dt>超限門檻</dt>
                <dd>
                  {zone ? `${zone.overLimit.toFixed(0)}°` : '—'}
                  {session.safetyLimit == null && zone ? '(導出)' : ''}
                </dd>
              </div>
              <div>
                <dt>療程時間</dt>
                <dd>{wallSec != null ? durationText(wallSec) : '—'}</dd>
              </div>
            </dl>
            <h3>校準</h3>
            {snapshot == null ? (
              <p className="v3-note">無校準快照(建立於本功能之前),無法確認可比性。</p>
            ) : drift.length > 0 ? (
              <p className="v3-note warn">
                校準已變更:這場的 {drift.join('、')} 與目前設定不同。曲線的零點或方向可能與現在不一致,請勿直接與近期紀錄比較。
              </p>
            ) : (
              <p className="v3-note">與目前校準相同。</p>
            )}
            <h3>逐次分析</h3>
            <p className="v3-note">
              目前紀錄只保存連續角度與完成次數,尚未保存每一次動作的開始與結束事件,因此不提供逐次峰值與保持時間,以免呈現推測出的精確度。
            </p>
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
  const bodyRef = useRef<HTMLDivElement>(null)
  const pageRows = usePageSize(bodyRef, ROW_HEIGHT, 6)

  const load = async (): Promise<void> => {
    try {
      setSessions(await irms.sessions.list())
    } catch {
      showToast('載入歷史失敗', 'error')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const remove = async (s: Session): Promise<void> => {
    const ok = await requestConfirm('刪除紀錄', `確定刪除療程 #${s.id} 的紀錄嗎?`)
    if (!ok) return
    await irms.sessions.delete(s.id)
    showToast(`療程 #${s.id} 已刪除`, 'success')
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
          <h1>療程紀錄</h1>
          <p>每一場療程的處方、次數與來源;點「回顧」查看完整分析。</p>
        </div>
      </div>
      <section className="v3-sheet v3-history">
        <div className="v3-history-head" role="row">
          <span>開始時間</span>
          <span>動作</span>
          <span>完成</span>
          <span>時長</span>
          <span>操作</span>
        </div>
        <div className="v3-history-body" ref={bodyRef}>
          {sessions.length === 0 ? (
            <div className="v3-empty">
              <p>尚無療程紀錄</p>
            </div>
          ) : (
            visible.map((s) => (
              <div key={s.id} className="v3-history-row">
                <span>{new Date(s.startTime).toLocaleString()}</span>
                <span className="v3-history-action">
                  {s.actionName ?? '—'}
                  {/* 示範資料刻意不從列表隱藏:藏起來的列在資料庫裡依然存在,只是更難察覺 */}
                  {s.source === 'demo' && (
                    <span className="badge-demo" title="這場是示範模式產生的模擬資料,不是真實量測">
                      示範資料
                    </span>
                  )}
                </span>
                <span>
                  {s.repsCompleted} 次
                  {/* 非正常結束:結束時間是推估的,次數可能少計——把不確定性標示出來 */}
                  {s.abandoned === 1 && (
                    <span className="badge-warn" title="這場療程未正常結束(關窗或當機),結束時間為推估值,次數可能不完整">
                      未正常結束
                    </span>
                  )}
                </span>
                <span>
                  {s.endTime ? durationText((Date.parse(s.endTime) - Date.parse(s.startTime)) / 1000) : '—'}
                </span>
                <span className="row" style={{ gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => setReviewing(s)}>
                    回顧
                  </button>
                  <button className="btn btn-danger-ghost btn-sm" aria-label={`刪除療程 #${s.id}`} onClick={() => void remove(s)}>
                    刪除
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
        <div className="v3-pager">
          <span>
            共 {sessions.length} 場 · 第 {current + 1} / {pageCount} 頁
          </span>
          <span className="row" style={{ gap: 8 }}>
            <button className="btn btn-secondary btn-sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
              上一頁
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              下一頁
            </button>
          </span>
        </div>
      </section>
    </div>
  )
}
