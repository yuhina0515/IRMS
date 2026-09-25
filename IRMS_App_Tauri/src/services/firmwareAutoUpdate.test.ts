import { describe, expect, it, vi } from 'vitest'
import { createFirmwareAutoUpdater, type AutoUpdateDeps, type AutoUpdateStatus } from './firmwareAutoUpdate'

function setup(over: Partial<AutoUpdateDeps> = {}, state: Partial<ReturnType<AutoUpdateDeps['state']>> = {}) {
  const reports: AutoUpdateStatus[] = []
  const s = { connected: true, simulated: false, sessionRunning: false, hardwareError: false, ...state }
  const deps: AutoUpdateDeps = {
    state: () => s,
    readDeviceVersion: vi.fn(async () => '1.0.0'),
    checkLatest: vi.fn(async () => ({ version: '1.1.0', size: 10, notes: '', appCompatible: true })),
    isNewer: vi.fn(async (d: string | null, l: string) => d !== l),
    download: vi.fn(async () => ({ path: 'x', size: 10, md5: 'm', data: new Uint8Array(10) })),
    flash: vi.fn(async (_f, onProgress) => {
      onProgress({ phase: 'transferring', bytesSent: 5, totalBytes: 10 })
      return { ok: true, message: 'ok' }
    }),
    report: (r) => reports.push(r),
    log: () => {},
    ...over
  }
  return { deps, reports, s, updater: createFirmwareAutoUpdater(deps) }
}

const phases = (r: AutoUpdateStatus[]) => r.map((x) => x.phase)

describe('firmware auto-update', () => {
  it('updates an older device while idle', async () => {
    const { updater, reports, deps } = setup()
    await updater.run()
    expect(deps.flash).toHaveBeenCalledOnce()
    expect(phases(reports)).toEqual(['checking', 'downloading', 'updating', 'updating', 'done'])
    expect(reports.find((r) => r.percent === 50)).toBeTruthy()
  })

  it('defers during a session and never touches the network', async () => {
    const { updater, reports, deps } = setup({}, { sessionRunning: true })
    await updater.run()
    expect(phases(reports)).toEqual(['deferred'])
    expect(deps.checkLatest).not.toHaveBeenCalled()
  })

  it('does nothing when disconnected, simulated or in hardware error', async () => {
    for (const st of [{ connected: false }, { simulated: true }, { hardwareError: true }]) {
      const { updater, reports } = setup({}, st)
      await updater.run()
      expect(reports).toEqual([])
    }
  })

  it('reports up to date without downloading', async () => {
    const { updater, reports, deps } = setup({ readDeviceVersion: async () => '1.1.0' })
    await updater.run()
    expect(phases(reports)).toEqual(['checking', 'up_to_date'])
    expect(deps.download).not.toHaveBeenCalled()
  })

  it('refuses firmware that needs a newer app', async () => {
    const { updater, reports, deps } = setup({
      checkLatest: async () => ({ version: '1.1.0', size: 10, notes: '', appCompatible: false })
    })
    await updater.run()
    expect(phases(reports).at(-1)).toBe('incompatible')
    expect(deps.download).not.toHaveBeenCalled()
  })

  it('aborts if a session started while downloading', async () => {
    const ctx = setup()
    ctx.deps.download = vi.fn(async () => {
      ctx.s.sessionRunning = true
      return { path: 'x', size: 10, md5: 'm', data: new Uint8Array(10) }
    })
    const updater = createFirmwareAutoUpdater(ctx.deps)
    await updater.run()
    expect(ctx.deps.flash).not.toHaveBeenCalled()
    expect(phases(ctx.reports).at(-1)).toBe('deferred')
  })

  it('tries a given version only once per run of the app', async () => {
    const { updater, reports, deps } = setup({ flash: vi.fn(async () => ({ ok: false, message: 'NO_SPACE' })) })
    await updater.run()
    await updater.run()
    expect(deps.flash).toHaveBeenCalledOnce()
    expect(reports.at(-1)?.message).toMatch(/手動更新/)
  })

  it('turns a verification failure into an error status', async () => {
    const { updater, reports } = setup({
      checkLatest: async () => {
        throw new Error('韌體清單簽章驗證失敗,拒絕更新')
      }
    })
    await updater.run()
    expect(reports.at(-1)).toMatchObject({ phase: 'error', message: '韌體清單簽章驗證失敗,拒絕更新' })
  })
})
