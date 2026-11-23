import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ invoke: vi.fn(), download: vi.fn(), install: vi.fn(), close: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mock.invoke }))
vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn() }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))
vi.mock('@tauri-apps/plugin-updater', () => ({ Update: class {
  version = '2.0.0'
  download = mock.download
  install = mock.install
  close = mock.close
} }))
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}
beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  mock.invoke.mockResolvedValue({ rid: 1, version: '2.0.0' })
  mock.close.mockResolvedValue(undefined)
})
describe('updater concurrency', () => {
  it('publishes installing while pending and replays it after successful handoff', async () => {
    const pending = deferred()
    mock.install.mockReturnValueOnce(pending.promise)
    const { irms } = await import('./irmsApi')
    await irms.updates.checkNow()
    const listener = vi.fn()
    const unsubscribe = irms.updates.onStatusChange(listener)
    const installing = irms.updates.restartNow()
    const pendingStatus = listener.mock.lastCall?.[0]
    pending.resolve()
    await installing
    unsubscribe()
    const remounted = vi.fn()
    irms.updates.onStatusChange(remounted)()
    expect(pendingStatus).toEqual({ state: 'installing', version: '2.0.0' })
    expect(remounted).toHaveBeenLastCalledWith({ state: 'installing', version: '2.0.0' })
  })

  it('publishes a retryable install error without raw native details', async () => {
    mock.install.mockRejectedValueOnce(new Error('private-native-detail')).mockResolvedValueOnce(undefined)
    const { irms } = await import('./irmsApi')
    await irms.updates.checkNow()
    const listener = vi.fn()
    irms.updates.onStatusChange(listener)
    await expect(irms.updates.restartNow()).rejects.toThrow('private-native-detail')
    expect(listener).toHaveBeenLastCalledWith({ state: 'install-error', version: '2.0.0' })
    expect(JSON.stringify(listener.mock.calls)).not.toContain('private-native-detail')
    await irms.updates.restartNow()
    expect(mock.install).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith({ state: 'installing', version: '2.0.0' })
  })

  it('isolates throwing subscribers during replay, progress and rejection without masking the native error', async () => {
    const original = new Error('installer rejected')
    mock.install.mockRejectedValueOnce(original).mockResolvedValueOnce(undefined)
    const { irms } = await import('./irmsApi')
    await irms.updates.checkNow()
    const throwing = vi.fn(() => { throw new Error('subscriber failed') })
    const unsubscribe = irms.updates.onStatusChange(throwing)
    const observer = vi.fn()
    irms.updates.onStatusChange(observer)
    await expect(irms.updates.restartNow()).rejects.toBe(original)
    expect(observer).toHaveBeenLastCalledWith({ state: 'install-error', version: '2.0.0' })
    unsubscribe()
    const calls = throwing.mock.calls.length
    await irms.updates.restartNow()
    expect(throwing).toHaveBeenCalledTimes(calls)
    expect(mock.install).toHaveBeenCalledTimes(2)
  })

  it('sets installation ownership before a status subscriber can reenter restart', async () => {
    const { irms } = await import('./irmsApi')
    await irms.updates.checkNow()
    let nested: Promise<void> | undefined
    irms.updates.onStatusChange((status) => {
      if (status.state === 'installing') nested = irms.updates.restartNow()
    })
    await irms.updates.restartNow()
    await nested
    expect(mock.install).toHaveBeenCalledTimes(1)
  })

  it('does not deliver an obsolete failure after a subscriber has synchronously started a newer attempt', async () => {
    mock.install.mockRejectedValueOnce(new Error('first attempt')).mockResolvedValueOnce(undefined)
    const { irms } = await import('./irmsApi')
    await irms.updates.checkNow()
    let retry: Promise<void> | undefined
    irms.updates.onStatusChange((status) => {
      if (status.state === 'install-error') retry = irms.updates.restartNow()
    })
    const observer = vi.fn()
    irms.updates.onStatusChange(observer)
    await expect(irms.updates.restartNow()).rejects.toThrow('first attempt')
    await retry
    expect(observer).toHaveBeenLastCalledWith({ state: 'installing', version: '2.0.0' })
    expect(observer.mock.calls.some(([status]) => status.state === 'install-error')).toBe(false)
    expect(mock.install).toHaveBeenCalledTimes(2)
  })
  it('blocks installation while a stopped session still owns unsaved data', async () => {
    const { irms } = await import('./irmsApi')
    const { useStore } = await import('../store/useStore')
    await irms.updates.checkNow()
    useStore.getState().patchSession({ id: 7, running: false })
    await irms.updates.restartNow()
    expect(mock.install).not.toHaveBeenCalled()
    useStore.getState().resetSession()
    await irms.updates.restartNow()
    expect(mock.install).toHaveBeenCalledTimes(1)
  })
  it('shares checks through download, retains the installer and replays status after remount', async () => {
    const pending = deferred()
    mock.download.mockReturnValue(pending.promise)
    const { irms } = await import('./irmsApi')
    const first = irms.updates.checkNow()
    const second = irms.updates.checkNow()
    await vi.waitFor(() => expect(mock.download).toHaveBeenCalledTimes(1))
    const third = irms.updates.checkNow()
    pending.resolve()
    await Promise.all([first, second, third])
    await irms.updates.checkNow()
    expect(mock.invoke).toHaveBeenCalledTimes(1)
    expect(mock.download).toHaveBeenCalledTimes(1)
    const listener = vi.fn()
    irms.updates.onStatusChange(listener)()
    expect(listener).toHaveBeenLastCalledWith({ state: 'downloaded', version: '2.0.0' })
    const install = deferred()
    mock.install.mockReturnValue(install.promise)
    const one = irms.updates.restartNow()
    await irms.updates.restartNow()
    expect(mock.install).toHaveBeenCalledTimes(1)
    install.resolve()
    await one
  })
  it('releases failed resources and permits retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mock.download.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined)
    const { irms } = await import('./irmsApi')
    await irms.updates.checkNow()
    expect(mock.close).toHaveBeenCalledTimes(1)
    await irms.updates.restartNow()
    expect(mock.install).not.toHaveBeenCalled()
    await irms.updates.checkNow()
    expect(mock.download).toHaveBeenCalledTimes(2)
    vi.restoreAllMocks()
  })
})
