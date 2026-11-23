import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  register: vi.fn(), destroy: vi.fn(), reserve: vi.fn(), release: vi.fn(),
  available: vi.fn(), toast: vi.fn(), log: vi.fn()
}))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({
  onCloseRequested: mocks.register, destroy: mocks.destroy
}) }))
vi.mock('./sessionController', () => ({ sessionController: {
  reserveWindowClose: mocks.reserve, releaseWindowClose: mocks.release,
  setCloseProtectionAvailable: mocks.available
} }))
vi.mock('../store/useUiStore', () => ({ useUiStore: { getState: () => ({ showToast: mocks.toast }) } }))
vi.mock('../store/useStore', () => ({ useStore: { getState: () => ({ log: mocks.log }) } }))
vi.mock('../i18n', () => ({ getT: () => ({ common: {
  saveBeforeClose: 'Save before close', closeProtectionFailed: 'Close unavailable'
} }) }))

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  mocks.register.mockResolvedValue(() => {})
  mocks.destroy.mockResolvedValue(undefined)
  mocks.reserve.mockReturnValue(true)
})

it('gates starts synchronously until its single lifetime listener is registered', async () => {
  let register!: () => void
  mocks.register.mockImplementationOnce(() => new Promise<void>((resolve) => { register = resolve }))
  const { installSessionCloseGuard } = await import('./sessionCloseGuard')
  const installing = installSessionCloseGuard()
  expect(mocks.available.mock.calls).toEqual([[false]])
  expect(installSessionCloseGuard()).toBe(installing)
  register()
  expect(await installing).toBe(true)
  expect(mocks.register).toHaveBeenCalledTimes(1)
  expect(mocks.available.mock.calls).toEqual([[false], [true]])
})

it('prevents a controller-declined close before awaiting native destruction', async () => {
  mocks.reserve.mockReturnValue(false)
  const { installSessionCloseGuard } = await import('./sessionCloseGuard')
  await installSessionCloseGuard()
  const event = { preventDefault: vi.fn() }
  await mocks.register.mock.calls[0][0](event)
  expect(event.preventDefault).toHaveBeenCalledOnce()
  expect(mocks.destroy).not.toHaveBeenCalled()
  expect(mocks.toast).toHaveBeenCalledWith('Save before close', 'error', 10000)
})

it('holds the reservation through destruction and releases it only on failure', async () => {
  let fail!: () => void
  mocks.destroy.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = () => reject('denied') }))
  const { installSessionCloseGuard } = await import('./sessionCloseGuard')
  await installSessionCloseGuard()
  const event = { preventDefault: vi.fn() }
  const closing = mocks.register.mock.calls[0][0](event)
  expect(event.preventDefault).toHaveBeenCalledOnce()
  expect(mocks.release).not.toHaveBeenCalled()
  fail()
  await closing
  expect(mocks.release).toHaveBeenCalledOnce()
  await mocks.register.mock.calls[0][0](event)
  expect(mocks.destroy).toHaveBeenCalledTimes(2)
  expect(mocks.release).toHaveBeenCalledTimes(1)
})

it('keeps starts blocked if listener registration fails', async () => {
  mocks.register.mockRejectedValueOnce('registration failed')
  const { installSessionCloseGuard } = await import('./sessionCloseGuard')
  expect(await installSessionCloseGuard()).toBe(false)
  expect(mocks.available.mock.calls).toEqual([[false]])
  expect(mocks.log).toHaveBeenCalledWith(expect.stringContaining('registration failed'))
})
