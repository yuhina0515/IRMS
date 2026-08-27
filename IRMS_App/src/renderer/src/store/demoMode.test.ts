// 示範模式防護的測試。
//
// 示範模式會出貨,而它產生的資料寫進與療程紀錄同一個資料表。防護若只靠人工檢查,
// 幾個月後某次改動讓它失效時不會有任何人發現——而失效的表現正是「模擬資料看起來
// 像真實量測」,那是這整套設計唯一要防的事。所以每一道防線都要有測試。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CustomAction } from '@shared/types'
import { installIrmsStub, type IrmsStub } from '../test/irmsStub'
import { useStore } from './useStore'
import { useUiStore } from './useUiStore'
import { bluetoothService } from '../services/bluetooth'
import { sessionController } from '../services/sessionController'
import { REFERENCE_ACTION } from '../services/simulation/scenarios'

const ACTION: CustomAction = {
  id: 1,
  name: '測試動作',
  description: null,
  protocol: 'knee',
  ...REFERENCE_ACTION
}

let stub: IrmsStub

beforeEach(() => {
  stub = installIrmsStub()
  useStore.setState({ customActions: [ACTION], selectedActionId: ACTION.id })
  useStore.getState().resetSession()
  useUiStore.setState({ demoMode: false })
})

afterEach(async () => {
  if (useStore.getState().session.id != null) await sessionController.endSession()
  bluetoothService.endSimulated()
  useUiStore.setState({ demoMode: false })
  stub.uninstall()
  vi.restoreAllMocks()
})

describe('示範模式旗標的存活範圍', () => {
  it('預設為關閉——每次啟動一律是真實模式', () => {
    expect(useUiStore.getState().demoMode).toBe(false)
  })

  it('不進 persist:useUiStore 沒有 persist 中介層,旗標隨行程死亡', () => {
    // 這是結構性保證而非行為斷言:useStore 有 persist(所以 settings 會跨啟動存活),
    // useUiStore 沒有。示範模式若被記住,使用者幾週後打開 app 會落在示範模式裡
    // 而毫無所覺,然後把示範資料當成療程紀錄。
    expect('persist' in useUiStore).toBe(false)
    expect(useUiStore.getState()).not.toHaveProperty('_hasHydrated')
  })
})

describe('Session 進行中不得切換', () => {
  it('拒絕切換並留下日誌(不是靜默忽略)', async () => {
    await sessionController.startSession()
    const logsBefore = useStore.getState().logs.length

    expect(useUiStore.getState().setDemoMode(true)).toBe(false)

    expect(useUiStore.getState().demoMode).toBe(false)
    expect(useStore.getState().logs.length).toBeGreaterThan(logsBefore)
    expect(useStore.getState().logs.some((l) => l.includes('cannot be toggled'))).toBe(true)
  })

  it('結束 Session 之後可以切換', async () => {
    await sessionController.startSession()
    expect(useUiStore.getState().setDemoMode(true)).toBe(false)

    await sessionController.endSession()
    expect(useUiStore.getState().setDemoMode(true)).toBe(true)
    expect(useUiStore.getState().demoMode).toBe(true)
  })
})

describe('sessions.source 的戳定', () => {
  it('真實模式開的 session 標記為 device', async () => {
    await sessionController.startSession()
    expect(stub.sessions.start).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'device' })
    )
  })

  it('示範模式開的 session 標記為 demo', async () => {
    useUiStore.getState().setDemoMode(true)
    await sessionController.startSession()
    expect(stub.sessions.start).toHaveBeenCalledWith(expect.objectContaining({ source: 'demo' }))
  })

  it('source 在開始時戳定一次,整場不可能改變', async () => {
    useUiStore.getState().setDemoMode(true)
    await sessionController.startSession()

    // 進行中切換被拒絕 → 這場的 source 不可能與寫入時不同,
    // 因此資料庫裡不會出現「前半真實、後半模擬」卻只有單一標記的紀錄
    expect(useUiStore.getState().setDemoMode(false)).toBe(false)
    expect(useUiStore.getState().demoMode).toBe(true)
    expect(stub.sessions.start).toHaveBeenCalledTimes(1)
  })
})

describe('示範模式下不得連上真實裝置', () => {
  it('connect() 提前 return,不觸碰 Web Bluetooth', async () => {
    useUiStore.getState().setDemoMode(true)
    bluetoothService.beginSimulated('demo-link')

    // navigator.bluetooth 在 node 環境根本不存在;若 connect() 沒有提前 return,
    // 這裡會丟出 TypeError 而不是安靜地記一行日誌
    await expect(bluetoothService.connect()).resolves.toBeUndefined()
    expect(useStore.getState().logs.some((l) => l.includes('Cannot connect to a real device'))).toBe(
      true
    )
  })
})
