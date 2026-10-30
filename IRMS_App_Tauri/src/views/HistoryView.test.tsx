// HistoryView 的示範資料標記測試。
//
// 這是防污染設計最後、也最關鍵的一環:migration 7 的欄位、型別層的必填約束、
// 進行中不可切換——全部都是為了讓這個徽章能出現。欄位存了卻沒有人讀,
// 就不會改變任何人的判讀,防護等於零。

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import type { Session, SessionReviewData } from '@shared/types'
import userEvent from '@testing-library/user-event'
import { installIrmsStub } from '../test/irmsApiStub'
import { HistoryView } from './HistoryView'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'

// Chart.js 需要 canvas 2D context,jsdom 與 happy-dom 都沒有。
// 這裡測的是列表與徽章,不是圖表,所以整個 mock 掉。
vi.mock('chart.js', () => ({
  Chart: class {
    static register = (): void => {}
    destroy = (): void => {}
  },
  // services/chartSetup.ts registers these; values are irrelevant under the mock
  CategoryScale: {},
  Filler: {},
  Legend: {},
  LineController: {},
  LineElement: {},
  LinearScale: {},
  PointElement: {},
  Tooltip: {}
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
    comfortAngle: 100,
    limitAngle: 118,
    triggerType: 'joint_angle',
    calibration: null,
    abandoned: 0,
    source: 'device',
    ...over
  }
}

describe('HistoryView 示範資料標記', () => {
  it('loads bounded native pages rather than the complete session list', async () => {
    const all = Array.from({ length: 7 }, (_, i) => session({ id: i + 1, actionName: `Paged ${i + 1}` }))
    const stub = installIrmsStub({ sessions: { list: async () => all, listPage: async (page, pageSize) => ({ sessions: all.slice(page * pageSize, (page + 1) * pageSize), total: all.length, page, pageSize }) } })
    render(<HistoryView />)
    expect(await screen.findByText('Paged 1')).toBeInTheDocument()
    expect(stub.sessions.list).not.toHaveBeenCalled()
    expect(stub.sessions.listPage).toHaveBeenCalledWith(0, 6)
    expect(screen.queryByText('Paged 7')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '下一頁' }))
    expect(await screen.findByText('Paged 7')).toBeInTheDocument()
    expect(screen.queryByText('Paged 1')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '回顧' }))
    await userEvent.click(screen.getByRole('button', { name: '← 返回列表' }))
    expect(await screen.findByText('Paged 7')).toBeInTheDocument()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    useStore.getState().resetSession()
  })

  it('disables deletion of the session retained for saving', async () => {
    installIrmsStub({ sessions: { list: async () => [session({ id: 7 })] } })
    useStore.getState().patchSession({ id: 7, running: false })
    render(<HistoryView />)
    expect(await screen.findByRole('button', { name: /7/ })).toBeDisabled()
    useStore.getState().resetSession()
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
    expect(within(demoRow.closest('.v3-history-row') as HTMLElement).getByText('示範資料')).toBeInTheDocument()
    expect(within(realRow.closest('.v3-history-row') as HTMLElement).queryByText('示範資料')).not.toBeInTheDocument()
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

describe('HistoryView 回顧頁(v3)', () => {
  it.each([['segment_elevation', '5.0°'], ['segment_extension', '25.0°']] as const)('keeps full-resolution %s metric mapping', async (triggerType, expected) => {
    const full = [-25, 5].map((proximalAngle, id) => ({ id, sessionId: 9, timestamp: `2026-08-27T10:00:0${id}.000Z`, kneeAngle: 99, proximalAngle, distalAngle: 0, kneeRoll: 0, proximalRoll: 0, distalRoll: 0 }))
    installIrmsStub({ sessions: { list: async () => [session({ id: 9, triggerType })], getReview: async () => ({ chart: full.slice(0, 1), analysis: full }) } })
    render(<HistoryView />)
    await userEvent.click(await screen.findByRole('button', { name: '回顧' }))
    const peak = screen.getByText(/^峰值/).parentElement as HTMLElement
    await waitFor(() => expect(within(peak).getByText(expected)).toBeInTheDocument())
  })

  it('reports current snapshot load failure without an unhandled rejection', async () => {
    useUiStore.setState({ toasts: [] })
    installIrmsStub({ sessions: { list: async () => [session({})], getReview: async () => { throw new Error('query failed') } } })
    render(<HistoryView />)
    await userEvent.click(await screen.findByRole('button', { name: '回顧' }))
    await waitFor(() => expect(useUiStore.getState().toasts.some((toast) => toast.message === '載入歷史失敗')).toBe(true))
  })

  it.each(['resolve', 'reject'] as const)('ignores an obsolete %s after opening another session', async (outcome) => {
    useUiStore.setState({ toasts: [] })
    let resolveOld!: (value: SessionReviewData) => void
    let rejectOld!: (error: Error) => void
    const old = new Promise<SessionReviewData>((resolve, reject) => { resolveOld = resolve; rejectOld = reject })
    const reading = (value: number) => ({ id: 1, sessionId: 2, timestamp: '2026-08-27T10:00:00Z', kneeAngle: value, proximalAngle: 0, distalAngle: 0, kneeRoll: 0, proximalRoll: 0, distalRoll: 0 })
    installIrmsStub({ sessions: { list: async () => [session({ id: 1 }), session({ id: 2 })], getReview: async (id) => id === 1 ? old : { chart: [reading(99)], analysis: [reading(99)] } } })
    render(<HistoryView />)
    await userEvent.click((await screen.findAllByRole('button', { name: '回顧' }))[0])
    await userEvent.click(screen.getByRole('button', { name: '← 返回列表' }))
    await userEvent.click(screen.getAllByRole('button', { name: '回顧' })[1])
    expect(await screen.findByText('99.0°')).toBeInTheDocument()
    await act(async () => { if (outcome === 'resolve') resolveOld({ chart: [reading(777)], analysis: [reading(777)] }); else rejectOld(new Error('old query failed')) })
    expect(screen.queryByText('777.0°')).not.toBeInTheDocument()
    expect(screen.getByText('99.0°')).toBeInTheDocument()
    expect(useUiStore.getState().toasts).toHaveLength(0)
  })

  it('loads one review snapshot and does not refetch full rows on locale redraw', async () => {
    const reading = { id: 1, sessionId: 9, timestamp: '2026-08-27T10:00:00.000Z', kneeAngle: 10, proximalAngle: 5, distalAngle: 6, kneeRoll: 0, proximalRoll: 0, distalRoll: 0 }
    const stub = installIrmsStub({ sessions: {
      list: async () => [session({ id: 9 })],
      getData: async () => [reading],
      getReview: async () => ({ chart: [reading], analysis: [reading] })
    } })
    render(<HistoryView />)
    await userEvent.click(await screen.findByRole('button', { name: '回顧' }))
    expect(stub.sessions.getData).not.toHaveBeenCalled()
    await waitFor(() => expect(stub.sessions.getReview).toHaveBeenCalledTimes(1))
    act(() => useStore.setState((s) => ({ settings: { ...s.settings, language: 'en' } })))
    expect(screen.getByRole('heading', { level: 1, name: 'Session review' })).toBeInTheDocument()
    expect(stub.sessions.getReview).toHaveBeenCalledTimes(1)
    act(() => useStore.setState((s) => ({ settings: { ...s.settings, language: 'zh-Hant' } })))
  })

  it('沒有個人範圍快照的舊紀錄顯示未量測,不補任何預設值', async () => {
    installIrmsStub({ sessions: { list: async () => [session({ id: 8, comfortAngle: null, limitAngle: null })] } })
    render(<HistoryView />)
    await userEvent.click(await screen.findByRole('button', { name: '回顧' }))
    const detail = screen.getByRole('complementary', { name: '療程細節' })
    expect(detail).toHaveTextContent('舒適角度未量測')
    expect(detail).toHaveTextContent('極限範圍未設定')
  })

  it('按下回顧以整頁取代列表,返回列表後回到原清單', async () => {
    installIrmsStub({ sessions: { list: async () => [session({ id: 7, actionName: '膝關節屈曲' })] } })
    render(<HistoryView />)
    await userEvent.click(await screen.findByRole('button', { name: '回顧' }))
    expect(screen.getByRole('heading', { level: 1, name: '療程回顧' })).toBeInTheDocument()
    // 個人範圍以當時快照呈現(comfort 100 / limit 118),舊版 safetyLimit 不再顯示
    const detail = screen.getByRole('complementary', { name: '療程細節' })
    expect(detail).toHaveTextContent('舒適角度100°')
    expect(detail).toHaveTextContent('極限範圍118°')
    expect(detail).not.toHaveTextContent('120°')
    await userEvent.click(screen.getByRole('button', { name: '← 返回列表' }))
    expect(screen.getByRole('heading', { level: 1, name: '療程紀錄' })).toBeInTheDocument()
  })
  it('匯出紀錄走原生存檔(exportText),檔名與內容帶 metadata', async () => {
    const full = [10, 99].map((kneeAngle, id) => ({ id, sessionId: 9, timestamp: `2026-08-27T10:00:0${id}.000Z`, kneeAngle, proximalAngle: 5, distalAngle: 6, kneeRoll: 0, proximalRoll: 0, distalRoll: 0 }))
    const stub = installIrmsStub({
      sessions: {
        list: async () => [session({ id: 9 })],
        getReview: async () => ({ chart: full.slice(0, 1), analysis: full }),
        getData: async () => full
      }
    })
    render(<HistoryView />)
    await userEvent.click(await screen.findByRole('button', { name: '回顧' }))
    const btn = screen.getByRole('button', { name: '匯出紀錄' })
    expect(await screen.findByText('99.0°')).toBeInTheDocument()
    await waitFor(() => expect(btn).toBeEnabled())
    await userEvent.click(btn)
    await waitFor(() => expect(stub.sessions.exportText).toHaveBeenCalledTimes(1))
    const [name, contents] = stub.sessions.exportText.mock.calls[0] as [string, string]
    expect(name).toBe('irms_session_9.csv')
    expect(contents).toContain('# session,9')
    expect(contents).toContain('timestamp,kneeAngle')
    expect(contents).toContain('2026-08-27T10:00:01.000Z,99,5,6,0,0,0')
    expect(stub.sessions.getData).toHaveBeenCalledExactlyOnceWith(9)
  })
})
