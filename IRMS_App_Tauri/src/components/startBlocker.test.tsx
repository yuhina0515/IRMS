import { describe, expect, it, vi } from 'vitest'

vi.mock('../services/bluetooth', () => ({ bluetoothService: { isSimulated: false } }))
vi.mock('../services/sessionController', () => ({ sessionController: {} }))
vi.mock('../services/firmwareAutoUpdate', () => ({
  firmwareUpdateBusy: () => false,
  useFirmwareAutoStore: () => ({})
}))

import { startBlocker } from './SessionDock'

const ok = { protocolOk: true, fwBusy: false, isConnected: true, hasAction: true, calibrated: true, simulated: false, running: false }

describe('startBlocker segment gating', () => {
  it('lets a ready setup start', () => {
    expect(startBlocker(ok)).toBeNull()
    expect(startBlocker({ ...ok, segmentNeedsUprightZero: false })).toBeNull()
  })
  it('blocks a segment action when the zero is not upright, after the calibration check', () => {
    expect(startBlocker({ ...ok, segmentNeedsUprightZero: true })).toBe('segmentNeedsUprightZero')
    expect(startBlocker({ ...ok, calibrated: false, segmentNeedsUprightZero: true })).toBe('notCalibrated')
  })
})
