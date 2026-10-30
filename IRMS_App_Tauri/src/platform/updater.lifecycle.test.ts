import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), install: vi.fn(), download: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn() }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }))
vi.mock('@tauri-apps/plugin-updater', () => ({ Update: class {
  version = '2.0.0'
  download = mocks.download
  install = mocks.install
} }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

let controller: typeof import('../services/sessionController')['sessionController'] | undefined
const started = { sessionId: 1, storageIdentity: 'a'.repeat(32) + '/' + 'b'.repeat(32) }
beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === 'update_check') return { rid: 1, version: '2.0.0' }
    if (command === 'sessions_start') return started
    return undefined
  })
  mocks.download.mockResolvedValue(undefined)
  mocks.install.mockResolvedValue(undefined)
})
afterEach(async () => {
  await controller?.endSession()
  controller = undefined
})

async function setup() {
  const { irms } = await import('./irmsApi')
  const { sessionController } = await import('../services/sessionController')
  const { useStore } = await import('../store/useStore')
  controller = sessionController
  useStore.getState().resetSession()
  await irms.updates.checkNow()
  return { irms, sessionController, useStore }
}

it('blocks install while native session creation is pending before a session id exists', async () => {
  const { irms, sessionController, useStore } = await setup()
  const pending = deferred<typeof started>()
  mocks.invoke.mockImplementationOnce(() => pending.promise)
  const starting = sessionController.startSession()
  expect(useStore.getState().session.id).toBeNull()
  await irms.updates.restartNow()
  const attemptedInstall = mocks.install.mock.calls.length
  pending.resolve(started)
  await starting
  expect(attemptedInstall).toBe(0)
  await irms.updates.restartNow()
  expect(mocks.install).not.toHaveBeenCalled()
  expect(await sessionController.endSession()).toBe(true)
  await irms.updates.restartNow()
  expect(mocks.install).toHaveBeenCalledTimes(1)
})

it('blocks native session creation and normal close during installer launch', async () => {
  const { irms, sessionController } = await setup()
  const pending = deferred<void>()
  mocks.install.mockReturnValueOnce(pending.promise)
  const installing = irms.updates.restartNow()
  let startFailure: unknown
  try { await sessionController.startSession() } catch (error) { startFailure = error }
  const closeAllowed = sessionController.reserveWindowClose()
  if (closeAllowed) sessionController.releaseWindowClose()
  pending.resolve(undefined)
  await installing
  expect(startFailure).toBeInstanceOf(Error)
  expect(mocks.invoke.mock.calls.some(([command]) => command === 'sessions_start')).toBe(false)
  expect(closeAllowed).toBe(false)
})

it('prevents install after idle close has already reserved the application', async () => {
  const { irms, sessionController } = await setup()
  expect(sessionController.reserveWindowClose()).toBe(true)
  try {
    await irms.updates.restartNow()
    expect(mocks.install).not.toHaveBeenCalled()
  } finally { sessionController.releaseWindowClose() }
  await irms.updates.restartNow()
  expect(mocks.install).toHaveBeenCalledTimes(1)
})

it('keeps new data blocked after install resolves because process exit is not yet proven', async () => {
  const { irms, sessionController } = await setup()
  await irms.updates.restartNow()
  let startFailure: unknown
  try { await sessionController.startSession() } catch (error) { startFailure = error }
  await irms.updates.restartNow()
  expect(startFailure).toBeInstanceOf(Error)
  expect(mocks.install).toHaveBeenCalledTimes(1)
})

it('releases a rejected installer for a normal start and later explicit install retry', async () => {
  const { irms, sessionController, useStore } = await setup()
  mocks.install.mockRejectedValueOnce(new Error('installer launch failed'))
  await expect(irms.updates.restartNow()).rejects.toThrow('installer launch failed')
  await sessionController.startSession()
  expect(useStore.getState().session.running).toBe(true)
  expect(await sessionController.endSession()).toBe(true)
  await irms.updates.restartNow()
  expect(mocks.install).toHaveBeenCalledTimes(2)
})

it('releases a failed native start so a later idle install remains available', async () => {
  const { irms, sessionController } = await setup()
  mocks.invoke.mockRejectedValueOnce(new Error('session create failed'))
  await expect(sessionController.startSession()).rejects.toThrow('session create failed')
  await irms.updates.restartNow()
  expect(mocks.install).toHaveBeenCalledTimes(1)
})
