// .tsx so it runs in the jsdom project (localStorage).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadModules, readDisabled, setModuleEnabled, useModulesStore, type ModuleLoaderDeps } from './modules'

const entry = (id: string) => ({ id, version: '1.0.0', name: id, description: '', path: `/m/${id}-1.0.0.js` })

function deps(over: Partial<ModuleLoaderDeps> = {}): ModuleLoaderDeps {
  return {
    sync: async () => ({ modules: [entry('tips')], offline: false, warnings: [] }),
    importModule: async () => ({
      default: {
        activate(ctx: { registerTip(t: string): void; log(m: string): void }) {
          ctx.registerTip('hello')
          ctx.log('hi')
        }
      }
    }),
    appVersion: '1.2.0-beta.13',
    log: vi.fn(),
    ...over
  }
}

beforeEach(() => {
  localStorage.clear()
  useModulesStore.setState({ modules: [], warnings: [], offline: false, syncing: false, syncError: null })
})

describe('module loader', () => {
  it('activates verified modules and collects their tips', async () => {
    const d = deps()
    await loadModules(d)
    const [m] = useModulesStore.getState().modules
    expect(m).toMatchObject({ id: 'tips', status: 'active', tips: ['hello'] })
    expect(d.log).toHaveBeenCalledWith('[module:tips] hi')
  })

  it('skips disabled modules without importing them', async () => {
    setModuleEnabled('tips', false)
    const importModule = vi.fn()
    await loadModules(deps({ importModule }))
    expect(importModule).not.toHaveBeenCalled()
    expect(useModulesStore.getState().modules[0].status).toBe('disabled')
  })

  it('isolates a module that throws', async () => {
    await loadModules(
      deps({
        sync: async () => ({ modules: [entry('bad'), entry('good')], offline: false, warnings: [] }),
        importModule: async (path) =>
          path.includes('bad')
            ? { default: { activate: () => { throw new Error('boom') } } }
            : { default: { activate: () => {} } }
      })
    )
    const [bad, good] = useModulesStore.getState().modules
    expect(bad).toMatchObject({ status: 'error', error: 'boom' })
    expect(good.status).toBe('active')
  })

  it('rejects a module without activate()', async () => {
    await loadModules(deps({ importModule: async () => ({ default: {} }) }))
    expect(useModulesStore.getState().modules[0].status).toBe('error')
  })

  it('surfaces a sync failure instead of throwing', async () => {
    await loadModules(deps({ sync: async () => { throw new Error('模組清單簽章驗證失敗') } }))
    expect(useModulesStore.getState().syncError).toBe('模組清單簽章驗證失敗')
  })

  it('treats corrupt stored preferences as all enabled', () => {
    localStorage.setItem('irms.modules.disabled', '{not json')
    expect(readDisabled().size).toBe(0)
  })
})
import { commitFeatures, removeFeatures, firmwareUpdaterFactory } from './moduleFeatures'
import { analyzeSession } from './sessionAnalysis'

it('registers providers transactionally and restores built-in behavior when disabled', async () => {
  const analyze = vi.fn(() => ({ activeSec: 2, peak: 42, mean: 21, inZoneRatio: null, overLimitEvents: 0, overLimitSec: 0 }))
  await loadModules(deps({
    sync: async () => ({ modules: [entry('session-analysis')], offline: false, warnings: [] }),
    importModule: async () => ({ default: { activate(ctx: { registerSessionAnalyzer: (fn: typeof analyze) => void }) { ctx.registerSessionAnalyzer(analyze) } } })
  }))
  expect(analyzeSession([], null).peak).toBe(42)
  setModuleEnabled('session-analysis', false)
  expect(analyzeSession([], null).peak).toBeNull()
})

it('discards registrations from failed activation and rejects another module claiming OTA', async () => {
  const factory = () => ({ run: async () => {} })
  await loadModules(deps({
    sync: async () => ({ modules: [entry('firmware-updater'), entry('other-module')], offline: false, warnings: [] }),
    importModule: async () => ({ default: { activate(ctx: { registerFirmwareUpdater: (fn: typeof factory) => void }) { ctx.registerFirmwareUpdater(factory); throw new Error('broken') } } })
  }))
  expect(firmwareUpdaterFactory()).toBeUndefined()
  expect(useModulesStore.getState().modules.every(m => m.status === 'error')).toBe(true)
})

it('falls back if an analysis module throws or returns invalid output', () => {
  commitFeatures('session-analysis', { sessionAnalyzer: () => { throw new Error('broken') } })
  expect(analyzeSession([], null).activeSec).toBe(0)
  commitFeatures('session-analysis', { sessionAnalyzer: () => ({}) as never })
  expect(analyzeSession([], null).activeSec).toBe(0)
  removeFeatures('session-analysis')
})

describe('live share capabilities', () => {
  it('hands liveShare only to the live-share module and accepts one panel', async () => {
    const seen: Record<string, unknown> = {}
    await loadModules(
      deps({
        sync: async () => ({ modules: [entry('live-share'), entry('tips')], offline: false, warnings: [] }),
        importModule: async (path) => ({
          default: {
            activate(ctx: { liveShare?: unknown; registerPanel(p: unknown): void }) {
              const id = path.includes('live-share') ? 'live-share' : 'tips'
              seen[id] = ctx.liveShare
              ctx.registerPanel({ mount: () => {} })
              if (id === 'tips') ctx.registerPanel({ mount: () => {} })
            }
          }
        })
      })
    )
    expect(seen['live-share']).toBeTypeOf('object')
    expect(seen.tips).toBeUndefined()
    const [share, tips] = useModulesStore.getState().modules
    expect(share.status).toBe('active')
    // A second panel registration is rejected and fails that module's activation.
    expect(tips).toMatchObject({ status: 'error', error: 'Invalid panel registration' })
  })
})

import { checkModuleUpdates } from './modules'

describe('module update check', () => {
  it('reports newer and newly installed versions without re-activating anything', async () => {
    await loadModules(deps())
    const sync = vi.fn(async () => ({
      modules: [{ ...entry('tips'), version: '1.1.0' }, entry('fresh')],
      offline: false,
      warnings: []
    }))
    await checkModuleUpdates(sync)
    const s = useModulesStore.getState()
    expect(s.pendingUpdates).toEqual([
      { id: 'tips', name: 'tips', from: '1.0.0', to: '1.1.0' },
      { id: 'fresh', name: 'fresh', from: null, to: '1.0.0' }
    ])
    expect(s.modules[0].version).toBe('1.0.0')
    expect(s.checking).toBe(false)
  })

  it('reports nothing pending when versions match, and surfaces a failure', async () => {
    await loadModules(deps())
    await checkModuleUpdates(async () => ({ modules: [entry('tips')], offline: false, warnings: [] }))
    expect(useModulesStore.getState().pendingUpdates).toEqual([])
    await checkModuleUpdates(async () => {
      throw new Error('offline')
    })
    expect(useModulesStore.getState()).toMatchObject({ syncError: 'offline', checking: false })
  })
})

it('reactivates a disabled verified module without another sync and disposes each instance', async () => {
  const clean = vi.fn()
  const signals: AbortSignal[] = []
  const d = deps({ importModule: async () => ({ default: { activate(ctx: import('./modules').ModuleContext) {
    signals.push(ctx.signal)
    ctx.onDispose(clean)
    ctx.registerPage({ title: 'Share', mount: () => {} })
  } } }) })
  const sync = vi.spyOn(d, 'sync')
  await loadModules(d)
  await setModuleEnabled('tips', false)
  expect(clean).toHaveBeenCalledTimes(1)
  expect(signals[0].aborted).toBe(true)
  await setModuleEnabled('tips', true)
  expect(useModulesStore.getState().modules[0].status).toBe('active')
  expect(signals[1].aborted).toBe(false)
  expect(sync).toHaveBeenCalledTimes(1)
  await setModuleEnabled('tips', false)
  expect(clean).toHaveBeenCalledTimes(2)
})

it('does not resurrect a disabled module when activation finishes late', async () => {
  let finish!: () => void
  let started!: () => void
  const began = new Promise<void>(r => { started = r })
  const clean = vi.fn()
  const loading = loadModules(deps({ importModule: async () => ({ default: { async activate(ctx: import('./modules').ModuleContext) {
    ctx.onDispose(clean)
    ctx.registerPage({ title: 'Share', mount: () => {} })
    started()
    await new Promise<void>(r => { finish = r })
  } } }) }))
  await began
  await setModuleEnabled('tips', false)
  finish()
  await loading
  expect(useModulesStore.getState().modules[0].status).toBe('disabled')
  expect(clean).toHaveBeenCalledTimes(1)
})

it('cleans partial activation, isolates throwing cleanup, and supports retry', async () => {
  const cleaned = vi.fn()
  let fail = true
  await loadModules(deps({ importModule: async () => ({ default: { activate(ctx: import('./modules').ModuleContext) {
    ctx.onDispose(cleaned)
    ctx.onDispose(() => { throw new Error('cleanup error') })
    if (fail) throw new Error('activation error')
    ctx.registerPage({ title: 'Recovered', mount: () => {} })
  } } }) }))
  expect(cleaned).toHaveBeenCalledTimes(1)
  expect(useModulesStore.getState().modules[0].status).toBe('error')
  fail = false
  await setModuleEnabled('tips', true)
  expect(useModulesStore.getState().modules[0].status).toBe('active')
})
