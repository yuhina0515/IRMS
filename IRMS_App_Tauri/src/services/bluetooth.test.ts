import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  invoke: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mock.invoke }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, cb: (event: { payload: unknown }) => void) => {
    mock.handlers.set(name, cb)
    return () => mock.handlers.delete(name)
  })
}))

import { BluetoothService } from './bluetooth'

const firmware = { data: new Uint8Array(8192), md5: 'x' }

function connectedService(): BluetoothService {
  const svc = new BluetoothService()
  ;(svc as unknown as { connected: boolean }).connected = true
  return svc
}

describe('performOtaUpdate failure reporting', () => {
  beforeEach(() => {
    mock.handlers.clear()
    mock.invoke.mockReset()
  })

  it('keeps the transferred byte count Rust reported instead of resetting progress to 0', async () => {
    mock.invoke.mockImplementation(async (cmd: string) => {
      if (cmd !== 'ble_perform_ota_update') return undefined
      mock.handlers.get('ble:ota-progress')?.({
        payload: { phase: 'error', bytesSent: 4096, totalBytes: 8192, message: 'OTA status timeout' }
      })
      throw 'OTA status timeout'
    })
    const progress = vi.fn()
    const result = await connectedService().performOtaUpdate(firmware, progress)

    expect(result).toEqual({ ok: false, message: 'OTA status timeout' })
    expect(progress).toHaveBeenCalledTimes(1)
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'error', bytesSent: 4096 }))
  })

  it('still reports an error when the command fails before any progress event', async () => {
    mock.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'ble_perform_ota_update') throw 'OTA update already in progress'
    })
    const progress = vi.fn()
    const result = await connectedService().performOtaUpdate(firmware, progress)

    expect(result.ok).toBe(false)
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'error', bytesSent: 0, message: 'OTA update already in progress' }))
  })
})
