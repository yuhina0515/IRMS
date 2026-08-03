// renderer/views/HistoryView.tsx
import { useEffect, useRef, useState } from 'react'
import { Chart } from 'chart.js'
import { useUiStore } from '../store/useUiStore'
import { chartTheme } from '../services/theme'
import type { Session, StoredReading } from '@shared/types'
import { computeMetricZone, metricInfo } from '../services/movementMetric'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { Spinner } from '../components/Spinner'

/** 圖表抽樣後的目標點數:視覺上足夠細緻,又遠低於會拖垮 Chart.js 的量級 */
const CHART_MAX_POINTS = 1200

function AnalysisModal({ session, onClose }: { session: Session; onClose: () => void }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [readings, setReadings] = useState<StoredReading[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const showToast = useUiStore((s) => s.showToast)

  useEffect(() => {
    let chart: Chart<'line'> | null = null
    let cancelled = false
    setIsLoading(true)
    void (async () => {
      // 主進程 LTTB 抽樣:25Hz × 10 分鐘約 15,000 列,全量過 IPC 再餵 Chart.js,
      // 這段等待原本完全沒有回饋,只會讓這個 modal 明顯卡住。LTTB 會保留峰值——臨床上要看的正是峰值。
      let data: StoredReading[]
      try {
        data = await window.irms.sessions.getData(session.id, CHART_MAX_POINTS)
      } catch {
        if (!cancelled) {
          setIsLoading(false)
          showToast('讀取分析資料失敗', 'error')
        }
        return
      }
      if (cancelled) return
      setReadings(data)
      setIsLoading(false)
      if (!canvasRef.current) return
      const t = chartTheme()

      // 畫出「這場實際被判定的那個指標」。舊資料沒有 triggerType 快照,退回膝角。
      const info = metricInfo(session.triggerType ?? 'joint_angle')
      const metricOf = (r: StoredReading): number | null =>
        session.triggerType === 'segment_elevation'
          ? r.thighAngle
          : session.triggerType === 'segment_extension'
            ? r.thighAngle == null
              ? null
              : -r.thighAngle
            : r.kneeAngle

      const zone =
        session.targetAngle != null && session.tolerance != null
          ? computeMetricZone({
              targetAngle: session.targetAngle,
              tolerance: session.tolerance,
              holdTimeMs: session.holdTimeMs ?? 2000,
              triggerType: session.triggerType ?? 'joint_angle',
              // 必須用這場「當下實際生效」的安全上限。少了它會退回導出值
              // (target+tolerance+10),於是回顧圖上畫出一條當時根本不存在的紅線——
              // 督導據此判斷患者有沒有超限,線畫錯等於病歷記錯。
              // 舊資料 safetyLimit 為 NULL,退回導出值才是對的(那時就是導出的)。
              safetyLimit: session.safetyLimit ?? null
            })
          : null

      /** 常數線資料集:讓督導一眼看出曲線有沒有進到目標帶、有沒有越過安全上限 */
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
              label: info.label,
              data: data.map(metricOf),
              borderColor: t.knee,
              borderWidth: 2,
              fill: true,
              backgroundColor: t.kneeFill,
              pointRadius: 0,
              tension: 0.3
            },
            ...(zone
              ? [
                  constantLine('目標下限', zone.min, t.thigh, [6, 4]),
                  ...(Number.isFinite(zone.max)
                    ? [constantLine('目標上限', zone.max, t.thigh, [6, 4])]
                    : []),
                  constantLine('超限門檻', zone.overLimit, t.danger, [2, 3])
                ]
              : []),
            {
              label: 'Varus/Valgus(顯示用)',
              data: data.map((r) => r.kneeRoll),
              borderColor: t.shin,
              borderWidth: 1,
              fill: false,
              pointRadius: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { color: t.grid }, ticks: { color: t.tick, maxTicksLimit: 10 } },
            y: { grid: { color: t.grid }, ticks: { color: t.tick } }
          },
          plugins: { legend: { labels: { color: t.text } } }
        }
      })
    })()
    return () => {
      cancelled = true
      chart?.destroy()
    }
  }, [
    session.id,
    session.triggerType,
    session.targetAngle,
    session.tolerance,
    session.holdTimeMs,
    session.safetyLimit,
    showToast
  ])

  useEscapeKey(onClose)

  const exportCsv = async (): Promise<void> => {
    setIsExporting(true)
    try {
      // 圖表吃的是抽樣後的資料;匯出必須另外取全量,否則使用者拿到的是被抽掉的資料集
      const full = await window.irms.sessions.getData(session.id)
      // 前置 metadata:沒有 target/tolerance/動作 的話,匯出的 CSV 單獨拿去分析是無法解讀的
      const meta = [
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
        `# abandoned,${session.abandoned}`
      ].join('\n')
      const header = '\ntimestamp,kneeAngle,thighAngle,shinAngle,kneeRoll,thighRoll,shinRoll\n'
      const body = full
        .map((r) =>
          [r.timestamp, r.kneeAngle, r.thighAngle, r.shinAngle, r.kneeRoll, r.thighRoll, r.shinRoll].join(',')
        )
        .join('\n')
      const blob = new Blob([meta + header + body], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `irms_session_${session.id}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      showToast('匯出 CSV 失敗', 'error')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal glass" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Session #{session.id} Analysis</h3>
          <button className="close-x" onClick={onClose}>
            ×
          </button>
        </div>
        <div style={{ height: 320, position: 'relative' }}>
          <canvas ref={canvasRef} />
          {isLoading && (
            <div
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Spinner label="讀取分析資料中…" />
            </div>
          )}
        </div>
        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-dim)' }}>
            {isLoading ? '讀取中…' : `${readings.length} 點(圖表抽樣後)`} · {session.repsCompleted} reps
          </span>
          <button
            className="btn btn-secondary"
            onClick={() => void exportCsv()}
            disabled={isExporting || isLoading || readings.length === 0}
          >
            {isExporting ? '匯出中…' : '匯出 CSV'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function HistoryView(): JSX.Element {
  const [sessions, setSessions] = useState<Session[]>([])
  const [analyzing, setAnalyzing] = useState<Session | null>(null)
  // 首次掛載預設為 true:避免在真正讀完前,把「還沒讀到」誤判成「沒有紀錄」而
  // 短暫閃出「尚無復健紀錄」——那句話在使用者其實有歷史資料時是誤導。
  const [isLoading, setIsLoading] = useState(true)
  const showToast = useUiStore((s) => s.showToast)
  const requestConfirm = useUiStore((s) => s.requestConfirm)

  const load = async (): Promise<void> => {
    try {
      setSessions(await window.irms.sessions.list())
    } catch {
      showToast('載入歷史失敗', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const remove = async (s: Session): Promise<void> => {
    const ok = await requestConfirm('刪除紀錄', `確定刪除 Session #${s.id} 的紀錄嗎?`)
    if (!ok) return
    await window.irms.sessions.delete(s.id)
    showToast(`Session #${s.id} 已刪除`, 'success')
    await load()
  }

  return (
    <>
      <header className="page-header">
        <h2>Rehabilitation History</h2>
        <p>檢視與分析過往復健歷程</p>
      </header>

      {isLoading && sessions.length === 0 ? (
        <div className="panel glass">
          <Spinner label="讀取歷史紀錄中…" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="empty glass panel">尚無復健紀錄</div>
      ) : (
        <div className="panel glass">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>開始時間</th>
                <th>動作</th>
                <th>Reps</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>#{s.id}</td>
                  <td>{new Date(s.startTime).toLocaleString()}</td>
                  <td>{s.actionName ?? '—'}</td>
                  <td>
                    {s.repsCompleted}
                    {/* 非正常結束的 Session:結束時間是啟動時推估的,reps 可能少計。
                        把不確定性標示出來,而不是把數字當成事實呈現。 */}
                    {s.abandoned === 1 && (
                      <span
                        className="badge-warn"
                        title="這場 Session 未正常結束(關窗或當機),結束時間為推估值,次數可能不完整"
                      >
                        未正常結束
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="row">
                      <button className="btn btn-primary btn-sm" onClick={() => setAnalyzing(s)}>
                        分析
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => void remove(s)}>
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {analyzing && <AnalysisModal session={analyzing} onClose={() => setAnalyzing(null)} />}
    </>
  )
}
