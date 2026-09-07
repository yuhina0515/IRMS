// 自動重連進度的測試(Tauri port)。
//
// 這條路徑在此之前**無法驗證**——要重現得真的把 ESP32 的電池拔掉,而裝置不在手邊。
// Electron 版由此以一個假 BluetoothDevice(`device` 私有欄位,帶假 gatt.connect())
// 驅動 attemptReconnect——那是 Web Bluetooth 版本重連迴圈唯一的外部依賴。
//
// Tauri 版 bluetoothService 沒有 `device` 欄位:attemptReconnect 直接呼叫
// invoke('ble_connect'),連線是否成功由 Rust 端另外非同步發出的 'ble:connection'
// 事件回報(見 bluetooth.ts 建構子的 registerEventListeners,以及 useStore.ts
// setConnection 「isConnected 為真就清空 reconnect」的行為——這件事不管是誰觸發
// setConnection 都成立,attemptReconnect 本身不需要重複做)。所以這裡改成從
// @tauri-apps/api/core 的 invoke 與 @tauri-apps/api/event 的 listen 兩個 IPC 邊界
// 注入行為——那才是 Tauri 版本重連迴圈真正的外部依賴,而不是塞一個假裝置物件。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type TauriEventHandler = (event: { payload: unknown }) => void

// vi.hoisted:vi.mock 的 factory 會在這個檔案的 import 被解析時就跑(遠早於下面
// 一般的 const/let 陳述式執行),factory 裡引用的變數必須先用 vi.hoisted 建立,
// 否則會踩到 vitest 文件明確警告過的 TDZ 陷阱。
const { invokeMock, tauriListeners } = vi.hoisted(() => {
  return {
    invokeMock: vi.fn(async (_cmd: string, _args?: unknown): Promise<unknown> => undefined),
    tauriListeners: new Map<string, TauriEventHandler>()
  }
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, handler: TauriEventHandler) => {
    tauriListeners.set(event, handler)
    return () => tauriListeners.delete(event)
  })
}))

import { useStore } from '../store/useStore'
import { bluetoothService } from './bluetooth'

/** 模擬 Rust 端發出一個事件,同步驅動已註冊的 handler。*/
function emit(event: string, payload: unknown): void {
  tauriListeners.get(event)?.({ payload })
}

/**
 * @param failures 前幾次 invoke('ble_connect') 要失敗;之後成功。
 *   給 Infinity 表示永遠失敗(測耗盡)。成功時比照 ble.rs 的真實行為,同步發出
 *   'ble:connection' 事件(這是 isConnected/reconnect 真正被清空的地方,
 *   見 useStore.ts setConnection——attemptReconnect 自己並不寫這兩個欄位)。
 */
function installFakeConnect(failures: number): { calls(): number } {
  let calls = 0
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd !== 'ble_connect') return undefined
    calls++
    if (calls <= failures) throw new Error(`GATT unavailable (attempt ${calls})`)
    emit('ble:connection', { connected: true, deviceName: 'IRMS-fake' })
    return 'connected'
  })
  return { calls: () => calls }
}

/** 驅動私有的重連迴圈(它只由 GATT 斷線事件觸發,測試無法從公開 API 進入) */
function runReconnect(): Promise<void> {
  return (
    bluetoothService as unknown as { attemptReconnect(): Promise<void> }
  ).attemptReconnect()
}

const RECONNECT_DELAY_MS = 3000

beforeEach(() => {
  vi.useFakeTimers()
  invokeMock.mockReset()
  invokeMock.mockResolvedValue(undefined)
  useStore.setState({ isConnected: false, reconnect: null, statusText: 'Disconnected' })
  ;(bluetoothService as unknown as { manualDisconnect: boolean }).manualDisconnect = false
  ;(bluetoothService as unknown as { connected: boolean }).connected = false
})

afterEach(() => {
  useStore.setState({ isConnected: false, reconnect: null })
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('重連進度', () => {
  it('逐次遞增,而且是使用者看得到的結構化狀態', async () => {
    installFakeConnect(2) // 前兩次失敗,第三次成功
    const seen: (number | null)[] = []
    const unsub = useStore.subscribe((s) => seen.push(s.reconnect?.attempt ?? null))

    const done = runReconnect()
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS * 3)
    await done
    unsub()

    // 三次嘗試都被記錄下來,而不是只留下最後一次
    expect(seen.filter((v) => v === 1).length).toBeGreaterThan(0)
    expect(seen.filter((v) => v === 2).length).toBeGreaterThan(0)
    expect(seen.filter((v) => v === 3).length).toBeGreaterThan(0)
  })

  it('重連成功後清空進度並標記為已連線', async () => {
    installFakeConnect(1)

    const done = runReconnect()
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS * 2)
    await done

    expect(useStore.getState().isConnected).toBe(true)
    expect(useStore.getState().reconnect).toBeNull()
  })

  it('嘗試耗盡後清空進度,不留下一個永遠停在 5/5 的假進度', async () => {
    installFakeConnect(Infinity)
    const onLost = vi.fn()
    bluetoothService.onConnectionLost = onLost

    const done = runReconnect()
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS * 6)
    await done

    expect(useStore.getState().isConnected).toBe(false)
    expect(useStore.getState().reconnect).toBeNull()
    expect(useStore.getState().statusText).toBe('Disconnected')
    expect(onLost).toHaveBeenCalledTimes(1)

    bluetoothService.onConnectionLost = null
  })

  it('手動斷線介入時立刻停止並清空進度', async () => {
    installFakeConnect(Infinity)

    const done = runReconnect()
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS)
    // 使用者在重連途中按了斷線
    ;(bluetoothService as unknown as { manualDisconnect: boolean }).manualDisconnect = true
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS * 6)
    await done

    expect(useStore.getState().reconnect).toBeNull()
  })

  // Electron 版這裡原本還有一個測試,鎖住「statusText 會被 connectGATT 的
  // Connecting... 蓋掉——所以進度不能靠它」:那條路徑的成因是 attemptReconnect
  // 呼叫共用的 connect()/connectGATT(),而該函式第一行就 setStatus('Connecting...')
  // 蓋掉剛設好的 'Reconnecting (n/5)...'。
  //
  // Tauri 版 attemptReconnect(見 services/bluetooth.ts)直接呼叫
  // invoke<string>('ble_connect'),不經過任何會重寫 statusText 的共用函式——
  // 這是架構重寫時的行為差異,不是尚未移植的缺陷:對應的 overwrite 路徑在這個
  // 實作裡根本不存在,所以這條規避測試沒有東西可鎖,移植時移除而非改寫或跳過。
  // 詳見 doc/coding log/log_20260908_tauri_test_suite_port.md。
})
