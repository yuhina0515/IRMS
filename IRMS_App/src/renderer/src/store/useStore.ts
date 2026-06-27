// renderer/store/useStore.ts
// --- 全域狀態(單一真實來源)---
// 取代舊版的 StateManager + 散落在 DOM input 的雙重來源問題。
// 設定 (settings) 透過 persist 中介層自動存入 localStorage。

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CustomAction, JointProtocol } from '@shared/types'
import type { LiveAngles, RawAngles } from '@shared/protocol'

/** 感測器校準與一般 UI 設定(持久化) */
export interface Settings {
  thighInvert: boolean
  thighOffset: number
  shinInvert: boolean
  shinOffset: number
  thighRollInvert: boolean
  thighRollOffset: number
  shinRollInvert: boolean
  shinRollOffset: number
  protocol: JointProtocol
  maxChartPoints: number
  flushIntervalSec: number
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
}

const DEFAULT_SETTINGS: Settings = {
  thighInvert: false,
  thighOffset: 0,
  shinInvert: false,
  shinOffset: 0,
  thighRollInvert: false,
  thighRollOffset: 0,
  shinRollInvert: false,
  shinRollOffset: 0,
  protocol: 'knee',
  maxChartPoints: 50,
  flushIntervalSec: 2
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
  setAngles(angles: LiveAngles, raw: RawAngles): void
  setCustomActions(actions: CustomAction[]): void
  selectAction(id: number | null): void
  setParams(patch: Partial<SessionParams>): void
  setSettings(patch: Partial<Settings>): void
  patchSession(patch: Partial<SessionRuntime>): void
  resetSession(): void
  log(message: string): void
}

const MAX_LOG_LINES = 200

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
        running: false
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

      setAngles: (angles, raw) => set({ angles, rawAngles: raw }),

      setCustomActions: (actions) => set({ customActions: actions }),

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

      setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),

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
            running: false
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
      partialize: (state) => ({ settings: state.settings })
    }
  )
)

/** 依目前校準設定,將原始角度轉換為校正後的即時角度 */
export function applyCalibration(raw: RawAngles, s: Settings): LiveAngles {
  const thigh = raw.thigh * (s.thighInvert ? -1 : 1) + s.thighOffset
  const shin = raw.shin * (s.shinInvert ? -1 : 1) + s.shinOffset
  const thighRoll = raw.thighRoll * (s.thighRollInvert ? -1 : 1) + s.thighRollOffset
  const shinRoll = raw.shinRoll * (s.shinRollInvert ? -1 : 1) + s.shinRollOffset

  return {
    thigh,
    shin,
    knee: Math.abs(thigh - shin),
    thighRoll,
    shinRoll,
    kneeRoll: Math.abs(thighRoll - shinRoll),
    rawThigh: raw.thigh,
    rawShin: raw.shin,
    rawThighRoll: raw.thighRoll,
    rawShinRoll: raw.shinRoll
  }
}
