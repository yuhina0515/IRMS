// MetricGauge 的元件測試。
//
// 這是本專案第一個元件測試,選它當第一個是因為它純 props 驅動、零 mock,
// 而且它的兩條規則各自對應一個「只有把 app 開起來才看得見」的已修缺陷
// (2026-08-03 目視驗收)。純函式層當時全綠,缺陷仍然出貨了——
// 那個缺口正是這個檔案要補上的。
//
// 斷言的挑選依專案規則 #1:它改變哪一個決定,以及那是誰的決定。
// 這裡全部是「督導/患者看著畫面做的判讀」,不是引擎的判定。

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetricGauge } from './MetricGauge'
import type { MetricInfo, MetricSample, MetricZone } from '../services/movementMetric'

const zone: MetricZone = { min: 80, max: 100, overLimit: 120, rest: 20 }
const info: MetricInfo = { key: 'kneeAngle', label: '膝關節夾角', unit: '°' }
const sample: MetricSample = { value: 90, kneeStraightOk: true, knee: 90, kneeMax: null }

function renderGauge(props: Partial<Parameters<typeof MetricGauge>[0]> = {}): void {
  render(
    <MetricGauge
      sample={sample}
      zone={zone}
      info={info}
      phase="idle"
      alarm={false}
      error={false}
      {...props}
    />
  )
}

describe('MetricGauge', () => {
  it('顯示取整後的目前值與目標帶文字', () => {
    renderGauge({ sample: { ...sample, value: 87.4 } })
    expect(screen.getByText('87')).toBeInTheDocument()
    expect(screen.getByText(/目標 80–100°/)).toBeInTheDocument()
  })

  it('error 時大字顯示 ERR 而非數值', () => {
    renderGauge({ error: true })
    expect(screen.getByText('ERR')).toBeInTheDocument()
    expect(screen.queryByText('90')).not.toBeInTheDocument()
  })

  // ── 迴歸鎖 #1(2026-08-01 意見 #29 / 2026-08-03 目視驗收)──
  // 斷線後 store 的 angles 不會被清掉,量表會繼續顯示最後一筆值長達整個重連期間。
  // 但冷開機「從未連線過」時根本沒有值可以過期,掛上「數值已過期」是在警告一個
  // 不存在的數字——而假警告會訓練使用者忽略真警告。
  it('stale 但從未有過數值(冷開機)時,不得顯示過期警告', () => {
    renderGauge({ sample: null, stale: true })
    expect(screen.getByText('--')).toBeInTheDocument()
    expect(screen.queryByText(/數值已過期/)).not.toBeInTheDocument()
  })

  it('stale 且確實有數值時,才顯示過期警告', () => {
    renderGauge({ stale: true })
    expect(screen.getByText(/斷線中 · 數值已過期/)).toBeInTheDocument()
  })

  // ── 迴歸鎖 #2 ──
  // 未支援協定時,量表照樣畫得出目標帶與超限刻線(那些數字全來自動作參數,
  // 與感測器裝在哪條肢體無關),於是畫面看起來完全正常,卻與停用的開始按鈕矛盾。
  it('unsupported 時顯示未支援說明,且優先於過期警告', () => {
    renderGauge({ unsupported: true, stale: true })
    expect(screen.getByText(/此協定尚未支援/)).toBeInTheDocument()
    expect(screen.queryByText(/數值已過期/)).not.toBeInTheDocument()
  })

  it('膝直前置徽章只在 kneeMax 存在時出現(joint_angle 不畫)', () => {
    renderGauge()
    expect(screen.queryByText(/膝直前置/)).not.toBeInTheDocument()

    cleanupAndRender({ sample: { value: 40, kneeStraightOk: false, knee: 35, kneeMax: 20 } })
    expect(screen.getByText(/膝直前置:35° \/ 需 ≤ 20°/)).toBeInTheDocument()
  })
})

// setup.ts 的 afterEach 只在每個 it 之間 cleanup,同一個 it 內連續 render 需自行處理
function cleanupAndRender(props: Partial<Parameters<typeof MetricGauge>[0]>): void {
  document.body.innerHTML = ''
  renderGauge(props)
}
