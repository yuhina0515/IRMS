// renderer/store/useStore.ts
// --- 全域狀態(單一真實來源)---
// 取代舊版的 StateManager + 散落在 DOM input 的雙重來源問題。
// 設定 (settings) 透過 persist 中介層自動存入 localStorage。

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CustomAction, JointProtocol } from '@shared/types'
import type { LiveAngles, RawAngles } from '@shared/protocol'
import type { EnginePhase } from '../services/triggerEngine'
import { jointAngleDeg, normalizeDeg, rotateRawAxes, shortestArcDelta } from '../services/angleMath'

/** 感測器校準與一般 UI 設定(持久化) */
export interface Settings {
  /**
   * 感測器貼裝時繞自身法向量偏轉的角度(°,(-90,90] 主值域)——2026-09-08 會議裁決,
   * 取代舊版二元 axisSwap(false→0、true→90 是精確映射,但這不是真的「升級」,見
   * proximalAxisRotationVerified)。0° = 正貼,90° = 貼歪整 90°。套用方式見
   * services/angleMath.ts 的 rotateRawAxes。
   */
  proximalAxisRotationDeg: number
  distalAxisRotationDeg: number
  /**
   * rotationDeg 是否曾由 recalibrateAxis 以真實動作重新解出(2026-09-08 會議方案);
   * false = 從舊版布林 axisSwap 遷移而來(legacy/unverified)——舊資料從未記錄推導 φ
   * 所需的原始通道,不能假裝跟新流程量出來的數值一樣可信(見 useStore.ts migrateSettings
   * 與 calibration.ts 的 calibrationDrift 使用)。
   */
  proximalAxisRotationVerified: boolean
  distalAxisRotationVerified: boolean
  proximalInvert: boolean
  /** 校準姿勢(視為 0°)當下、經 axisSwap 對調後的原始讀值——不折算 invert 符號。
   *  判定為 (raw − zeroRaw) × sign,故事後翻轉 invert 不會使零位偏移
   *  (2026-08-12 會議:舊「符號摺疊」offset 表示法在 invert 翻轉時會產生雙倍偏差,已隨 v1.0.1 出貨)。 */
  proximalZeroRaw: number
  distalInvert: boolean
  distalZeroRaw: number
  proximalRollInvert: boolean
  proximalRollZeroRaw: number
  distalRollInvert: boolean
  distalRollZeroRaw: number
  /** 大腿/小腿 roll 方向是否曾由精靈第 5 步(外展)實測驗證過;false = 仍在沿用預設或跳過時的舊值,內外翻方向可能相反 */
  proximalRollVerified: boolean
  distalRollVerified: boolean
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
  /**
   * Dashboard 的 Cockpit 左欄是否顯示「趨勢圖」分頁(2026-09-04,使用者要求預設收起
   * 非必要的視覺化內容,讓畫面在任何視窗尺寸下都不需要捲動)。關閉時左欄只剩
   * 「詳細數值」,不需要分頁切換 UI。趨勢圖資料仍持續累積,開啟後立刻有歷史曲線
   * ——比照 showKneeRoll 的既有慣例,隱藏不等於停止收集。
   */
  showTrendChart: boolean
  /**
   * Cockpit 右欄(3D/2D 姿態顯示)是否顯示,同一次改動、同一個理由。關閉時右欄
   * 整個不佔版面,左欄改為獨佔寬度,而不是留一塊空白卡片。
   */
  show3D2DPose: boolean
  /** 校準精靈最近一次完成套用的 ISO 時間;null 表示從未跑過精靈 */
  lastCalibratedAt: string | null
  /**
   * 目前感測器配戴在哪一側腿;null = 尚未由精靈詢問過(v5 以前的既有安裝)。
   *
   * 只用來偵測「配戴側是否換了」,不參與角度算式——換手/換腳不影響 pitch(前抬/
   * 後勾在兩側是同一個世界方向),但 roll 的「外側」在左右腿是互為鏡像,精靈第 5 步
   * (外展)一旦被跳過就會沿用**上一次配戴側**判定出的 roll invert,若那次是另一側,
   * 内外翻方向會左右相反且沒有任何提示(2026-08-28 實測發現)。
   */
  wearSide: 'left' | 'right' | null
  /** 兩套固定主題之一(外部設計 handoff 定案,見 doc/gemini-handoff-20260902/)——
   *  不是舊版可切換風格設定檔那種任意命名的系統,只有這兩個值。 */
  themeMode: 'dark' | 'light'
  /**
   * 是否接收 beta 版自動更新推播(對應 electron-updater 的 allowPrerelease)。
   * 預設 true——這是這個 App 至今唯一的釋出管道,關掉這裡不會讓「已裝的 beta」
   * 消失,只影響「以後還要不要繼續收到更新推播」。
   */
  allowBetaUpdates: boolean
  /**
   * 側邊欄是否收合。原本是 Sidebar.tsx 的元件本地 state(Phase 2b port 時原封不動
   * 搬過來),但 Electron 版 2026-09-09 實測回報「每次啟動選單都自動展開」——對
   * 使用者不是無感的暫態,是每次開 App 都要重新收一次的煩擾;那次修法改存進
   * settings 並持久化,但 Tauri 的前端搬遷發生在那次修復之前,從未回頭補上。
   */
  sidebarCollapsed: boolean
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
  proximalAxisRotationDeg: 0,
  distalAxisRotationDeg: 0,
  proximalAxisRotationVerified: false,
  distalAxisRotationVerified: false,
  proximalInvert: false,
  proximalZeroRaw: 0,
  distalInvert: false,
  distalZeroRaw: 0,
  proximalRollInvert: false,
  proximalRollZeroRaw: 0,
  distalRollInvert: false,
  distalRollZeroRaw: 0,
  proximalRollVerified: false,
  distalRollVerified: false,
  protocol: 'knee',
  maxChartPoints: 50,
  flushIntervalSec: 2,
  showKneeRoll: false,
  showTrendChart: false,
  show3D2DPose: false,
  lastCalibratedAt: null,
  wearSide: null,
  themeMode: 'dark',
  allowBetaUpdates: true,
  sidebarCollapsed: false
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
  'proximalAxisRotationDeg',
  'distalAxisRotationDeg',
  'proximalInvert',
  'proximalZeroRaw',
  'distalInvert',
  'distalZeroRaw',
  'proximalRollInvert',
  'proximalRollZeroRaw',
  'distalRollInvert',
  'distalRollZeroRaw'
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
  'proximalAxisRotationVerified',
  'distalAxisRotationVerified',
  'proximalRollVerified',
  'distalRollVerified',
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
      version: 13, // v4:offset 改參數化為 zeroRaw(2026-08-12 會議);v5:showKneeRoll;v6:wearSide;
      // v7:styleProfileId(已於 v8 移除,見下);v8:styleProfileId → themeMode(固定深淺兩套主題,
      // 取代任意命名的風格設定檔系統;舊資料裡殘留的 styleProfileId 欄位會被忽略,不影響行為)
      // v9:showTrendChart、show3D2DPose——Dashboard Cockpit 預設收起趨勢圖與 3D/2D 姿態顯示
      // v10:allowBetaUpdates
      // v11:欄位改名 thigh/shin → proximal/distal(ROADMAP D3 第一步,純改名不換算數值)
      // v12:axisSwap:boolean → axisRotationDeg:number(2026-09-08 會議裁決),legacy 一律標記未驗證
      // v13:sidebarCollapsed——補上 Electron 09-09 已修但 Tauri 前端搬遷未回頭補的持久化缺口
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

/** v11 使用的布林 axisSwap 命名——v12 起改為連續值 axisRotationDeg(見 migrateSettings)。 */
interface LegacyAxisSwapFields {
  proximalAxisSwap?: boolean
  distalAxisSwap?: boolean
}

/** v10 及更早版本使用的 thigh/shin 命名——v11 起改名 proximal/distal(見 ROADMAP D3),
 *  僅遷移時讀取,轉換公式全等(純改名,不改變任何數值)。 */
interface LegacyThighShinFields {
  thighAxisSwap?: boolean
  shinAxisSwap?: boolean
  thighInvert?: boolean
  thighZeroRaw?: number
  shinInvert?: boolean
  shinZeroRaw?: number
  thighRollInvert?: boolean
  thighRollZeroRaw?: number
  shinRollInvert?: boolean
  shinRollZeroRaw?: number
  thighRollVerified?: boolean
  shinRollVerified?: boolean
}

/** persist 遷移:以 DEFAULT_SETTINGS 補齊缺漏欄位,保留使用者既有(手動校準)值。export 供測試。
 *  v4:額外把舊版的符號摺疊 offset 換算成 zeroRaw——換算公式與 calibration.ts 寫入端相同的
 *  可逆關係:zeroRaw = -offset × (invert ? -1 : 1)(見 buildCalibrationPatch/buildQuickZeroPatch)。
 *  v11:欄位改名 thigh/shin → proximal/distal(見 ROADMAP D3);舊 key 存在時原值原封不動搬到
 *  新 key,純改名不換算。
 *  v12:axisSwap:boolean → axisRotationDeg:number(2026-09-08 會議裁決)。false→0/true→90
 *  是精確的布林值映射,但套用新的 rotateRawAxes 公式後,90° 邊界會有一軸出現舊版二元
 *  swap(純交換、不變號)沒有的變號——旋轉與反射在拓樸上不可能重合,這是兩種操作的本質
 *  差異而非實作疏漏(見 angleMath.ts rotateRawAxes 開頭推導)。因此舊資料一律標記
 *  axisRotationVerified:false(legacy/unverified),不假裝它跟新流程重新解出的數值
 *  一樣可信;calibrationDrift 據此在 History 提示「這場的軸向判定未經新方法驗證」。
 *  （唯一已知的實機校準值是 axisSwap:false/false,rotationDeg=0 時是精確恆等式,不受影響。） */
export function migrateSettings(persisted: unknown): { settings: Settings } {
  const p = (persisted ?? {}) as {
    settings?: Partial<Settings> & LegacyOffsetFields & LegacyThighShinFields & LegacyAxisSwapFields
  }
  const {
    thighOffset,
    shinOffset,
    thighRollOffset,
    shinRollOffset,
    thighAxisSwap,
    shinAxisSwap,
    proximalAxisSwap,
    distalAxisSwap,
    thighInvert,
    thighZeroRaw,
    shinInvert,
    shinZeroRaw,
    thighRollInvert,
    thighRollZeroRaw,
    shinRollInvert,
    shinRollZeroRaw,
    thighRollVerified,
    shinRollVerified,
    ...rest
  } = p.settings ?? {}

  // v12:axisSwap:boolean(v10 的 thighAxisSwap/shinAxisSwap 或 v11 的
  // proximalAxisSwap/distalAxisSwap,兩者等價,取任一個存在的)→ axisRotationDeg:number
  const legacyProximalSwap = proximalAxisSwap ?? thighAxisSwap
  const legacyDistalSwap = distalAxisSwap ?? shinAxisSwap
  const axisRotation: Partial<Settings> = {}
  if (typeof legacyProximalSwap === 'boolean' && rest.proximalAxisRotationDeg == null) {
    axisRotation.proximalAxisRotationDeg = legacyProximalSwap ? 90 : 0
    axisRotation.proximalAxisRotationVerified = false
  }
  if (typeof legacyDistalSwap === 'boolean' && rest.distalAxisRotationDeg == null) {
    axisRotation.distalAxisRotationDeg = legacyDistalSwap ? 90 : 0
    axisRotation.distalAxisRotationVerified = false
  }

  // v11 純改名(舊 key 存在且新 key 尚未設定時才搬,避免蓋掉一個已經是新格式的值)
  const renamed: Partial<Settings> = {}
  if (thighInvert !== undefined && rest.proximalInvert == null) {
    renamed.proximalInvert = thighInvert
  }
  if (typeof thighZeroRaw === 'number' && rest.proximalZeroRaw == null) {
    renamed.proximalZeroRaw = thighZeroRaw
  }
  if (shinInvert !== undefined && rest.distalInvert == null) {
    renamed.distalInvert = shinInvert
  }
  if (typeof shinZeroRaw === 'number' && rest.distalZeroRaw == null) {
    renamed.distalZeroRaw = shinZeroRaw
  }
  if (thighRollInvert !== undefined && rest.proximalRollInvert == null) {
    renamed.proximalRollInvert = thighRollInvert
  }
  if (typeof thighRollZeroRaw === 'number' && rest.proximalRollZeroRaw == null) {
    renamed.proximalRollZeroRaw = thighRollZeroRaw
  }
  if (shinRollInvert !== undefined && rest.distalRollInvert == null) {
    renamed.distalRollInvert = shinRollInvert
  }
  if (typeof shinRollZeroRaw === 'number' && rest.distalRollZeroRaw == null) {
    renamed.distalRollZeroRaw = shinRollZeroRaw
  }
  if (thighRollVerified !== undefined && rest.proximalRollVerified == null) {
    renamed.proximalRollVerified = thighRollVerified
  }
  if (shinRollVerified !== undefined && rest.distalRollVerified == null) {
    renamed.distalRollVerified = shinRollVerified
  }

  // v4 舊版符號摺疊 offset → zeroRaw(換算後的值已經是「新格式」,鍵名直接用 proximal/distal;
  // 讀 invert 時優先看剛剛搬過來的 renamed,因為 rest 裡不會有它,舊物件裡才有)
  const sign = (invert: boolean | undefined): number => (invert ? -1 : 1)
  const legacyZeroRaw: Partial<Settings> = {}
  if (typeof thighOffset === 'number' && renamed.proximalZeroRaw == null && rest.proximalZeroRaw == null) {
    legacyZeroRaw.proximalZeroRaw = -thighOffset * sign(thighInvert)
  }
  if (typeof shinOffset === 'number' && renamed.distalZeroRaw == null && rest.distalZeroRaw == null) {
    legacyZeroRaw.distalZeroRaw = -shinOffset * sign(shinInvert)
  }
  if (
    typeof thighRollOffset === 'number' &&
    renamed.proximalRollZeroRaw == null &&
    rest.proximalRollZeroRaw == null
  ) {
    legacyZeroRaw.proximalRollZeroRaw = -thighRollOffset * sign(thighRollInvert)
  }
  if (
    typeof shinRollOffset === 'number' &&
    renamed.distalRollZeroRaw == null &&
    rest.distalRollZeroRaw == null
  ) {
    legacyZeroRaw.distalRollZeroRaw = -shinRollOffset * sign(shinRollInvert)
  }

  return { settings: { ...DEFAULT_SETTINGS, ...rest, ...renamed, ...legacyZeroRaw, ...axisRotation } }
}

/**
 * 依目前校準設定,將原始角度轉換為校正後的即時角度。
 * 順序:軸向旋轉修正 (axisRotationDeg) → 反相 (invert) → 偏移 (offset)。
 * 統一方向慣例(校準後):
 * - Pitch:0° = 站直,正 = 向前抬
 * - Roll:0° = 站直,正 = 向外側傾
 * - kneeRoll:帶符號 shinRoll − thighRoll,正 = 外翻 (valgus)、負 = 內翻 (varus)
 */
export function applyCalibration(raw: RawAngles, s: Settings): LiveAngles {
  const thighAxis = rotateRawAxes(raw.thigh, raw.thighRoll, s.proximalAxisRotationDeg)
  const shinAxis = rotateRawAxes(raw.shin, raw.shinRoll, s.distalAxisRotationDeg)
  const rawThigh = thighAxis.pitch
  const rawThighRoll = thighAxis.roll
  const rawShin = shinAxis.pitch
  const rawShinRoll = shinAxis.roll

  // 先減零位、再反相(順序不可顛倒——顛倒等於回到會被 invert 事後翻轉破壞的舊
  // 「符號摺疊」offset 表示法)。減法與乘法之後必須重新正規化回 (-180, 180]:
  // 結果可能被推出值域,之後任何線性差值運算(knee、kneeRoll)都會算出繞遠路的結果
  const thigh = normalizeDeg((rawThigh - s.proximalZeroRaw) * (s.proximalInvert ? -1 : 1))
  const shin = normalizeDeg((rawShin - s.distalZeroRaw) * (s.distalInvert ? -1 : 1))
  const thighRoll = normalizeDeg((rawThighRoll - s.proximalRollZeroRaw) * (s.proximalRollInvert ? -1 : 1))
  const shinRoll = normalizeDeg((rawShinRoll - s.distalRollZeroRaw) * (s.distalRollInvert ? -1 : 1))

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
