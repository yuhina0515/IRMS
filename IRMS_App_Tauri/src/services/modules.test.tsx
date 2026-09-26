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
