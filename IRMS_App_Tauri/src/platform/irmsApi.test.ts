import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  open: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.open }))
vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn(async () => 'test') }))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn(async () => false),
    onResized: vi.fn(async () => () => {})
  })
}))
vi.mock('@tauri-apps/plugin-updater', () => ({ Update: class {} }))

import { irms } from './irmsApi'

it('carries the caller-owned batch identity unchanged across native retries', async () => {
  const batchId = '00000000-0000-4000-8000-000000000001'
  mocks.invoke.mockRejectedValueOnce(new Error('reply lost')).mockResolvedValueOnce(0)
  await expect(irms.data.appendBatch(1, [], batchId)).rejects.toThrow('reply lost')
  await expect(irms.data.appendBatch(1, [], batchId)).resolves.toEqual({ count: 0 })
  expect(mocks.invoke.mock.calls.slice(-2)).toEqual(Array(2).fill(['data_append_batch', { sessionId: 1, readings: [], batchId }]))
})

describe('Tauri firmware adapter', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
    mocks.open.mockReset()
  })

  it('treats dialog cancellation as a normal null result', async () => {
    mocks.open.mockResolvedValue(null)

    await expect(irms.firmware.pickBinary()).resolves.toBeNull()
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('reads the selected path through Rust and restores Uint8Array at the IPC boundary', async () => {
    mocks.open.mockResolvedValue('C:\\firmware\\irms.bin')
    mocks.invoke.mockResolvedValue({
      path: 'C:\\firmware\\irms.bin',
      size: 3,
      md5: '5289df737df57326fcdd22597afb1fac',
      data: [1, 2, 3]
    })

    const firmware = await irms.firmware.pickBinary()

    expect(mocks.open).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [{ name: 'ESP32 firmware', extensions: ['bin'] }]
    })
    expect(mocks.invoke).toHaveBeenCalledWith('firmware_read_binary', {
      path: 'C:\\firmware\\irms.bin'
    })
    expect(firmware?.data).toEqual(Uint8Array.from([1, 2, 3]))
  })
})
