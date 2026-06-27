// renderer/components/LiveChart.tsx
// 即時角度折線圖。為了 10Hz 高頻更新的效能,採用原生 Chart.js + store 訂閱做命令式更新,
// 而非每筆封包都觸發 React 重繪。Session 開始時自動清空。
import { useEffect, useRef } from 'react'
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from 'chart.js'
import { useStore } from '../store/useStore'

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend
)

export function LiveChart(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart<'line'> | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const chart = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: '夾角 Knee', data: [], borderColor: '#3b82f6', borderWidth: 2, fill: true, backgroundColor: 'rgba(59,130,246,0.12)', pointRadius: 0, tension: 0.3 },
          { label: '大腿 Thigh', data: [], borderColor: '#f59e0b', borderWidth: 1, fill: false, pointRadius: 0 },
          { label: '小腿 Shin', data: [], borderColor: '#10b981', borderWidth: 1, fill: false, pointRadius: 0 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', maxTicksLimit: 8 } },
          y: { beginAtZero: true, suggestedMax: 150, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } }
        },
        plugins: { legend: { labels: { color: '#f3f4f6' } } }
      }
    })
    chartRef.current = chart

    // 訂閱角度更新(命令式 push,不經 React render)
    const unsub = useStore.subscribe((state, prev) => {
      // Session 開始(id 由 null 變為數字)時清空圖表
      if (state.session.id !== prev.session.id && state.session.id != null) {
        chart.data.labels = []
        chart.data.datasets.forEach((d) => (d.data = []))
        chart.update('none')
        return
      }
      const a = state.angles
      if (!a || a === prev.angles) return

      const max = state.settings.maxChartPoints
      ;(chart.data.labels as string[]).push(new Date().toLocaleTimeString([], { hour12: false }))
      ;(chart.data.datasets[0].data as number[]).push(a.knee)
      ;(chart.data.datasets[1].data as number[]).push(a.thigh)
      ;(chart.data.datasets[2].data as number[]).push(a.shin)

      if ((chart.data.labels as string[]).length > max) {
        ;(chart.data.labels as string[]).shift()
        chart.data.datasets.forEach((d) => d.data.shift())
      }
      chart.update('none')
    })

    return () => {
      unsub()
      chart.destroy()
      chartRef.current = null
    }
  }, [])

  return (
    <div style={{ height: 280 }}>
      <canvas ref={canvasRef} />
    </div>
  )
}
