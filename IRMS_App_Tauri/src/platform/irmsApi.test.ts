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
import type { SessionStartInput } from '@shared/types'

// 只驗證原生回覆契約；合成療程明確標示 demo，校準從未實測。
const sessionInput: SessionStartInput = {
  targetAngle: 90, tolerance: 10, holdTimeMs: 2000, actionId: null, actionName: null,
  protocol: 'knee', triggerType: 'joint_angle', safetyLimit: null, comfortAngle: null, limitAngle: null,
  source: 'demo', calibration: {
    proximalAxisRotationDeg: 0, distalAxisRotationDeg: 0,
    proximalAxisRotationVerified: false, distalAxisRotationVerified: false,
    proximalInvert: false, distalInvert: false, proximalZeroRaw: 0, distalZeroRaw: 0,
    proximalRollInvert: false, distalRollInvert: false, proximalRollZeroRaw: 0, distalRollZeroRaw: 0,
    proximalRollVerified: false, distalRollVerified: false, lastCalibratedAt: null
  }
}
const identity = 'a'.repeat(32) + '/' + 'b'.repeat(32)

it('returns the native session id and durable binding together', async () => {
  mocks.invoke.mockResolvedValueOnce({ sessionId: 7, storageIdentity: identity })
  await expect(irms.sessions.start(sessionInput)).resolves.toEqual({ sessionId: 7, storageIdentity: identity })
  expect(mocks.invoke).toHaveBeenLastCalledWith('sessions_start', { input: sessionInput })
})

it.each([null, 7, { sessionId: 1 }, { sessionId: 0, storageIdentity: identity },
  { sessionId: Number.MAX_SAFE_INTEGER + 1, storageIdentity: identity },
  { sessionId: 1, storageIdentity: identity.toUpperCase() },
  { sessionId: 1, storageIdentity: identity + '\n' },
  { sessionId: 1, storageIdentity: 'private-input'.repeat(1000) }
])('rejects malformed or legacy start replies without echoing their content', async result => {
  mocks.invoke.mockResolvedValueOnce(result)
  await expect(irms.sessions.start(sessionInput)).rejects.toThrow('Invalid session storage identity')
})

it('carries the caller-owned batch identity unchanged across native retries', async () => {
  const batchId = '00000000-0000-4000-8000-000000000001'
  const storageIdentity = 'a'.repeat(32) + '/' + 'b'.repeat(32)
  mocks.invoke.mockRejectedValueOnce(new Error('reply lost')).mockResolvedValueOnce(0)
  await expect(irms.data.appendBatch(1, [], batchId, storageIdentity)).rejects.toThrow('reply lost')
  await expect(irms.data.appendBatch(1, [], batchId, storageIdentity)).resolves.toEqual({ count: 0 })
  expect(mocks.invoke.mock.calls.slice(-2)).toEqual(Array(2).fill(['data_append_batch', { sessionId: 1, readings: [], batchId, storageIdentity }]))
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
