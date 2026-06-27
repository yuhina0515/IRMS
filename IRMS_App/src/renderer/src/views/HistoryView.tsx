// renderer/views/HistoryView.tsx
import { useEffect, useRef, useState } from 'react'
import { Chart } from 'chart.js'
import { useUiStore } from '../store/useUiStore'
import type { Session, StoredReading } from '@shared/types'

function AnalysisModal({ session, onClose }: { session: Session; onClose: () => void }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [readings, setReadings] = useState<StoredReading[]>([])

  useEffect(() => {
    let chart: Chart<'line'> | null = null
    void (async () => {
      const data = await window.irms.sessions.getData(session.id)
      setReadings(data)
      if (!canvasRef.current) return
      chart = new Chart(canvasRef.current, {
        type: 'line',
        data: {
          labels: data.map((r) => new Date(r.timestamp).toLocaleTimeString([], { hour12: false })),
          datasets: [
            { label: 'Knee 夾角', data: data.map((r) => r.kneeAngle), borderColor: '#3b82f6', borderWidth: 2, fill: true, backgroundColor: 'rgba(59,130,246,0.12)', pointRadius: 0, tension: 0.3 },
            { label: 'Varus/Valgus', data: data.map((r) => r.kneeRoll), borderColor: '#f59e0b', borderWidth: 1, fill: false, pointRadius: 0 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: { ticks: { color: '#9ca3af', maxTicksLimit: 10 } }, y: { ticks: { color: '#9ca3af' } } },
          plugins: { legend: { labels: { color: '#f3f4f6' } } }
        }
      })
    })()
    return () => chart?.destroy()
  }, [session.id])

  const exportCsv = (): void => {
    const header = 'timestamp,kneeAngle,thighAngle,shinAngle,kneeRoll,thighRoll,shinRoll\n'
    const body = readings
      .map((r) =>
        [r.timestamp, r.kneeAngle, r.thighAngle, r.shinAngle, r.kneeRoll, r.thighRoll, r.shinRoll].join(',')
      )
      .join('\n')
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `irms_session_${session.id}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
        <div style={{ height: 320 }}>
          <canvas ref={canvasRef} />
        </div>
        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-dim)' }}>
            {readings.length} 筆讀數 · {session.repsCompleted} reps
          </span>
          <button className="btn btn-secondary" onClick={exportCsv} disabled={readings.length === 0}>
            匯出 CSV
          </button>
        </div>
      </div>
    </div>
  )
}

export function HistoryView(): JSX.Element {
  const [sessions, setSessions] = useState<Session[]>([])
  const [analyzing, setAnalyzing] = useState<Session | null>(null)
  const showToast = useUiStore((s) => s.showToast)
  const requestConfirm = useUiStore((s) => s.requestConfirm)

  const load = async (): Promise<void> => {
    try {
      setSessions(await window.irms.sessions.list())
    } catch {
      showToast('載入歷史失敗', 'error')
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

      {sessions.length === 0 ? (
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
                  <td>{s.repsCompleted}</td>
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
