// 自動重連進度的測試。
//
// 這條路徑在此之前**無法驗證**——要重現得真的把 ESP32 的電池拔掉,而裝置不在手邊。
// 於是「Reconnecting (n/5)」這個計數器從 2026-06-27 寫下以來從來沒有人確認過它會顯示,
// 而實際上它從來不會:attemptReconnect 寫進 statusText 之後,下一行的 connectGATT()
// 開頭就是 setStatus('Connecting...'),同一次嘗試內就蓋掉了。
//
// 這裡以假裝置驅動私有的重連迴圈。BluetoothService 是模組單例、沒有 DI
// (那是刻意的——見 ingest 接縫的取捨),所以測試從 device 欄位注入,
// 那是這個類別唯一的外部依賴。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store/useStore'
import { bluetoothService } from './bluetooth'

/** connectGATT 走完成功路徑所需要的最小 GATT 形狀 */
function fakeChar(): Record<string, unknown> {
  return {
    startNotifications: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
    writeValue: vi.fn().mockResolvedValue(undefined)
  }
}

/**
 * @param failures 前幾次 gatt.connect() 要失敗;之後成功。
 *   給 Infinity 表示永遠失敗(測耗盡)。
 */
function installFakeDevice(failures: number): { connect: ReturnType<typeof vi.fn> } {
  let calls = 0
  const connect = vi.fn(async () => {
    calls++
    if (calls <= failures) throw new Error(`GATT unavailable (attempt ${calls})`)
    return {
      getPrimaryService: async () => ({ getCharacteristic: async () => fakeChar() })
    }
  })

  const device = {
    name: 'IRMS-fake',
    gatt: { connected: false, connect },
    addEventListener: vi.fn()
  }
  ;(bluetoothService as unknown as { device: unknown }).device = device
  return { connect }
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
  useStore.setState({ isConnected: false, reconnect: null, statusText: 'Disconnected' })
  ;(bluetoothService as unknown as { manualDisconnect: boolean }).manualDisconnect = false
})

afterEach(() => {
  ;(bluetoothService as unknown as { device: unknown }).device = null
  useStore.setState({ isConnected: false, reconnect: null })
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('重連進度', () => {
  it('逐次遞增,而且是使用者看得到的結構化狀態', async () => {
    installFakeDevice(2) // 前兩次失敗,第三次成功
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
    installFakeDevice(1)

    const done = runReconnect()
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS * 2)
    await done

    expect(useStore.getState().isConnected).toBe(true)
    expect(useStore.getState().reconnect).toBeNull()
  })

  it('嘗試耗盡後清空進度,不留下一個永遠停在 5/5 的假進度', async () => {
    installFakeDevice(Infinity)
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
    installFakeDevice(Infinity)

    const done = runReconnect()
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS)
    // 使用者在重連途中按了斷線
    ;(bluetoothService as unknown as { manualDisconnect: boolean }).manualDisconnect = true
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS * 6)
    await done

    expect(useStore.getState().reconnect).toBeNull()
  })

  // 這是整件事的起因:計數器早就寫在 statusText 裡,但永遠看不到。
  it('statusText 會被 connectGATT 的 Connecting... 蓋掉——所以進度不能靠它', async () => {
    installFakeDevice(Infinity)

    const done = runReconnect()
    await vi.advanceTimersByTimeAsync(1)

    // 同一次嘗試內,statusText 已經不是「Reconnecting」了
    expect(useStore.getState().statusText).toBe('Connecting...')
    // 但結構化的進度還在,而且說得出是第幾次
    expect(useStore.getState().reconnect).toEqual({ attempt: 1, max: 5 })

    ;(bluetoothService as unknown as { manualDisconnect: boolean }).manualDisconnect = true
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS * 6)
    await done
  })
})
