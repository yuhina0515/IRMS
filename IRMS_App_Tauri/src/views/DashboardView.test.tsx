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

function calibrate(): void {
  useStore.setState((s) => ({ settings: { ...s.settings, lastCalibratedAt: '2026-09-25T06:00:00.000Z' } }))
}

describe('DashboardView 狀態橫幅(PROPOSAL §5 state contract)', () => {
  it('未連線時顯示「裝置未連線」', () => {
    render(<DashboardView />)
    expect(screen.getByText('裝置未連線')).toBeInTheDocument()
  })

  it('已連線、已校準但未選動作時顯示「請選擇動作」', () => {
    useStore.setState({ isConnected: true })
    calibrate()
    render(<DashboardView />)
    expect(screen.getByText('請選擇動作')).toBeInTheDocument()
  })

  it('連線、校準、選好動作後顯示「準備開始」', () => {
    connectWithAction()
    calibrate()
    render(<DashboardView />)
    expect(screen.getByText('準備開始')).toBeInTheDocument()
  })

  it('未支援協定優先於連線與動作狀態,並提供前往設定', () => {
    connectWithAction()
    calibrate()
    useStore.setState((s) => ({ settings: { ...s.settings, protocol: 'elbow' } }))
    render(<DashboardView />)
    expect(screen.getByRole('status')).toHaveTextContent('此協定尚未支援')
    expect(screen.getByRole('button', { name: '前往設定' })).toBeInTheDocument()
    // 開始按鈕同樣說明原因,而不是叫使用者去連線
    expect(screen.getByRole('button', { name: '此協定尚未支援' })).toBeDisabled()
  })
})

describe('DashboardView 硬體錯誤', () => {
  it('ERR 時顯示感測器異常,主指標為 — 而非數字,姿態標示不可用', () => {
    connectWithAction()
    calibrate()
    useStore.setState({
      hardwareError: 'ERR:1',
      angles: { thigh: 40, shin: -5, knee: 45, thighRoll: 0, shinRoll: 0, kneeRoll: 0, rawThigh: 40, rawShin: -5, rawThighRoll: 0, rawShinRoll: 0 }
    })
    render(<DashboardView />)
    expect(screen.getByText('感測器異常 · ERR:1')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('45')).not.toBeInTheDocument()
    expect(screen.getByText('感測器異常 · 姿態不可用')).toBeInTheDocument()
  })
})

describe('DashboardView 校準', () => {
  it('尚未校準時顯示警示並擋下開始療程,按鈕改為開始校準並開啟精靈', async () => {
    connectWithAction()
    render(<DashboardView />)
    expect(screen.getByText('請先完成校準')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '開始療程' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '開始校準' }))
    // CalibrationWizard 的標題
    expect(await screen.findByText(/校準/, { selector: 'h3' })).toBeInTheDocument()
  })
})

describe('DashboardView 超限警報', () => {
  it('警報啟動時顯示超限橫幅(role=alert),靜音呼叫 sessionController.silenceAlarm', async () => {
    connectWithAction()
    calibrate()
    const silence = vi.spyOn(sessionController, 'silenceAlarm').mockImplementation(() => {})
    useStore.setState((s) => ({ session: { ...s.session, running: true, alarmActive: true } }))
    render(<DashboardView />)
    expect(screen.getByRole('alert')).toHaveTextContent('超出上限,請停止加深')
    await userEvent.click(screen.getByRole('button', { name: '靜音 30 秒' }))
    expect(silence).toHaveBeenCalledOnce()
  })
})

describe('DashboardView 療程生命週期', () => {
  it('連線、校準且已選動作時,按下開始療程呼叫 sessionController.startSession', async () => {
    connectWithAction()
    calibrate()
    const start = vi.spyOn(sessionController, 'startSession').mockResolvedValue(undefined)
    render(<DashboardView />)
    await userEvent.click(screen.getByRole('button', { name: '開始療程' }))
    expect(start).toHaveBeenCalledOnce()
  })

  it('未連線時開始按鈕停用,文案提示先連線', () => {
    useStore.setState({ customActions: [ACTION], selectedActionId: ACTION.id })
    calibrate()
    render(<DashboardView />)
    expect(screen.getByRole('button', { name: '請先連線裝置' })).toBeDisabled()
  })

  it('療程進行中顯示次數與時間,按下結束療程呼叫 sessionController.endSession', async () => {
    connectWithAction()
    calibrate()
    const end = vi.spyOn(sessionController, 'endSession').mockResolvedValue(true)
    useStore.setState((s) => ({ session: { ...s.session, running: true, reps: 6, elapsedSec: 138 } }))
    render(<DashboardView />)
    expect(screen.getByText('02:18')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '結束療程' }))
    expect(end).toHaveBeenCalledOnce()
  })
})
