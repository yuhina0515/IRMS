// The in-session mounting check, driven through the real packet path: encoded `V:` packets -> bluetoothService.ingest
// -> sessionController. Proves the wiring (when it runs, what it marks, that it reports once), not the geometry,
// which slipMonitor.test.ts covers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installIrmsStub, mockIrmsApiModule, type IrmsStub } from '../test/irmsApiStub'

vi.mock('@renderer/platform/irmsApi', () => mockIrmsApiModule)
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {})
}))

import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { bluetoothService } from './bluetooth'
import { compileProfile } from './calibrationCore'
import { sessionController } from './sessionController'
import { encodeAnglePacketWithAccel } from './simulation/encode'
import { buildTrajectory, createRig, mulM, rotX, rotY, rotZ, simulate, type ImuFrame, type Rig, type Step } from './simulation/imuModel'
import { axisDrift } from './slipMonitor'
import { makeUnifiedProfile } from '../test/unifiedProfileFixture'
import { getT } from '../i18n'

if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size
      }
    },
    configurable: true
  })
}

// Same rig as the fixture profile (seed 3, no sensor errors).
const rig = createRig({ seed: 3 })
const profile = makeUnifiedProfile()

function kneeBends(r: Rig, reps: number): ImuFrame[] {
  const steps: Step[] = [{ to: {}, moveSec: 0, holdSec: 1 }]
  for (let i = 0; i < reps; i++) {
    steps.push({ to: { kneeFlex: 70 }, moveSec: 2, holdSec: 1 })
    steps.push({ to: { kneeFlex: 0 }, moveSec: 2, holdSec: 1 })
  }
  const { traj, durationSec } = buildTrajectory(steps)
  return simulate(traj, durationSec, r, { seed: 2 })
}

/** A turn of the shin sensor that the check can see (not the one about the hinge itself). */
function shiftedRig(): Rig {
  const hinge = profile.limbs.shin.hinge
  for (const slip of [rotX(25), rotY(25), rotZ(25)]) {
    const r = { ...rig, mountShin: mulM(rig.mountShin, slip) }
    if ((axisDrift(hinge, kneeBends(r, 2).map((f) => f.shinV))?.axisDriftDeg ?? 0) > 15) return r
  }
  throw new Error('no visible shift found')
}

function feed(frames: ImuFrame[]): void {
  let last = 0
  for (const f of frames) {
    vi.advanceTimersByTime(f.tMs - last)
    last = f.tMs
    bluetoothService.ingest(
      encodeAnglePacketWithAccel({ thigh: f.eulerThigh, shin: f.eulerShin, thighRoll: 0, shinRoll: 0 }, f.thighV, f.shinV)
    )
  }
}

let stub: IrmsStub
let toast: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  stub = installIrmsStub()
  toast = vi.fn()
  useUiStore.setState({ showToast: toast as never })
  useStore.setState({ settings: { ...useStore.getState().settings, ...compileProfile(profile), protocol: 'knee' } })
  useStore.getState().resetSession()
  bluetoothService.endSimulated()
  useStore.getState().setConnection(false, null)
  bluetoothService.beginSimulated('test-link')
})

afterEach(async () => {
  if (useStore.getState().session.id != null) await sessionController.endSession()
  bluetoothService.endSimulated()
  vi.restoreAllMocks()
  stub.uninstall()
  vi.useRealTimers()
})

/** The injected link stands in for a real device here; the demo-mode exemption has its own test below. */
const asRealDevice = (): void => void vi.spyOn(bluetoothService, 'isSimulated', 'get').mockReturnValue(false)

describe('in-session mounting check', () => {
  it('marks the session and tells the wearer once when the shin sensor has shifted', async () => {
    asRealDevice()
    await sessionController.startSession()
    expect(useStore.getState().session.mountShift).toBe(false)
    feed(kneeBends(shiftedRig(), 10))
    expect(useStore.getState().session.mountShift).toBe(true)
    const warnings = toast.mock.calls.filter(([text]) => text === getT().sessionDock.mountShift)
    expect(warnings).toHaveLength(1)
    expect(warnings[0][1]).toBe('warning')
    expect(useStore.getState().logs.filter((l) => l.includes('Shin sensor may have shifted'))).toHaveLength(1)
  })

  it('stays quiet on the mounting the calibration was made with', async () => {
    asRealDevice()
    await sessionController.startSession()
    feed(kneeBends(rig, 10))
    expect(useStore.getState().session.mountShift).toBe(false)
    expect(toast).not.toHaveBeenCalledWith(getT().sessionDock.mountShift, 'warning')
  })

  it('does not run outside a session, in demo mode, or for a calibration that is not unified', async () => {
    const shifted = kneeBends(shiftedRig(), 10)

    asRealDevice()
    feed(shifted)
    expect(useStore.getState().session.mountShift).toBe(false)
    vi.restoreAllMocks()

    await sessionController.startSession()
    feed(shifted)
    expect(useStore.getState().session.mountShift).toBe(false)
    await sessionController.endSession()

    asRealDevice()
    useStore.setState({ settings: { ...useStore.getState().settings, calibrationMethod: 'manual' } })
    await sessionController.startSession()
    feed(shifted)
    expect(useStore.getState().session.mountShift).toBe(false)
  })

  it('clears the mark when the next session starts', async () => {
    asRealDevice()
    await sessionController.startSession()
    feed(kneeBends(shiftedRig(), 10))
    expect(useStore.getState().session.mountShift).toBe(true)
    await sessionController.endSession()
    await sessionController.startSession()
    expect(useStore.getState().session.mountShift).toBe(false)
  })
})
