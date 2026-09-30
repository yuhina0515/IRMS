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
