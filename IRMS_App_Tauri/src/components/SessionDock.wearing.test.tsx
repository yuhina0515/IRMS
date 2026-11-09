// QA fix RISK3: the wearing check tells the user which reference posture to take before sampling, and an
// inconclusive reading asks instead of silently starting the session.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { makeUnifiedProfile } from '../test/unifiedProfileFixture'

const startSession = vi.fn().mockResolvedValue(undefined)
vi.mock('../services/bluetooth', () => ({ bluetoothService: { isSimulated: false } }))
vi.mock('../services/sessionController', () => ({ sessionController: { startSession: (...a: unknown[]) => startSession(...a), endSession: vi.fn() } }))
vi.mock('../services/firmwareAutoUpdate', () => ({
  firmwareUpdateBusy: () => false,
  useFirmwareAutoStore: () => ({ phase: 'idle' })
}))
const profile = makeUnifiedProfile()
vi.mock('../platform/irmsApi', () => ({
  irms: { calibrationProfiles: { list: vi.fn(async () => [{ id: 'p1', profile: JSON.stringify(profile) }]) } }
}))

import { SessionDock } from './SessionDock'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'

const asks: { title: string; body: string }[] = []
let answers: boolean[] = []

beforeEach(() => {
  startSession.mockClear()
  asks.length = 0
  answers = []
  useUiStore.setState({
    requestConfirm: (async (title: string, body: string) => {
      asks.push({ title, body })
      return answers.length ? (answers.shift() as boolean) : true
    }) as never
  })
  useStore.setState((s) => ({
    isConnected: true,
    rawAngles: null,
    angleRange: { comfortable: 1 } as never,
    customActions: [
      { id: 1, name: 'a', description: null, protocol: s.settings.protocol, targetAngle: 90, tolerance: 5, holdTimeMs: 1000, triggerType: 'joint_angle', safetyLimit: null }
    ],
    selectedActionId: 1,
    settings: { ...s.settings, calibrationMethod: 'unified', calibrationId: 'p1', lastCalibratedAt: '2026-10-15T00:00:00.000Z' }
  }))
  vi.useFakeTimers({ shouldAdvanceTime: false })
})
afterEach(() => {
  vi.useRealTimers()
})

async function clickStart(): Promise<void> {
  render(<SessionDock onCalibrate={() => {}} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /開始/ }))
    await vi.advanceTimersByTimeAsync(2500)
  })
}

describe('SessionDock wearing check prompts', () => {
  it('names the reference posture before sampling', async () => {
    await clickStart()
    expect(asks[0].title).toBe('穿戴檢查')
    expect(asks[0].body).toMatch(/站立/)
  })

  it('an inconclusive reading asks, and declining it does not start', async () => {
    answers = [true, false]
    await clickStart()
    expect(asks.length).toBeGreaterThanOrEqual(2)
    expect(startSession).not.toHaveBeenCalled()
  })

  it('declining the posture prompt does not start either', async () => {
    answers = [false]
    await clickStart()
    expect(startSession).not.toHaveBeenCalled()
  })
})
