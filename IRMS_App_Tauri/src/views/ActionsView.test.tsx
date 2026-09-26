// ActionsView 的空狀態與搜尋接線測試。
//
// 查詢邏輯本身由 actionQuery.test.ts 窮舉;這裡只鎖 UI 才有的那個決定:
// **「這個協定沒有動作」與「搜尋不到」是兩件事**,給的出口也不同
// (載入範本 vs 清除搜尋)。混成同一句會讓使用者按下一個幫不上忙的按鈕。

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CustomAction } from '@shared/types'
import { installIrmsStub } from '../test/irmsApiStub'
import { useStore } from '../store/useStore'
import { ActionsView } from './ActionsView'

function action(over: Partial<CustomAction> & { id: number; name: string }): CustomAction {
  return {
    description: null,
    protocol: 'knee',
    targetAngle: 90,
    tolerance: 10,
    holdTimeMs: 2000,
    triggerType: 'joint_angle',
    safetyLimit: null,
    ...over
  }
}

const ACTIONS = [
  action({ id: 1, name: '膝關節屈曲' }),
  action({ id: 2, name: '直腿抬高', triggerType: 'segment_elevation' })
]

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({
    customActions: [],
    settings: { ...useStore.getState().settings, protocol: 'knee' }
  })
})

describe('ActionsView 空狀態', () => {
  it('協定底下沒有動作時,提供「載入預設範本」而不是搜尋框', async () => {
    installIrmsStub({ actions: { list: async () => [] } })
    render(<ActionsView />)

    await waitFor(() => expect(screen.getByText('此協定尚無動作範本')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '載入預設範本' })).toBeInTheDocument()
    // 對一個已知是空的集合請使用者搜尋是沒有意義的
    expect(screen.queryByPlaceholderText('搜尋名稱或說明…')).not.toBeInTheDocument()
  })

  it('有動作但搜尋不到時,提供「清除搜尋」而不是「載入預設範本」', async () => {
    installIrmsStub({ actions: { list: async () => ACTIONS } })
    useStore.setState({ customActions: ACTIONS })
    render(<ActionsView />)

    const search = await screen.findByPlaceholderText('搜尋名稱或說明…')
    await userEvent.type(search, '不存在')

    expect(await screen.findByText(/找不到符合/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清除搜尋' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '載入預設範本' })).not.toBeInTheDocument()
  })

  it('「清除搜尋」按下去之後動作重新出現', async () => {
    installIrmsStub({ actions: { list: async () => ACTIONS } })
    useStore.setState({ customActions: ACTIONS })
    render(<ActionsView />)

    const search = await screen.findByPlaceholderText('搜尋名稱或說明…')
    await userEvent.type(search, '不存在')
    await userEvent.click(await screen.findByRole('button', { name: '清除搜尋' }))

    expect(await screen.findByText('膝關節屈曲')).toBeInTheDocument()
    expect(screen.getByText('直腿抬高')).toBeInTheDocument()
  })
})

describe('ActionsView 搜尋', () => {
  it('即時縮小清單', async () => {
    installIrmsStub({ actions: { list: async () => ACTIONS } })
    useStore.setState({ customActions: ACTIONS })
    render(<ActionsView />)

    const search = await screen.findByPlaceholderText('搜尋名稱或說明…')
    await userEvent.type(search, '直腿')

    expect(await screen.findByText('直腿抬高')).toBeInTheDocument()
    expect(screen.queryByText('膝關節屈曲')).not.toBeInTheDocument()
  })
})

describe('ActionsView 檢視面板(v3)', () => {
  it('選取動作後在右側顯示目標、保持與實際生效的超限門檻', async () => {
    installIrmsStub({ actions: { list: async () => ACTIONS } })
    useStore.setState({ customActions: ACTIONS })
    render(<ActionsView />)

    await userEvent.click(await screen.findByRole('button', { name: /膝關節屈曲/ }))
    const inspector = screen.getByRole('complementary', { name: '動作內容' })
    expect(inspector).toHaveTextContent('90° ±10°')
    expect(inspector).toHaveTextContent('2.0 秒')
    // safetyLimit 未設定 → 導出值 target + tol + margin(與引擎一致,不是空白)
    expect(inspector).toHaveTextContent('110°(導出)')
  })

  it('新增動作在右側編輯,儲存時送出鉗制後的參數', async () => {
    const create = vi.fn(async (input: unknown) => ({ id: 9, ...(input as object) }) as CustomAction)
    installIrmsStub({ actions: { list: async () => ACTIONS, create } })
    useStore.setState({ customActions: ACTIONS })
    render(<ActionsView />)

    await userEvent.click(screen.getByRole('button', { name: '+ 新增動作' }))
    await userEvent.type(screen.getByLabelText('動作名稱'), '坐姿伸膝')
    await userEvent.click(screen.getByRole('button', { name: '儲存' }))
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create.mock.calls[0][0]).toMatchObject({ name: '坐姿伸膝', targetAngle: 90, tolerance: 10 })
  })
})
