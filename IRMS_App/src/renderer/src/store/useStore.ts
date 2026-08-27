// renderer/store/useStore.ts
// --- 全域狀態(單一真實來源)---
// 取代舊版的 StateManager + 散落在 DOM input 的雙重來源問題。
// 設定 (settings) 透過 persist 中介層自動存入 localStorage。

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CustomAction, JointProtocol } from '@shared/types'
import type { LiveAngles, RawAngles } from '@shared/protocol'
import type { EnginePhase } from '../services/triggerEngine'
import { jointAngleDeg, normalizeDeg, shortestArcDelta } from '../services/angleMath'

/** 感測器校準與一般 UI 設定(持久化) */
export interface Settings {
  /** 感測器貼歪 90°(彎曲動作出現在 roll 軸)時,軟體對調該肢段的 pitch/roll */
  thighAxisSwap: boolean
  shinAxisSwap: boolean
  thighInvert: boolean
  /** 校準姿勢(視為 0°)當下、經 axisSwap 對調後的原始讀值——不折算 invert 符號。
   *  判定為 (raw − zeroRaw) × sign,故事後翻轉 invert 不會使零位偏移
   *  (2026-08-12 會議:舊「符號摺疊」offset 表示法在 invert 翻轉時會產生雙倍偏差,已隨 v1.0.1 出貨)。 */
  thighZeroRaw: number
  shinInvert: boolean
  shinZeroRaw: number
  thighRollInvert: boolean
  thighRollZeroRaw: number
  shinRollInvert: boolean
  shinRollZeroRaw: number
  /** 大腿/小腿 roll 方向是否曾由精靈第 5 步(外展)實測驗證過;false = 仍在沿用預設或跳過時的舊值,內外翻方向可能相反 */
  thighRollVerified: boolean
  shinRollVerified: boolean
  protocol: JointProtocol
  maxChartPoints: number
  flushIntervalSec: number
  /**
   * 即時折線圖是否加畫內外翻(kneeRoll)曲線。
   *
   * 只畫 kneeRoll 而不是三條 roll 全上:kneeRoll 是帶符號的
   * `shinRoll − thighRoll`(正 = 外翻 valgus、負 = 內翻 varus),
   * 也就是臨床上真正被判讀的那個量;個別肢段的 roll 只是它的組成成分。
   *
   * ⚠ 它**不參與任何達標/超限判定**(判定只讀 Pitch),純粹是給督導看的顯示。
   * 預設關閉,避免在預設畫面上多一條與判定無關的線,讓人以為它會影響結果。
   */
  showKneeRoll: boolean
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
  thighZeroRaw: 0,
  shinInvert: false,
  shinZeroRaw: 0,
  thighRollInvert: false,
  thighRollZeroRaw: 0,
  shinRollInvert: false,
  shinRollZeroRaw: 0,
  thighRollVerified: false,
  shinRollVerified: false,
  protocol: 'knee',
  maxChartPoints: 50,
  flushIntervalSec: 2,
  showKneeRoll: false,
  lastCalibratedAt: null
}

/**
 * 真正參與 `(raw − zeroRaw) × sign` 這條算式的欄位——換句話說,改了它們,同一組
 * 原始讀值就會算出不同的角度。歷史紀錄要判斷「這場能不能照今天的設定解讀」,
 * 比的必須是這一組:`lastCalibratedAt` 只是時間戳,`*Verified` 只是「方向有沒有
 * 被實測過」的註記,兩者都不改變任何數字。把它們算進差異,會讓「重跑一次精靈、
 * 結果數值完全一樣」這個最常見的情況跳出「校準已改變」的警告——一個不存在的問題
 * 每次都響,真正的方向錯位反而被當成雜訊略過。
 */
export const CALIBRATION_TRANSFORM_KEYS = [
  'thighAxisSwap',
  'shinAxisSwap',
  'thighInvert',
  'thighZeroRaw',
  'shinInvert',
  'shinZeroRaw',
  'thighRollInvert',
  'thighRollZeroRaw',
  'shinRollInvert',
  'shinRollZeroRaw'
] as const satisfies readonly (keyof Settings)[]

/**
 * 快照與凍結的完整欄位集:轉換欄位,加上「這場是怎麼校出來的」的存證欄位。
 *
 * 這組欄位在 Session 進行中一律凍結。理由不是潔癖:`sessions.calibration`(migration 6)
 * 是「一場一個」的單一快照,一旦允許中途改校準,那個快照就會謊報——2026-08-12 會議
 * 對兩段式串流實測過,單一快照最壞可差 57°。與其存一個看起來合理但是錯的數字,
 * 不如讓轉換在一場之內不可變,快照因此由建構保證為真。
 *
 * protocol / maxChartPoints / flushIntervalSec 不在此列:它們不改變角度的算法。
 */
export const CALIBRATION_KEYS = [
  ...CALIBRATION_TRANSFORM_KEYS,
  // 以下不改變算式,但屬於「這場是怎麼校出來的」的存證,一併快照:
  'thighRollVerified',
  'shinRollVerified',
  'lastCalibratedAt'
] as const satisfies readonly (keyof Settings)[]

/** 把一筆 settings patch 拆成「Session 進行中仍可套用」與「被凍結」兩部分。export 供測試。 */
export function splitCalibrationPatch(patch: Partial<Settings>): {
  allowed: Partial<Settings>
  frozen: (keyof Settings)[]
} {
  const frozenSet = new Set<string>(CALIBRATION_KEYS)
  const allowed: Partial<Settings> = {}
  const frozen: (keyof Settings)[] = []
  for (const key of Object.keys(patch) as (keyof Settings)[]) {
    if (frozenSet.has(key)) frozen.push(key)
    else (allowed as Record<string, unknown>)[key] = patch[key]
  }
  return { allowed, frozen }
}

interface StoreState {
  // 連線
  isConnected: boolean
  deviceName: string | null
  statusText: string
  /**
   * 自動重連進行中的第幾次嘗試;null = 沒有在重連。
   *
   * 為什麼不重用 statusText:`attemptReconnect` 本來就會寫
   * 「Reconnecting (n/5)...」,但它下一行呼叫的 `connectGATT()` 開頭就是
   * `setStatus('Connecting...')`,**同一次嘗試內就把計數蓋掉了**;
   * `setConnection` 也會無條件覆寫 statusText。也就是說那個計數器從來沒有被看見過。
   * 進度是結構化狀態,不是一段會被別人覆寫的文字。
   */
  reconnect: { attempt: number; max: number } | null
  /** 硬體錯誤代碼(如 'ERR:1'),null 表示正常 */
  hardwareError: string | null
  /**
   * BLE 鏈路正在截斷封包(MTU 沒協商到 `config.h` 的 128,停在預設 23)。
   *
   * 不是 `hardwareError`:判定只讀 Pitch,而 `T:`/`S:` 在 20 bytes 的切點下必定
   * 完整存活,所以療程仍然可以正常進行——升起紅色遮罩把它擋掉是過度反應。
   * 真正壞掉的是 Roll,它餵的是 3D 姿態顯示與校準精靈的外展步驟,因此改用
   * 不阻斷但持續可見的提示。連線時重置。
   */
  linkTruncated: boolean

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
  /** 設定重連進度;null = 結束重連(成功、耗盡、或手動斷線) */
  setReconnect(state: { attempt: number; max: number } | null): void
  setHardwareError(code: string | null): void
  setLinkTruncated(truncated: boolean): void
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
      reconnect: null,
      hardwareError: null,
      linkTruncated: false,

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
          statusText: isConnected ? `Connected to ${deviceName}` : 'Disconnected',
          // 連上了就不再是「重連中」。放在這裡而不是只靠 bluetooth.ts 呼叫,
          // 是因為 connectGATT 成功的路徑只會走到 setConnection,不會回到重連迴圈。
          ...(isConnected ? { reconnect: null } : {})
        }),

      setStatus: (text) => set({ statusText: text }),

      setReconnect: (reconnect) => set({ reconnect }),

      setHardwareError: (code) => set({ hardwareError: code }),

      setLinkTruncated: (truncated) => set({ linkTruncated: truncated }),

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
        // Session 進行中凍結校準:見 CALIBRATION_KEYS。刻意「丟掉並留下日誌」而非
        // 靜默忽略——靜默失敗正是這個專案反覆抓到的那類缺陷。真正的防線在 UI
        // (按鈕/入口在進行中就不可按),這裡是最後一道,擋掉任何繞過 UI 的路徑。
        if (state.session.running) {
          const { allowed, frozen } = splitCalibrationPatch(patch)
          if (frozen.length > 0) {
            state.log(`Calibration frozen during session; ignored: ${frozen.join(', ')}`)
            if (Object.keys(allowed).length === 0) return
            patch = allowed
          }
        }
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
      // v5:新增 showKneeRoll。**新增欄位一定要 bump version**——不是因為
      // migrateSettings 補不了(它是 {...DEFAULT_SETTINGS, ...rest},補得了),
      // 而是因為 migrate **只在 persisted version < current 時才會被呼叫**。
      // 版本不變就不會跑,zustand 預設的淺層 merge 會拿舊的 settings 物件
      // 整個蓋掉初始值,新欄位變成 undefined。
      version: 5, // v4:offset 改參數化為 zeroRaw(2026-08-12 會議);v5:showKneeRoll
      migrate: (persisted) => migrateSettings(persisted)
    }
  )
)

/** v3 及更早版本使用的「符號摺疊」offset 欄位——已被 zeroRaw 取代,僅遷移時讀取 */
interface LegacyOffsetFields {
  thighOffset?: number
  shinOffset?: number
  thighRollOffset?: number
  shinRollOffset?: number
}

/** persist 遷移:以 DEFAULT_SETTINGS 補齊缺漏欄位,保留使用者既有(手動校準)值。export 供測試。
 *  v4:額外把舊版的符號摺疊 offset 換算成 zeroRaw——換算公式與 calibration.ts 寫入端相同的
 *  可逆關係:zeroRaw = -offset × (invert ? -1 : 1)(見 buildCalibrationPatch/buildQuickZeroPatch)。 */
export function migrateSettings(persisted: unknown): { settings: Settings } {
  const p = (persisted ?? {}) as { settings?: Partial<Settings> & LegacyOffsetFields }
  const { thighOffset, shinOffset, thighRollOffset, shinRollOffset, ...rest } = p.settings ?? {}

  const sign = (invert: boolean | undefined): number => (invert ? -1 : 1)
  const legacyZeroRaw: Partial<Settings> = {}
  if (typeof thighOffset === 'number' && rest.thighZeroRaw == null) {
    legacyZeroRaw.thighZeroRaw = -thighOffset * sign(rest.thighInvert)
  }
  if (typeof shinOffset === 'number' && rest.shinZeroRaw == null) {
    legacyZeroRaw.shinZeroRaw = -shinOffset * sign(rest.shinInvert)
  }
  if (typeof thighRollOffset === 'number' && rest.thighRollZeroRaw == null) {
    legacyZeroRaw.thighRollZeroRaw = -thighRollOffset * sign(rest.thighRollInvert)
  }
  if (typeof shinRollOffset === 'number' && rest.shinRollZeroRaw == null) {
    legacyZeroRaw.shinRollZeroRaw = -shinRollOffset * sign(rest.shinRollInvert)
  }

  return { settings: { ...DEFAULT_SETTINGS, ...rest, ...legacyZeroRaw } }
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

  // 先減零位、再反相(順序不可顛倒——顛倒等於回到會被 invert 事後翻轉破壞的舊
  // 「符號摺疊」offset 表示法)。減法與乘法之後必須重新正規化回 (-180, 180]:
  // 結果可能被推出值域,之後任何線性差值運算(knee、kneeRoll)都會算出繞遠路的結果
  const thigh = normalizeDeg((rawThigh - s.thighZeroRaw) * (s.thighInvert ? -1 : 1))
  const shin = normalizeDeg((rawShin - s.shinZeroRaw) * (s.shinInvert ? -1 : 1))
  const thighRoll = normalizeDeg((rawThighRoll - s.thighRollZeroRaw) * (s.thighRollInvert ? -1 : 1))
  const shinRoll = normalizeDeg((rawShinRoll - s.shinRollZeroRaw) * (s.shinRollInvert ? -1 : 1))

  return {
    thigh,
    shin,
    knee: jointAngleDeg(thigh, shin),
    thighRoll,
    shinRoll,
    kneeRoll: shortestArcDelta(thighRoll, shinRoll),
    rawThigh: raw.thigh,
    rawShin: raw.shin,
    rawThighRoll: raw.thighRoll,
    rawShinRoll: raw.shinRoll
  }
}
