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

describe('startBlocker truncated link with a unified calibration', () => {
  it('refuses to start because the vectors the unified knee needs are missing', () => {
    expect(startBlocker({ ...ok, unifiedLinkTruncated: true })).toBe('unifiedNeedsVectors')
    expect(startBlocker({ ...ok, unifiedLinkTruncated: false })).toBeNull()
  })
})
