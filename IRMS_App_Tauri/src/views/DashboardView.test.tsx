// DashboardView 旅程測試:連線 → 選動作 → 校準警示 → 硬體錯誤 → 超限警報 → Start/End Session。
// 2026-09-24 UI 重建後改為狀態驅動(services/dashboardState.ts):不能量測的狀態以阻斷面板取代量表,
// 斷言改從語言檔取字串,文案調整時測試不必逐字同步,但仍驗證畫面真的接上了正確的那一句。
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
import { zhTW } from '../i18n/zh-TW'
import { en } from '../i18n/en'

const t = zhTW

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
  useStore.setState((s) => ({
    settings: { ...s.settings, protocol: 'knee', lastCalibratedAt: null, language: 'zh-TW', focusMode: false }
  }))
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

describe('DashboardView 阻斷狀態(不能量測時不畫量表)', () => {
  it('未連線時顯示「裝置未連線」阻斷面板與連線按鈕,且不渲染量表', () => {
    render(<DashboardView />)
    expect(screen.getByText(t.dashboard.blocked.disconnected.title)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t.dashboard.blocked.disconnected.action })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /膝關節夾角/ })).not.toBeInTheDocument()
  })

  it('已連線但未選動作時顯示「尚未選擇動作」', () => {
    useStore.setState({ isConnected: true })
    render(<DashboardView />)
    expect(screen.getByText(t.dashboard.blocked.noAction.title)).toBeInTheDocument()
  })

  it('連線且選好動作後顯示量表與教練提示,不再有阻斷面板', () => {
    connectWithAction()
    render(<DashboardView />)
    expect(screen.queryByText(t.dashboard.blocked.disconnected.title)).not.toBeInTheDocument()
    expect(screen.queryByText(t.dashboard.blocked.noAction.title)).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: /膝關節夾角/ })).toBeInTheDocument()
    expect(screen.getByText(t.guidance.noData)).toBeInTheDocument()
  })

  it('未支援協定時顯示協定阻斷,即使已連線且已選動作', () => {
    connectWithAction()
    useStore.setState((s) => ({ settings: { ...s.settings, protocol: 'elbow' } }))
    render(<DashboardView />)
    expect(screen.getByRole('heading', { name: t.dashboard.blocked.unsupported.title })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t.session.unsupported })).toBeDisabled()
  })
})

describe('DashboardView 硬體錯誤', () => {
  it('ERR 時顯示感測器異常阻斷;展開證據層後詳細數值全數改標 ERR', async () => {
    connectWithAction()
    useStore.setState({ hardwareError: 'ERR:1' })
    render(<DashboardView />)
    expect(screen.getByText(t.dashboard.blocked.hardwareError.title)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: t.dashboard.showEvidence }))
    expect(screen.getAllByText('ERR').length).toBeGreaterThan(0)
  })
})

describe('DashboardView 校準警示', () => {
  it('尚未校準時顯示警示條,按下按鈕開啟校準精靈', async () => {
    connectWithAction()
    render(<DashboardView />)
    expect(screen.getByText(t.dashboard.notCalibrated)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: t.dashboard.startWizard }))
    // 校準精靈開啟後會出現步驟 1 的專屬按鈕
    expect(screen.getByRole('button', { name: t.wizard.s1.start })).toBeInTheDocument()
  })

  it('已校準過(lastCalibratedAt 非 null)時不顯示警示條', () => {
    connectWithAction()
    useStore.setState((s) => ({ settings: { ...s.settings, lastCalibratedAt: '2026-09-19T00:00:00.000Z' } }))
    render(<DashboardView />)
    expect(screen.queryByText(t.dashboard.notCalibrated)).not.toBeInTheDocument()
  })
})

describe('DashboardView 超限警報', () => {
  it('警報啟動時主面板顯示警報列,點擊靜音呼叫 sessionController.silenceAlarm', async () => {
    connectWithAction()
    useStore.setState((s) => ({ session: { ...s.session, running: true, alarmActive: true } }))
    const spy = vi.spyOn(sessionController, 'silenceAlarm').mockImplementation(() => {})

    render(<DashboardView />)
    expect(screen.getByRole('alert')).toHaveTextContent(t.dashboard.alarmTitleNoValue)

    await userEvent.click(screen.getByRole('button', { name: t.dashboard.silence }))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('未警報時不顯示警報列', () => {
    connectWithAction()
    render(<DashboardView />)
    expect(screen.queryByRole('button', { name: t.dashboard.silence })).not.toBeInTheDocument()
  })
})

describe('DashboardView 療程生命週期(開始/結束)', () => {
  it('連線且已選動作時,按下開始療程呼叫 sessionController.startSession', async () => {
    connectWithAction()
    const spy = vi.spyOn(sessionController, 'startSession').mockResolvedValue(undefined)

    render(<DashboardView />)
    const startBtn = screen.getByRole('button', { name: t.session.start })
    expect(startBtn).not.toBeDisabled()

    await userEvent.click(startBtn)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('未連線時開始按鈕停用,文案改為提示先連線', () => {
    render(<DashboardView />)
    expect(screen.getByRole('button', { name: t.session.connectFirst })).toBeDisabled()
  })

  it('療程進行中按下結束療程呼叫 sessionController.endSession', async () => {
    connectWithAction()
    useStore.setState((s) => ({ session: { ...s.session, running: true } }))
    const spy = vi.spyOn(sessionController, 'endSession').mockResolvedValue(true)

    render(<DashboardView />)
    await userEvent.click(screen.getByRole('button', { name: t.session.end }))
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('DashboardView 專注模式與語言', () => {
  it('專注模式隱藏控制欄與證據層,但保留結束療程按鈕', () => {
    connectWithAction()
    useStore.setState((s) => ({
      settings: { ...s.settings, focusMode: true },
      session: { ...s.session, running: true }
    }))
    render(<DashboardView />)
    expect(screen.queryByLabelText(t.dashboard.evidence)).not.toBeInTheDocument()
    expect(screen.queryByText(t.session.action)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: t.session.end })).toBeInTheDocument()
  })

  it('切換為英文時畫面文字取自英文語言檔', () => {
    useStore.setState((s) => ({ settings: { ...s.settings, language: 'en' } }))
    render(<DashboardView />)
    expect(screen.getByText(en.dashboard.blocked.disconnected.title)).toBeInTheDocument()
    expect(screen.queryByText(t.dashboard.blocked.disconnected.title)).not.toBeInTheDocument()
  })
})
