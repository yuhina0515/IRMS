// DashboardView 旅程測試:連線 → 選動作 → 校準警示 → 硬體錯誤 → 超限警報 → Start/End Session。
//
// 為什麼這個檔案存在:sessionController.test.ts(node project)已經徹底鎖住 CMD 指令的
// 有序稽核("送出正確的字串與順序"),但那條測試完全繞過 React——從未驗證過畫面本身
// 是否正確反映 store 狀態(連線提示是否真的顯示、ERR 是否真的讓數值卡在 'ERR' 字樣、
// 超限橫幅的靜音按鈕是否真的接到 sessionController.silenceAlarm)。這是
// OPTIMIZATION.md §三"補齊 Tauri 邊界與旅程測試"點名的缺口——App/Dashboard 的「連線→
// Session→ERR/斷線→收尾」旅程目前只有 5 個 .test.tsx,DashboardView 不在其中。
//
// sessionController 透過 SessionControlPanel 匯入 bluetoothService,其建構子呼叫
// @tauri-apps/api/event 的 listen()——測試環境沒有真正的 Tauri runtime,不 mock 會直接炸在
// 模組載入階段。全程只操作 useStore 狀態,從不呼叫 bluetoothService.connect()/send(),
// 所以只要 listen() 能 resolve 就夠了(同 sessionController.test.ts 的既有作法)。
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {})
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => undefined)
}))

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CustomAction } from '@shared/types'
import { useStore } from '../store/useStore'
import { sessionController } from '../services/sessionController'
import { DashboardView } from './DashboardView'

const ACTION: CustomAction = {
  id: 1,
  name: '抬大腿',
  description: null,
  protocol: 'knee',
  targetAngle: 90,
  tolerance: 10,
  holdTimeMs: 3000,
  triggerType: 'joint_angle',
  safetyLimit: null
}

/** 每個測試前重置到已知基準:未連線、無動作、未校準、無硬體錯誤、Session 未開始。 */
function resetStore(): void {
  useStore.setState({
    isConnected: false,
    deviceName: null,
    hardwareError: null,
    angles: null,
    customActions: [],
    selectedActionId: null,
    params: { targetAngle: 90, tolerance: 10, holdTimeMs: 3000 },
    session: {
      id: null,
      reps: 0,
      holdProgress: 0,
      inZone: false,
      alarmActive: false,
      elapsedSec: 0,
      running: false,
      phase: 'idle'
    }
  })
  useStore.setState((s) => ({ settings: { ...s.settings, protocol: 'knee', lastCalibratedAt: null } }))
}

function connectWithAction(): void {
  useStore.setState({ isConnected: true, customActions: [ACTION], selectedActionId: ACTION.id })
}

beforeEach(() => {
  resetStore()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DashboardView 連線/選動作提示', () => {
  it('未連線時顯示「請先於頂部連線裝置」', () => {
    render(<DashboardView />)
    expect(screen.getByText('請先於頂部連線裝置')).toBeInTheDocument()
  })

  it('已連線但未選動作時顯示「請先選擇復健動作」', () => {
    useStore.setState({ isConnected: true })
    render(<DashboardView />)
    expect(screen.getByText('請先選擇復健動作')).toBeInTheDocument()
  })

  it('連線且選好動作後兩則提示皆不顯示(改為教練提示文字)', () => {
    connectWithAction()
    render(<DashboardView />)
    expect(screen.queryByText('請先於頂部連線裝置')).not.toBeInTheDocument()
    expect(screen.queryByText('請先選擇復健動作')).not.toBeInTheDocument()
  })

  it('未支援協定時顯示協定提示,即使已連線且已選動作', () => {
    connectWithAction()
    useStore.setState((s) => ({ settings: { ...s.settings, protocol: 'elbow' } }))
    render(<DashboardView />)
    expect(screen.getByText('此協定尚未支援,請於設定切換回膝關節')).toBeInTheDocument()
  })
})

describe('DashboardView 硬體錯誤', () => {
  it('ERR 時顯示硬體異常提示,詳細數值全數改標 ERR', () => {
    connectWithAction()
    useStore.setState({ hardwareError: 'ERR:1' })
    render(<DashboardView />)
    expect(screen.getByText('硬體異常,等待感測器復原…')).toBeInTheDocument()
    // DetailStatsGrid 於窄版 preset 常駐渲染一份,fmt() 對 hardwareError 一律回傳 'ERR'
    expect(screen.getAllByText('ERR').length).toBeGreaterThan(0)
  })
})

describe('DashboardView 校準警示', () => {
  it('尚未校準時顯示警示 chip,點擊開啟校準精靈', async () => {
    connectWithAction()
    render(<DashboardView />)
    const chip = screen.getByText(/感測器尚未校準/)
    expect(chip).toBeInTheDocument()
    await userEvent.click(chip)
    // 校準精靈開啟後會出現步驟 1 的專屬文案
    expect(screen.getByRole('button', { name: '開始' })).toBeInTheDocument()
  })

  it('已校準過(lastCalibratedAt 非 null)時不顯示警示 chip', () => {
    connectWithAction()
    useStore.setState((s) => ({ settings: { ...s.settings, lastCalibratedAt: '2026-09-19T00:00:00.000Z' } }))
    render(<DashboardView />)
    expect(screen.queryByText(/感測器尚未校準/)).not.toBeInTheDocument()
  })
})

describe('DashboardView 超限警報', () => {
  it('警報啟動時顯示橫幅,點擊靜音呼叫 sessionController.silenceAlarm', async () => {
    connectWithAction()
    useStore.setState((s) => ({ session: { ...s.session, running: true, alarmActive: true } }))
    const spy = vi.spyOn(sessionController, 'silenceAlarm').mockImplementation(() => {})

    render(<DashboardView />)
    expect(screen.getByText('⚠ 超限警報')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /靜音 30 秒/ }))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('未警報時不顯示橫幅', () => {
    connectWithAction()
    render(<DashboardView />)
    expect(screen.queryByText('⚠ 超限警報')).not.toBeInTheDocument()
  })
})

describe('DashboardView Session 生命週期(Start/End)', () => {
  it('連線且已選動作時,按下 Start Session 呼叫 sessionController.startSession', async () => {
    connectWithAction()
    const spy = vi.spyOn(sessionController, 'startSession').mockResolvedValue(undefined)

    render(<DashboardView />)
    const startBtn = screen.getByRole('button', { name: 'Start Session' })
    expect(startBtn).not.toBeDisabled()

    await userEvent.click(startBtn)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('未連線時 Start 按鈕停用,文案改為提示先連線', () => {
    render(<DashboardView />)
    const btn = screen.getByRole('button', { name: 'Connect device first' })
    expect(btn).toBeDisabled()
  })

  it('Session 進行中按下 End Session 呼叫 sessionController.endSession', async () => {
    connectWithAction()
    useStore.setState((s) => ({ session: { ...s.session, running: true } }))
    const spy = vi.spyOn(sessionController, 'endSession').mockResolvedValue(true)

    render(<DashboardView />)
    await userEvent.click(screen.getByRole('button', { name: 'End Session' }))
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
