// HistoryView 的示範資料標記測試(計畫裡的 T7)。
//
// 這是防污染設計最後、也最關鍵的一環:migration 7 的欄位、型別層的必填約束、
// 進行中不可切換——全部都是為了讓這個徽章能出現。欄位存了卻沒有人讀,
// 就不會改變任何人的判讀,防護等於零。
//
// 這個檔案同時替代了「把 app 開起來用眼睛看」的那一步:本次工作環境無法截圖,
// 所以 UI 的驗證改由元件測試承擔,而不是宣稱看過。

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import type { Session } from '@shared/types'
import { installIrmsStub } from '../test/irmsStub'
import { HistoryView } from './HistoryView'

// Chart.js 需要 canvas 2D context,jsdom 與 happy-dom 都沒有。
// 這裡測的是列表與徽章,不是圖表,所以整個 mock 掉。
vi.mock('chart.js', () => ({
  Chart: class {
    static register = (): void => {}
    destroy = (): void => {}
  }
}))

function session(over: Partial<Session>): Session {
  return {
    id: 1,
    startTime: '2026-08-27T10:00:00.000Z',
    endTime: '2026-08-27T10:10:00.000Z',
    targetAngle: 90,
    tolerance: 10,
    holdTimeMs: 2000,
    actionId: 1,
    actionName: '膝關節屈曲',
    protocol: 'knee',
    repsCompleted: 12,
    safetyLimit: 120,
    triggerType: 'joint_angle',
    calibration: null,
    abandoned: 0,
    source: 'device',
    ...over
  }
}

describe('HistoryView 示範資料標記', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('只有 demo 列帶「示範資料」徽章,device 列沒有', async () => {
    installIrmsStub({
      sessions: {
        list: async () => [
          session({ id: 1, actionName: '真實療程', source: 'device' }),
          session({ id: 2, actionName: '示範療程', source: 'demo' })
        ]
      }
    })

    render(<HistoryView />)

    const realRow = await screen.findByText('真實療程')
    const demoRow = await screen.findByText('示範療程')

    // 徽章與動作名稱同一格:demo 有、device 沒有
    expect(within(demoRow.closest('td')!).getByText('示範資料')).toBeInTheDocument()
    expect(within(realRow.closest('td')!).queryByText('示範資料')).not.toBeInTheDocument()
  })

  it('全部都是真實紀錄時,畫面上不出現任何示範標記', async () => {
    installIrmsStub({
      sessions: {
        list: async () => [session({ id: 1, source: 'device' })]
      }
    })

    render(<HistoryView />)

    await waitFor(() => expect(screen.getByText('膝關節屈曲')).toBeInTheDocument())
    expect(screen.queryByText('示範資料')).not.toBeInTheDocument()
  })

  // 徽章之所以不能是唯一的防線:列表可以被捲過去、截圖可以只截到一半。
  // 匯出的檔案會離開這個 app,所以檔名必須自己說清楚。
  it('demo 列的徽章帶有說明用的 title,而不是只有顏色不同', async () => {
    installIrmsStub({
      sessions: { list: async () => [session({ id: 2, source: 'demo' })] }
    })

    render(<HistoryView />)

    const badge = await screen.findByText('示範資料')
    expect(badge).toHaveAttribute('title', expect.stringContaining('模擬資料'))
  })
})
