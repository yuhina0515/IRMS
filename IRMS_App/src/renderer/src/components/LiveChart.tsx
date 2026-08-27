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
import { chartTheme, onSystemThemeChange } from '../services/theme'

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
    const t = chartTheme()
    const chart = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: '夾角 Knee', data: [], borderColor: t.knee, borderWidth: 2, fill: true, backgroundColor: t.kneeFill, pointRadius: 0, tension: 0.3 },
          { label: '大腿 Thigh', data: [], borderColor: t.thigh, borderWidth: 1, fill: false, pointRadius: 0 },
          { label: '小腿 Shin', data: [], borderColor: t.shin, borderWidth: 1, fill: false, pointRadius: 0 },
          // 內外翻走**獨立的右側 y 軸**:它是帶符號的量(正=外翻、負=內翻)且量級
          // 只有 ±15° 上下,和 0–150° 的矢狀面角度共用刻度會被壓成一條貼底的直線,
          // 看起來像「沒有變化」——那正好是內外翻最需要被看見的時候會說的謊。
          // 資料照樣一直 push,只用 hidden 切換顯示,切換時不必重建整張圖。
          {
            label: '內外翻 Varus/Valgus',
            data: [],
            borderColor: t.roll,
            borderWidth: 1.5,
            borderDash: [4, 3],
            fill: false,
            pointRadius: 0,
            yAxisID: 'yRoll',
            hidden: !useStore.getState().settings.showKneeRoll
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { color: t.grid }, ticks: { color: t.tick, maxTicksLimit: 8 } },
          y: { beginAtZero: true, suggestedMax: 150, grid: { color: t.grid }, ticks: { color: t.tick } },
          // 右側軸只給內外翻。不畫格線,免得與左軸的格線交錯成一片網子;
          // 對稱範圍讓 0(中立位)恆在正中間,一眼看得出偏向哪一側。
          yRoll: {
            position: 'right',
            suggestedMin: -20,
            suggestedMax: 20,
            grid: { drawOnChartArea: false },
            ticks: { color: t.roll }
          }
        },
        plugins: { legend: { labels: { color: t.text } } }
      }
    })
    chartRef.current = chart

    // 系統主題切換 → 重新解析 token 套色
    const unsubTheme = onSystemThemeChange(() => {
      const n = chartTheme()
      chart.data.datasets[0].borderColor = n.knee
      chart.data.datasets[0].backgroundColor = n.kneeFill
      chart.data.datasets[1].borderColor = n.thigh
      chart.data.datasets[2].borderColor = n.shin
      chart.data.datasets[3].borderColor = n.roll
      const scales = chart.options.scales!
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sx = scales.x as any, sy = scales.y as any
      sx.grid.color = n.grid
      sx.ticks.color = n.tick
      sy.grid.color = n.grid
      sy.ticks.color = n.tick
      chart.options.plugins!.legend!.labels!.color = n.text
      chart.update('none')
    })

    // 訂閱角度更新(命令式 push,不經 React render)
    const unsub = useStore.subscribe((state, prev) => {
      // Session 開始(id 由 null 變為數字)時清空圖表
      if (state.session.id !== prev.session.id && state.session.id != null) {
        chart.data.labels = []
        chart.data.datasets.forEach((d) => (d.data = []))
        chart.update('none')
        return
      }
      // 切換內外翻顯示:只翻 hidden,不重建圖表,已累積的歷史點才不會被清掉
      if (state.settings.showKneeRoll !== prev.settings.showKneeRoll) {
        chart.data.datasets[3].hidden = !state.settings.showKneeRoll
        chart.update('none')
      }

      const a = state.angles
      if (!a || a === prev.angles) return

      const max = state.settings.maxChartPoints
      ;(chart.data.labels as string[]).push(new Date().toLocaleTimeString([], { hour12: false }))
      ;(chart.data.datasets[0].data as number[]).push(a.knee)
      ;(chart.data.datasets[1].data as number[]).push(a.thigh)
      ;(chart.data.datasets[2].data as number[]).push(a.shin)
      // 即使目前隱藏也照樣 push:打開切換時立刻有歷史曲線,
      // 而不是從那一刻開始重新累積(資料量由 maxChartPoints 上限管住)
      ;(chart.data.datasets[3].data as number[]).push(a.kneeRoll)

      if ((chart.data.labels as string[]).length > max) {
        ;(chart.data.labels as string[]).shift()
        chart.data.datasets.forEach((d) => d.data.shift())
      }
      chart.update('none')
    })

    return () => {
      unsub()
      unsubTheme()
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
