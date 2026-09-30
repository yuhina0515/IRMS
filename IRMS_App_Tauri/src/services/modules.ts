// services/modules.ts
// 第一方執行期模組(IRMS-Modules repo,doc/AUTO_PUSH_PLAN.md)。下載、簽章與雜湊驗證全在
// Rust(modules.rs);這裡只 import() 已驗證的檔案並呼叫 activate(ctx)。
//
// 第一方簽章模組透過 ModuleContext 註冊功能(不是 JavaScript sandbox)。新增能力需 App 擴充
// ctx,而不是讓模組自己 import 東西(模組 repo 的 build 會拒絕含 import 的模組)。
import { create } from 'zustand'
import { commitFeatures, removeFeatures, type FeatureProviders, type FirmwareUpdaterFactory, type ModulePanel, type ModulePage, type SessionAnalyzer } from './moduleFeatures'
import { liveShareApi, type LiveShareApi } from './liveShareHost'
import { angleRangeModuleApi, type AngleRangeModuleApi } from './angleRange'
import type { InstalledModule, ModuleSyncResult } from '@shared/types'
import { getT } from '../i18n'

export interface ModuleContext {
  appVersion: string
  apiVersion: 2
  registerFirmwareUpdater(factory: FirmwareUpdaterFactory): void
  registerSessionAnalyzer(analyze: SessionAnalyzer): void
  registerTip(text: string): void
  /** Legacy adapter: registerPanel 的介面以模組名稱為標題顯示在「工具」頁(同 registerPage)。 */
  registerPanel(panel: ModulePanel): void
  /** 在「工具」頁掛載此模組的操作頁(任何模組皆可,僅限啟用期間註冊一次);設定 → 模組只做管理 */
  registerPage(page: ModulePage): void
  readonly signal: AbortSignal
  onDispose(cleanup: () => void | Promise<void>): void
  /** 即時分享能力;只有 id 為 `live-share` 的模組拿得到,其他模組為 undefined */
  liveShare?: LiveShareApi
  /** 個人舒適角度/極限範圍的量測與紀錄;只有 id 為 `angle-range` 的模組拿得到 */
  angleRange?: AngleRangeModuleApi
  log(message: string): void
}

interface IrmsModule {
  contractVersion?: number
  activate(ctx: ModuleContext): void | Promise<void>
}

export interface LoadedModuleState {
  id: string
  name: string
  version: string
  description: string
  enabled: boolean
  status: 'active' | 'disabled' | 'error' | 'loading'
  tips: string[]
  error?: string
}

export interface ModuleUpdateInfo {
  id: string
  name: string
  /** null = 新安裝的模組 */
  from: string | null
  to: string
}

interface ModulesState {
  modules: LoadedModuleState[]
  warnings: string[]
  offline: boolean
  syncing: boolean
  syncError: string | null
  checking: boolean
  /** 最近一次檢查發現、已下載但尚未載入的新版本(重新啟動後套用) */
  pendingUpdates: ModuleUpdateInfo[]
  lastChecked: string | null
  set(patch: Partial<Omit<ModulesState, 'set'>>): void
}

export const useModulesStore = create<ModulesState>((set) => ({
  modules: [],
  warnings: [],
  offline: false,
  syncing: false,
  syncError: null,
  checking: false,
  pendingUpdates: [],
  lastChecked: null,
  set: (patch) => set(patch)
}))

const DISABLED_KEY = 'irms.modules.disabled'
const MAX_TIPS = 10
const MAX_TIP_LENGTH = 200

/** 使用者停用的模組是個人偏好,存 localStorage 即可;讀不到就當全部啟用 */
export function readDisabled(): Set<string> {
  try {
    const raw = localStorage.getItem(DISABLED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeDisabled(ids: Set<string>): void {
  try {
    localStorage.setItem(DISABLED_KEY, JSON.stringify([...ids]))
  } catch {
    // 無法保存只代表下次啟動恢復預設(啟用),不影響本次
  }
}

export interface ModuleLoaderDeps {
  sync(): Promise<ModuleSyncResult>
  importModule(path: string): Promise<{ default?: unknown }>
  appVersion: string
  log(message: string): void
}

function isIrmsModule(x: unknown): x is IrmsModule {
  return typeof x === 'object' && x != null && typeof (x as IrmsModule).activate === 'function'
}

type Cleanup = () => void | Promise<void>
const catalog = new Map<string, { entry: InstalledModule; deps: ModuleLoaderDeps }>()
const runtimes = new Map<string, { controller: AbortController; cleanups: Cleanup[] }>()
const pendingCleanup = new Map<string, Promise<void>>()
let queue = Promise.resolve()

function serial(work: () => Promise<void>): Promise<void> {
  const next = queue.then(work)
  queue = next.catch(() => {})
  return next
}

/** Abort synchronously; await asynchronous cleanup before a replacement activation. */
function dispose(id: string): Promise<void> {
  removeFeatures(id)
  const runtime = runtimes.get(id)
  runtimes.delete(id)
  if (!runtime) return pendingCleanup.get(id) ?? Promise.resolve()
  runtime.controller.abort()
  const work = Promise.all(runtime.cleanups.reverse().map(async (cleanup) => {
    try { await cleanup() } catch (err) { catalog.get(id)?.deps.log(`[module:${id}] cleanup failed: ${String(err)}`) }
  })).then(() => {})
  pendingCleanup.set(id, work)
  return work
}

function updateModule(id: string, patch: Partial<LoadedModuleState>): void {
  const store = useModulesStore.getState()
  store.set({ modules: store.modules.map(m => m.id === id ? { ...m, ...patch } : m) })
}

async function activate(m: InstalledModule, deps: ModuleLoaderDeps): Promise<LoadedModuleState> {
  await dispose(m.id)
  const base = { id: m.id, name: m.name, version: m.version, description: m.description, enabled: true }
  const tips: string[] = []
  const features: FeatureProviders = {}
  const runtime = { controller: new AbortController(), cleanups: [] as Cleanup[] }
  runtimes.set(m.id, runtime)
  let registering = true
  const check = (): void => {
    if (!registering || runtime.controller.signal.aborted) throw new Error('Module registration is closed')
  }
  try {
    const mod = (await deps.importModule(m.path)).default
    check()
    if (!isIrmsModule(mod)) throw new Error(getT().modules.noActivate)
    if (mod.contractVersion !== undefined && mod.contractVersion !== 1) throw new Error('Unsupported module contract version')
    await mod.activate({
      appVersion: deps.appVersion,
      apiVersion: 2,
      signal: runtime.controller.signal,
      onDispose: (cleanup) => {
        check()
        if (typeof cleanup !== 'function') throw new Error('Invalid cleanup registration')
        runtime.cleanups.push(cleanup)
      },
      registerFirmwareUpdater: (factory) => {
        check()
        if (features.firmwareUpdater || m.id !== 'firmware-updater' || typeof factory !== 'function') throw new Error('Invalid firmware provider registration')
        features.firmwareUpdater = factory
      },
      registerSessionAnalyzer: (analyze) => {
        check()
        if (features.sessionAnalyzer || m.id !== 'session-analysis' || typeof analyze !== 'function') throw new Error('Invalid analysis provider registration')
        features.sessionAnalyzer = analyze
      },
      registerTip: (text) => {
        check()
        if (typeof text === 'string' && tips.length < MAX_TIPS) tips.push(text.slice(0, MAX_TIP_LENGTH))
      },
      registerPanel: (panel) => {
        check()
        if (features.page || typeof panel?.mount !== 'function') throw new Error('Invalid panel registration')
        features.page = { title: m.name, mount: panel.mount }
      },
      registerPage: (page) => {
        check()
        if (features.page || typeof page?.mount !== 'function' || typeof page.title !== 'string' || !page.title.trim() || page.title.length > 80) throw new Error('Invalid page registration')
        features.page = page
      },
      liveShare: m.id === 'live-share' ? liveShareApi : undefined,
      angleRange: m.id === 'angle-range' ? angleRangeModuleApi : undefined,
      log: (message) => deps.log(`[module:${m.id}] ${String(message).slice(0, 300)}`)
    })
    check()
    registering = false
    if (readDisabled().has(m.id)) {
      await dispose(m.id)
      return { ...base, enabled: false, status: 'disabled', tips: [] }
    }
    commitFeatures(m.id, features)
    return { ...base, status: 'active', tips }
  } catch (err) {
    registering = false
    await dispose(m.id)
    if (readDisabled().has(m.id)) return { ...base, enabled: false, status: 'disabled', tips: [] }
    const error = err instanceof Error ? err.message : String(err)
    deps.log(`[module:${m.id}] failed to activate: ${error}`)
    return { ...base, status: 'error', tips: [], error }
  }
}

export function loadModules(deps: ModuleLoaderDeps): Promise<void> {
  return serial(async () => {
    const store = useModulesStore.getState()
    store.set({ syncing: true, syncError: null })
    try {
      const result = await deps.sync()
      for (const id of runtimes.keys()) await dispose(id)
      catalog.clear()
      store.set({ modules: result.modules.map(m => ({ ...m, enabled: !readDisabled().has(m.id), status: 'loading', tips: [] })) })
      for (const m of result.modules) {
        catalog.set(m.id, { entry: m, deps })
        if (readDisabled().has(m.id)) updateModule(m.id, { enabled: false, status: 'disabled', tips: [] })
        else updateModule(m.id, await activate(m, deps))
      }
      store.set({ warnings: result.warnings, offline: result.offline, syncing: false })
    } catch (err) {
      store.set({ syncing: false, syncError: err instanceof Error ? err.message : String(err) })
    }
  })
}

/**
 * 檢查模組更新:重新同步(下載並驗證新版本),與目前已載入的版本比對。
 * 已經 activate 的模組程式碼無法熱換,所以新版本在下次啟動時才會載入。
 */
export async function checkModuleUpdates(sync: () => Promise<ModuleSyncResult>): Promise<void> {
  const store = useModulesStore.getState()
  if (store.checking) return
  store.set({ checking: true, syncError: null })
  try {
    const result = await sync()
    const loaded = new Map(useModulesStore.getState().modules.map((m) => [m.id, m.version]))
    const pendingUpdates = result.modules
      .filter((m) => loaded.get(m.id) !== m.version)
      .map((m) => ({ id: m.id, name: m.name, from: loaded.get(m.id) ?? null, to: m.version }))
    store.set({ pendingUpdates, warnings: result.warnings, offline: result.offline, lastChecked: new Date().toISOString(), checking: false })
  } catch (err) {
    store.set({ checking: false, syncError: err instanceof Error ? err.message : String(err) })
  }
}

/** Re-enable the verified local module immediately; no download or app restart needed. */
export function setModuleEnabled(id: string, enabled: boolean): Promise<void> {
  const disabled = readDisabled()
  if (enabled) disabled.delete(id)
  else disabled.add(id)
  writeDisabled(disabled)
  if (!enabled) {
    const cleanup = dispose(id)
    updateModule(id, { enabled: false, status: 'disabled', tips: [] })
    return cleanup
  }
  updateModule(id, { enabled: true, status: 'loading', error: undefined })
  return serial(async () => {
    const saved = catalog.get(id)
    if (!saved || readDisabled().has(id)) return
    updateModule(id, await activate(saved.entry, saved.deps))
  })
}
