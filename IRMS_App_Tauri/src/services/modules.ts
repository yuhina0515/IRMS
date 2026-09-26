// services/modules.ts
// 第一方執行期模組(IRMS-Modules repo,doc/AUTO_PUSH_PLAN.md)。下載、簽章與雜湊驗證全在
// Rust(modules.rs);這裡只 import() 已驗證的檔案並呼叫 activate(ctx)。
//
// 第一方簽章模組透過 ModuleContext 註冊功能(不是 JavaScript sandbox)。新增能力需 App 擴充
// ctx,而不是讓模組自己 import 東西(模組 repo 的 build 會拒絕含 import 的模組)。
import { create } from 'zustand'
import { commitFeatures, removeFeatures, type FeatureProviders, type FirmwareUpdaterFactory, type SessionAnalyzer } from './moduleFeatures'
import type { InstalledModule, ModuleSyncResult } from '@shared/types'

export interface ModuleContext {
  appVersion: string
  apiVersion: 2
  registerFirmwareUpdater(factory: FirmwareUpdaterFactory): void
  registerSessionAnalyzer(analyze: SessionAnalyzer): void
  registerTip(text: string): void
  log(message: string): void
}

interface IrmsModule {
  activate(ctx: ModuleContext): void | Promise<void>
}

export interface LoadedModuleState {
  id: string
  name: string
  version: string
  description: string
  enabled: boolean
  status: 'active' | 'disabled' | 'error'
  tips: string[]
  error?: string
}

interface ModulesState {
  modules: LoadedModuleState[]
  warnings: string[]
  offline: boolean
  syncing: boolean
  syncError: string | null
  set(patch: Partial<Omit<ModulesState, 'set'>>): void
}

export const useModulesStore = create<ModulesState>((set) => ({
  modules: [],
  warnings: [],
  offline: false,
  syncing: false,
  syncError: null,
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

async function activate(m: InstalledModule, deps: ModuleLoaderDeps): Promise<LoadedModuleState> {
  const base = { id: m.id, name: m.name, version: m.version, description: m.description, enabled: true }
  const tips: string[] = []
  const features: FeatureProviders = {}
  let registering = true
  try {
    const mod = (await deps.importModule(m.path)).default
    if (!isIrmsModule(mod)) throw new Error('模組沒有匯出 activate()')
    await mod.activate({
      appVersion: deps.appVersion,
      apiVersion: 2,
      registerFirmwareUpdater: (factory) => {
        if (!registering || m.id !== 'firmware-updater' || typeof factory !== 'function') throw new Error('Invalid firmware provider registration')
        features.firmwareUpdater = factory
      },
      registerSessionAnalyzer: (analyze) => {
        if (!registering || m.id !== 'session-analysis' || typeof analyze !== 'function') throw new Error('Invalid analysis provider registration')
        features.sessionAnalyzer = analyze
      },
      registerTip: (text) => {
        if (typeof text === 'string' && tips.length < MAX_TIPS) tips.push(text.slice(0, MAX_TIP_LENGTH))
      },
      log: (message) => deps.log(`[module:${m.id}] ${String(message).slice(0, 300)}`)
    })
    registering = false
    commitFeatures(m.id, features)
    return { ...base, status: 'active', tips }
  } catch (err) {
    registering = false
    removeFeatures(m.id)
    const error = err instanceof Error ? err.message : String(err)
    deps.log(`[module:${m.id}] failed to activate: ${error}`)
    return { ...base, status: 'error', tips: [], error }
  }
}

export async function loadModules(deps: ModuleLoaderDeps): Promise<void> {
  const store = useModulesStore.getState()
  store.set({ syncing: true, syncError: null })
  try {
    const result = await deps.sync()
    for (const m of store.modules) removeFeatures(m.id)
    const disabled = readDisabled()
    const modules: LoadedModuleState[] = []
    for (const m of result.modules) {
      if (disabled.has(m.id)) {
        modules.push({ id: m.id, name: m.name, version: m.version, description: m.description, enabled: false, status: 'disabled', tips: [] })
      } else {
        modules.push(await activate(m, deps))
      }
    }
    store.set({ modules, warnings: result.warnings, offline: result.offline, syncing: false })
  } catch (err) {
    store.set({ syncing: false, syncError: err instanceof Error ? err.message : String(err) })
  }
}

/**
 * 切換啟用狀態。停用立即生效於畫面(清空提示);已經執行過的模組程式碼無法「卸載」,
 * 所以重新啟用要等下次啟動才會再次 activate——這點在設定頁講清楚,不假裝熱插拔。
 */
export function setModuleEnabled(id: string, enabled: boolean): void {
  const disabled = readDisabled()
  if (enabled) disabled.delete(id)
  else disabled.add(id)
  writeDisabled(disabled)
  if (!enabled) removeFeatures(id)
  const store = useModulesStore.getState()
  store.set({
    modules: store.modules.map((m) =>
      m.id !== id ? m : enabled ? { ...m, enabled: true } : { ...m, enabled: false, status: 'disabled', tips: [] }
    )
  })
}
