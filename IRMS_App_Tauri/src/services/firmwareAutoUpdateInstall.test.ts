import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { commitFeatures, removeFeatures } from './moduleFeatures'
import { useFirmwareAutoStore, type AutoUpdateDeps } from './firmwareAutoUpdate'

const mock = vi.hoisted(() => ({
  state: { isConnected: false, session: { running: false }, hardwareError: null as string | null, settings: { allowBetaUpdates: false }, log: vi.fn() },
  subscriber: undefined as ((s: unknown, prev: unknown) => void) | undefined,
  flash: vi.fn(), check: vi.fn(), toast: vi.fn()
}))
vi.mock('../store/useStore', () => ({ useStore: { getState: () => mock.state, subscribe: (fn: typeof mock.subscriber) => { mock.subscriber=fn; return () => { mock.subscriber=undefined } } } }))
vi.mock('../store/useUiStore', () => ({ useUiStore: { getState: () => ({ showToast: mock.toast }) } }))
vi.mock('../platform/irmsApi', () => ({ irms: { firmware: { checkLatest: mock.check } } }))
vi.mock('./bluetooth', () => ({ bluetoothService: { isSimulated: false, performOtaUpdate: mock.flash } }))
import { installFirmwareAutoUpdate } from './firmwareAutoUpdateInstall'

beforeEach(() => {
  vi.useFakeTimers()
  mock.state.isConnected=false
  mock.state.session.running=false
  useFirmwareAutoStore.setState({ status: { phase: 'idle' } })
  mock.flash.mockReset()
})
afterEach(() => { removeFeatures('firmware-updater'); vi.useRealTimers() })
it('uses a registered updater and enforces eligibility again before module-requested flash', async () => {
  let deps!: AutoUpdateDeps
  const run=vi.fn(async () => {})
  const factory=vi.fn((d: AutoUpdateDeps) => { deps=d; return {run} })
  const dispose=installFirmwareAutoUpdate()
  commitFeatures('firmware-updater', { firmwareUpdater: factory })
  mock.state.isConnected=true
  mock.subscriber?.(mock.state, { isConnected:false, session:{running:false} })
  await vi.advanceTimersByTimeAsync(3000)
  expect(run).toHaveBeenCalledTimes(1)
  mock.state.session.running=true
  const result=await deps.flash({ data:new Uint8Array([1]), md5:'test', size:1, path:'test' }, () => {})
  expect(result.ok).toBe(false)
  expect(mock.flash).not.toHaveBeenCalled()
  dispose()
})
it('does not start a module while a session is running', async () => {
  const run=vi.fn(async () => {})
  commitFeatures('firmware-updater', { firmwareUpdater: () => ({run}) })
  const dispose=installFirmwareAutoUpdate()
  mock.state.isConnected=true
  mock.state.session.running=true
  mock.subscriber?.(mock.state, { isConnected:false, session:{running:false} })
  await vi.advanceTimersByTimeAsync(3000)
  expect(run).not.toHaveBeenCalled()
  dispose()
})
