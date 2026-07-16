// renderer/store/useStore.ts
// --- 全域狀態(單一真實來源)---
// 取代舊版的 StateManager + 散落在 DOM input 的雙重來源問題。
// 設定 (settings) 透過 persist 中介層自動存入 localStorage。

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CustomAction, JointProtocol } from '@shared/types'
import type { LiveAngles, RawAngles } from '@shared/protocol'
import type { EnginePhase } from '../services/triggerEngine'

/** 感測器校準與一般 UI 設定(持久化) */
export interface Settings {
  /** 感測器貼歪 90°(彎曲動作出現在 roll 軸)時,軟體對調該肢段的 pitch/roll */
  thighAxisSwap: boolean
  shinAxisSwap: boolean
  thighInvert: boolean
  thighOffset: number
  shinInvert: boolean
  shinOffset: number
  thighRollInvert: boolean
  thighRollOffset: number
  shinRollInvert: boolean
  shinRollOffset: number
  /** 大腿/小腿 roll 方向是否曾由精靈第 5 步(外展)實測驗證過;false = 仍在沿用預設或跳過時的舊值,內外翻方向可能相反 */
  thighRollVerified: boolean
  shinRollVerified: boolean
  protocol: JointProtocol
  maxChartPoints: number
  flushIntervalSec: number
  /** 校準精靈最近一次完成套用的 ISO 時間;null 表示從未跑過精靈 */
  lastCalibratedAt: string | null
}

/** 目標判定參數(由選定動作帶入,使用者可即時調整) */
export interface SessionParams {
  targetAngle: number
  tolerance: number
  holdTimeMs: number
}

/** 進行中 Session 的執行期狀態 */
export interface SessionRuntime {
  id: number | null
  reps: number
  holdProgress: number
  inZone: boolean
  alarmActive: boolean
  elapsedSec: number
  running: boolean
  /** 判定引擎當前階段(idle/holding/restPending),供 phase 徽章與教練提示 */
  phase: EnginePhase
}

const DEFAULT_SETTINGS: Settings = {
  thighAxisSwap: false,
  shinAxisSwap: false,
  thighInvert: false,
  thighOffset: 0,
  shinInvert: false,
  shinOffset: 0,
  thighRollInvert: false,
  thighRollOffset: 0,
  shinRollInvert: false,
  shinRollOffset: 0,
  thighRollVerified: false,
  shinRollVerified: false,
  protocol: 'knee',
  maxChartPoints: 50,
  flushIntervalSec: 2,
  lastCalibratedAt: null
}

interface StoreState {
  // 連線
  isConnected: boolean
  deviceName: string | null
  statusText: string
  /** 硬體錯誤代碼(如 'ERR:1'),null 表示正常 */
  hardwareError: string | null

  // 即時資料
  angles: LiveAngles | null
  rawAngles: RawAngles | null

  // 動作資料
  customActions: CustomAction[]
  selectedActionId: number | null

  // 目標參數
  params: SessionParams

  // Session 執行期
  session: SessionRuntime

  // 設定(持久化)
  settings: Settings

  // 系統日誌(環狀緩衝)
  logs: string[]

  // ── actions ──
  setConnection(isConnected: boolean, deviceName: string | null): void
  setStatus(text: string): void
  setHardwareError(code: string | null): void
  /** 原始角度全速更新(校準精靈取樣依賴 25Hz 逐筆) */
  setRawAngles(raw: RawAngles): void
  /** 顯示用角度 + 保持進度的節流同步(單一 set,一次重繪);hold=null 表示進度不變 */
  syncLiveFrame(angles: LiveAngles, holdProgress: number | null): void
  setCustomActions(actions: CustomAction[]): void
  selectAction(id: number | null): void
  setParams(patch: Partial<SessionParams>): void
  setSettings(patch: Partial<Settings>): void
  patchSession(patch: Partial<SessionRuntime>): void
  resetSession(): void
  log(message: string): void
}

const MAX_LOG_LINES = 200

/**
 * 依動作清單與當前協定,校正選取狀態:
 * 現選動作仍有效則保留;否則自動選取該協定下第一個動作(並帶入其參數)。
 * 解決「切換協定後 selectedActionId 殘留他協定動作 → Start 按鈕死鎖、下拉框顯示與狀態不符」。
 * (export 供單元測試)
 */
export function reconcileSelection(
  actions: CustomAction[],
  protocol: JointProtocol,
  currentId: number | null
): { selectedActionId: number | null; params?: SessionParams } {
  const current = actions.find((a) => a.id === currentId && a.protocol === protocol)
  if (current) return { selectedActionId: current.id }
  const first = actions.find((a) => a.protocol === protocol)
  if (!first) return { selectedActionId: null }
  return {
    selectedActionId: first.id,
    params: { targetAngle: first.targetAngle, tolerance: first.tolerance, holdTimeMs: first.holdTimeMs }
  }
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      isConnected: false,
      deviceName: null,
      statusText: 'Disconnected',
      hardwareError: null,

      angles: null,
      rawAngles: null,

      customActions: [],
      selectedActionId: null,

      params: { targetAngle: 90, tolerance: 10, holdTimeMs: 3000 },

      session: {
        id: null,
        reps: 0,
        holdProgress: 0,
        inZone: false,
        alarmActive: false,
        elapsedSec: 0,
        running: false,
        phase: 'idle'
      },

      settings: DEFAULT_SETTINGS,
      logs: [],

      setConnection: (isConnected, deviceName) =>
        set({
          isConnected,
          deviceName,
          statusText: isConnected ? `Connected to ${deviceName}` : 'Disconnected'
        }),

      setStatus: (text) => set({ statusText: text }),

      setHardwareError: (code) => set({ hardwareError: code }),

      setRawAngles: (raw) => set({ rawAngles: raw }),

      syncLiveFrame: (angles, holdProgress) =>
        set((state) => ({
          angles,
          // 進度值未變時保留 session 物件參照,避免無謂重繪
          session:
            holdProgress != null && holdProgress !== state.session.holdProgress
              ? { ...state.session, holdProgress }
              : state.session
        })),

      setCustomActions: (actions) => {
        const { settings, selectedActionId, session } = get()
        // Session 進行中不動選取,避免判定參數被中途抽換
        if (session.running) {
          set({ customActions: actions })
          return
        }
        set({ customActions: actions, ...reconcileSelection(actions, settings.protocol, selectedActionId) })
      },

      selectAction: (id) => {
        const action = get().customActions.find((a) => a.id === id)
        set({
          selectedActionId: id,
          params: action
            ? { targetAngle: action.targetAngle, tolerance: action.tolerance, holdTimeMs: action.holdTimeMs }
            : get().params
        })
      },

      setParams: (patch) => set({ params: { ...get().params, ...patch } }),

      setSettings: (patch) => {
        const state = get()
        const settings = { ...state.settings, ...patch }
        const protocolChanged = patch.protocol != null && patch.protocol !== state.settings.protocol
        if (protocolChanged && !state.session.running) {
          set({
            settings,
            ...reconcileSelection(state.customActions, settings.protocol, state.selectedActionId)
          })
        } else {
          set({ settings })
        }
      },

      patchSession: (patch) => set({ session: { ...get().session, ...patch } }),

      resetSession: () =>
        set({
          session: {
            id: null,
            reps: 0,
            holdProgress: 0,
            inZone: false,
            alarmActive: false,
            elapsedSec: 0,
            running: false,
            phase: 'idle'
          }
        }),

      log: (message) => {
        const time = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
        const line = `[${time}] ${message}`
        // eslint-disable-next-line no-console
        console.log(line)
        const logs = [...get().logs, line]
        set({ logs: logs.length > MAX_LOG_LINES ? logs.slice(logs.length - MAX_LOG_LINES) : logs })
      }
    }),
    {
      name: 'irms-settings',
      // 僅持久化 settings,其餘為執行期狀態
      partialize: (state) => ({ settings: state.settings }),
      // ⚠ zustand persist 為 shallow merge:舊 localStorage 的 settings 物件會整包
      // 蓋掉新增欄位。新增 Settings 欄位時必須遞增 version 並經 migrateSettings 補齊預設值。
      version: 3, // v3:新增 thighRollVerified/shinRollVerified(外展方向是否已實測驗證)
      migrate: (persisted) => migrateSettings(persisted)
    }
  )
)

/** persist 遷移:以 DEFAULT_SETTINGS 補齊缺漏欄位,保留使用者既有(手動校準)值。export 供測試。 */
export function migrateSettings(persisted: unknown): { settings: Settings } {
  const p = (persisted ?? {}) as { settings?: Partial<Settings> }
  return { settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) } }
}

/**
 * 依目前校準設定,將原始角度轉換為校正後的即時角度。
 * 順序:軸對調 (axisSwap) → 反相 (invert) → 偏移 (offset)。
 * 統一方向慣例(校準後):
 * - Pitch:0° = 站直,正 = 向前抬
 * - Roll:0° = 站直,正 = 向外側傾
 * - kneeRoll:帶符號 shinRoll − thighRoll,正 = 外翻 (valgus)、負 = 內翻 (varus)
 */
export function applyCalibration(raw: RawAngles, s: Settings): LiveAngles {
  const rawThigh = s.thighAxisSwap ? raw.thighRoll : raw.thigh
  const rawThighRoll = s.thighAxisSwap ? raw.thigh : raw.thighRoll
  const rawShin = s.shinAxisSwap ? raw.shinRoll : raw.shin
  const rawShinRoll = s.shinAxisSwap ? raw.shin : raw.shinRoll

  const thigh = rawThigh * (s.thighInvert ? -1 : 1) + s.thighOffset
  const shin = rawShin * (s.shinInvert ? -1 : 1) + s.shinOffset
  const thighRoll = rawThighRoll * (s.thighRollInvert ? -1 : 1) + s.thighRollOffset
  const shinRoll = rawShinRoll * (s.shinRollInvert ? -1 : 1) + s.shinRollOffset

  return {
    thigh,
    shin,
    knee: Math.abs(thigh - shin),
    thighRoll,
    shinRoll,
    kneeRoll: shinRoll - thighRoll,
    rawThigh: raw.thigh,
    rawShin: raw.shin,
    rawThighRoll: raw.thighRoll,
    rawShinRoll: raw.shinRoll
  }
}
