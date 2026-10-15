// QA fix RISK4: Apply writes the profile first and changes the live settings only after that write succeeds.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { CalibrationFlow } from './CalibrationFlow'
import { useStore } from '../store/useStore'
import { captureReference, solveProfile, type CalibrationProfile } from '../services/calibrationCore'
import { between, createRig, kneeCurl, simulate, thighRaise } from '../services/simulation/imuModel'

vi.mock('../services/bluetooth', () => ({
  bluetoothService: { onRawMotion: () => () => {}, enableRawStream: vi.fn().mockResolvedValue(undefined) }
}))

function makeProfile(): CalibrationProfile {
  const rig = createRig({ seed: 3 })
  const k = kneeCurl(90)
  const t = thighRaise(80)
  const fk = simulate(k.traj, k.durationSec, rig, { seed: 1 })
  const ft = simulate(t.traj, t.durationSec, rig, { seed: 1 })
  const ref = captureReference(between(fk, ...k.still).map((f) => ({ tMs: f.tMs, thigh: f.thighV, shin: f.shinV })), 'straight', 'standing')
  if (!ref.ok) throw new Error(ref.error)
  const out = solveProfile({
    id: 'old',
    createdAt: '2026-10-15T00:00:00.000Z',
    side: 'left',
    firmware: { version: null, rawStream: false },
    reference: ref.reference,
    thighSweep: { samples: ft.map((f) => f.thighV) },
    shinSweep: { samples: fk.map((f) => f.shinV) }
  })
  if (!out.ok) throw new Error(out.failure.error)
  return out.profile
}

const profile = makeProfile()
const add = vi.fn()
vi.mock('../platform/irmsApi', () => ({
  irms: {
    calibrationProfiles: {
      list: vi.fn(async () => [{ id: 'old', profile: JSON.stringify(profile) }]),
      add: (...a: unknown[]) => add(...a),
      remove: vi.fn()
    },
    mobility: { add: vi.fn(), list: vi.fn().mockResolvedValue([]) }
  }
}))
vi.mock('../services/voice', () => ({ speak: vi.fn() }))

async function reachReview(onClose: () => void): Promise<void> {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  render(<CalibrationFlow preset="quickRezero" onClose={onClose} />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10)
  })
  fireEvent.click(screen.getByTestId('flow-start'))
  fireEvent.click(screen.getByTestId('flow-capture'))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000)
  })
  for (let t = 0; t < 2400; t += 100) {
    await act(async () => {
      useStore.setState({ rawAngles: { thighAccel: { ...profile.reference.thigh }, shinAccel: { ...profile.reference.shin } } as never })
      await vi.advanceTimersByTimeAsync(100)
    })
  }
}

beforeEach(() => {
  add.mockReset()
  useStore.setState({ isConnected: true, linkTruncated: false, rawAngles: null })
  useStore.setState((s) => ({
    session: { ...s.session, running: false },
    settings: { ...s.settings, firmwareProtocol: null, calibrationMethod: 'unified', calibrationId: 'old' }
  }))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('CalibrationFlow apply ordering', () => {
  it('a failed profile write leaves the live settings untouched and keeps the flow open', async () => {
    add.mockRejectedValue(new Error('disk full'))
    const onClose = vi.fn()
    await reachReview(onClose)
    await act(async () => {
      fireEvent.click(screen.getByTestId('flow-apply'))
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(add).toHaveBeenCalledTimes(1)
    expect(useStore.getState().settings.calibrationId).toBe('old')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText(/未套用/)).toBeInTheDocument()
  })

  it('a successful write applies the new profile and closes', async () => {
    add.mockResolvedValue({})
    const onClose = vi.fn()
    await reachReview(onClose)
    await act(async () => {
      fireEvent.click(screen.getByTestId('flow-apply'))
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(useStore.getState().settings.calibrationId).not.toBe('old')
    expect(onClose).toHaveBeenCalled()
  })
})
