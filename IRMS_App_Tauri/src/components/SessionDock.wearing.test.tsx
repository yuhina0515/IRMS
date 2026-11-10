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
const addProfile = vi.fn(async (input: unknown) => input)
vi.mock('../platform/irmsApi', () => ({
  irms: {
    calibrationProfiles: {
      list: vi.fn(async () => [{ id: 'p1', profile: JSON.stringify(profile) }]),
      add: (input: unknown) => addProfile(input)
    }
  }
}))

import { SessionDock } from './SessionDock'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { compileProfile, limbAngles, type CalibrationProfile } from '../services/calibrationCore'
import { buildTrajectory, createRig, simulate, toWire, type Pose } from '../services/simulation/imuModel'
import { getT } from '../i18n'

const asks: { title: string; body: string }[] = []
const toasts: { text: string; kind: string }[] = []
let answers: boolean[] = []

beforeEach(() => {
  startSession.mockClear()
  addProfile.mockReset()
  addProfile.mockImplementation(async (input: unknown) => input)
  toasts.length = 0
  asks.length = 0
  answers = []
  useUiStore.setState({
    showToast: ((text: string, kind: string) => void toasts.push({ text, kind })) as never,
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
    session: { ...s.session, id: null, running: false },
    settings: { ...s.settings, ...compileProfile(profile), calibrationMethod: 'unified', calibrationId: 'p1', lastCalibratedAt: '2026-10-15T00:00:00.000Z' }
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

// Same rig as the fixture profile, so a held pose reads exactly as that calibration would see it.
const rig = createRig({ seed: 3 })

/** Press start, accept the posture prompt, and hold `pose` (optionally trembling) through the 2 s sample. */
async function startHolding(pose: Partial<Pose>, opts: { shake?: boolean } = {}): Promise<void> {
  const { traj } = buildTrajectory([{ to: pose, moveSec: 0, holdSec: 3 }])
  const still = toWire(simulate(traj, 3, rig, { seed: 1 }))
  const other = toWire(simulate(buildTrajectory([{ to: { ...pose, kneeFlex: (pose.kneeFlex ?? 0) + 30 }, moveSec: 0, holdSec: 3 }]).traj, 3, rig, { seed: 1 }))
  render(<SessionDock onCalibrate={() => {}} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /開始/ }))
    await vi.advanceTimersByTimeAsync(0)
    for (let i = 0; i < 60; i++) {
      useStore.getState().setRawAngles((opts.shake && i % 2 ? other : still)[i + 3].raw)
      await vi.advanceTimersByTimeAsync(40)
    }
    await vi.advanceTimersByTimeAsync(500)
  })
}

describe('SessionDock one-step re-zero', () => {
  const w = getT().calibrationFlow.wearing

  it('starts straight away when the sensors sit as calibrated', async () => {
    await startHolding({})
    expect(asks.map((a) => a.body)).not.toContain(w.rezero)
    expect(addProfile).not.toHaveBeenCalled()
    expect(startSession).toHaveBeenCalledTimes(1)
  })

  it('offers to reset the zero from the held pose, stores the new profile, applies it and starts', async () => {
    await startHolding({ kneeFlex: 10 })
    expect(asks.map((a) => a.body)).toContain(w.rezero)
    expect(addProfile).toHaveBeenCalledTimes(1)
    const stored = addProfile.mock.calls[0][0] as { id: string; active: boolean; profile: string }
    expect(stored.active).toBe(true)
    expect(stored.id).not.toBe('p1')
    const next = JSON.parse(stored.profile) as CalibrationProfile
    // Same hinge axes, new zero: the pose that read 10 deg off now reads as the zero.
    expect(next.limbs.shin.hinge).toEqual(profile.limbs.shin.hinge)
    const { traj } = buildTrajectory([{ to: { kneeFlex: 10 }, moveSec: 0, holdSec: 1 }])
    const held = simulate(traj, 1, rig, { seed: 1 })[5]
    expect(Math.abs(limbAngles(profile.limbs.shin, held.shinV).pitch)).toBeGreaterThan(8)
    expect(Math.abs(limbAngles(next.limbs.shin, held.shinV).pitch)).toBeLessThan(1)
    expect(useStore.getState().settings.calibrationId).toBe(stored.id)
    expect(toasts).toContainEqual({ text: w.rezeroDone, kind: 'success' })
    expect(startSession).toHaveBeenCalledTimes(1)
  })

  it('changes nothing and does not start when the offer is declined', async () => {
    answers = [true, false]
    await startHolding({ kneeFlex: 10 })
    expect(addProfile).not.toHaveBeenCalled()
    expect(useStore.getState().settings.calibrationId).toBe('p1')
    expect(startSession).not.toHaveBeenCalled()
  })

  it('keeps the old calibration and does not start when the new profile cannot be stored', async () => {
    addProfile.mockRejectedValueOnce(new Error('disk'))
    await startHolding({ kneeFlex: 10 })
    expect(useStore.getState().settings.calibrationId).toBe('p1')
    expect(toasts).toContainEqual({ text: getT().calibrationFlow.applyFailed, kind: 'error' })
    expect(startSession).not.toHaveBeenCalled()
  })

  it('does not re-zero on an offset too large to be the strap: it asks, and never rewrites the zero', async () => {
    await startHolding({ kneeFlex: 45 })
    expect(asks.map((a) => a.body)).toContain(w.tooFar)
    expect(asks.map((a) => a.body)).not.toContain(w.rezero)
    expect(addProfile).not.toHaveBeenCalled()
    expect(useStore.getState().settings.calibrationId).toBe('p1')
    expect(startSession).toHaveBeenCalledTimes(1)
  })

  it('treats a trembling pose as inconclusive instead of re-zeroing on it', async () => {
    await startHolding({ kneeFlex: 10 }, { shake: true })
    expect(asks.map((a) => a.body)).toContain(w.inconclusive)
    expect(addProfile).not.toHaveBeenCalled()
  })
})
