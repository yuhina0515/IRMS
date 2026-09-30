// 播放器(pump)的測試。
//
// simulation/ 目錄裡只有這一個檔案有副作用,所以也只有它需要這種測試。
// 重點不在「角度對不對」(那是 encode/scenarios 的責任),而在於 pump 這一層的
// 生命週期:有沒有真的把封包餵進 ingest、null 拍有沒有被正確地什麼都不做、
// 停止時鏈路有沒有真的下線。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installIrmsStub, type IrmsStub } from '../../test/irmsStub'
import { useStore } from '../../store/useStore'
import { bluetoothService } from '../bluetooth'
import { deviceSimulator } from './simulator'
import { scenarioById } from './scenarios'

const COMM_PERIOD_MS = 40
let ingestSpy: ReturnType<typeof vi.spyOn>
let stub: IrmsStub

beforeEach(() => {
  vi.useFakeTimers()
  stub = installIrmsStub()
  useStore.getState().resetSession()
  ingestSpy = vi.spyOn(bluetoothService, 'ingest')
})

afterEach(() => {
  deviceSimulator.stop()
  ingestSpy.mockRestore()
  stub.uninstall()
  vi.useRealTimers()
})

describe('deviceSimulator', () => {
  it('啟動後讓模擬鏈路上線,並以 25Hz 餵封包進 ingest', () => {
    deviceSimulator.start('rep-cycle')

    expect(deviceSimulator.running).toBe(true)
    expect(useStore.getState().isConnected).toBe(true)
    expect(bluetoothService.isSimulated).toBe(true)

    vi.advanceTimersByTime(COMM_PERIOD_MS * 10)
    expect(ingestSpy).toHaveBeenCalledTimes(10)
    // 餵進去的是真的封包字串,不是物件——這保證它走的是與真實 BLE 相同的解析路徑
    expect(ingestSpy.mock.calls[0][0]).toMatch(/^T:-?\d/)
  })

  it('停止後鏈路下線且不再有封包', () => {
    deviceSimulator.start('rep-cycle')
    vi.advanceTimersByTime(COMM_PERIOD_MS * 5)
    const countAtStop = ingestSpy.mock.calls.length

    deviceSimulator.stop()

    expect(deviceSimulator.running).toBe(false)
    expect(useStore.getState().isConnected).toBe(false)
    expect(bluetoothService.isSimulated).toBe(false)

    vi.advanceTimersByTime(COMM_PERIOD_MS * 10)
    expect(ingestSpy.mock.calls.length).toBe(countAtStop)
  })

  it('重複 start 不會疊出兩條資料流', () => {
    deviceSimulator.start('rep-cycle')
    deviceSimulator.start('over-limit')
    vi.advanceTimersByTime(COMM_PERIOD_MS * 10)

    // 若舊的 interval 沒被清掉,這裡會是 20
    expect(ingestSpy).toHaveBeenCalledTimes(10)
    expect(deviceSimulator.currentScenarioId).toBe('over-limit')
  })

  it('dropout:封包停止的那段不呼叫 ingest,播完後鏈路失守', () => {
    const dropout = scenarioById('dropout')!
    deviceSimulator.start('dropout')

    // 前 3 秒有封包
    vi.advanceTimersByTime(3000)
    const duringStream = ingestSpy.mock.calls.length
    expect(duringStream).toBeGreaterThan(0)

    // 之後是 null 拍:pump 什麼都不做,App 端無從得知「對方沒送」與「還沒送到」的差別
    vi.advanceTimersByTime(1500)
    expect(ingestSpy.mock.calls.length).toBe(duringStream)

    // 播完(endsDisconnected)→ 自動停止並讓鏈路下線
    vi.advanceTimersByTime(dropout.durationMs)
    expect(deviceSimulator.running).toBe(false)
    expect(useStore.getState().isConnected).toBe(false)
  })

  it('未知情境不啟動,並留下日誌', () => {
    deviceSimulator.start('no-such-scenario')
    expect(deviceSimulator.running).toBe(false)
    expect(useStore.getState().logs.some((l) => l.includes('Unknown simulation scenario'))).toBe(true)
  })
})
