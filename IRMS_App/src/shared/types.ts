// shared/types.ts
// --- 領域模型與資料庫型別 (前後端共用單一真實來源) ---

/** 關節復健協定 */
export type JointProtocol = 'knee' | 'elbow' | 'shoulder'

export const JOINT_PROTOCOLS: { value: JointProtocol; label: string }[] = [
  { value: 'knee', label: 'Knee Flexion (膝彎曲)' },
  { value: 'elbow', label: 'Elbow Flexion (肘彎曲) — 尚未支援' },
  { value: 'shoulder', label: 'Shoulder Abduction (肩外展) — 尚未支援' }
]

/**
 * 目前判定管線真正支援的協定。
 *
 * elbow / shoulder 在資料模型與 UI 上都存在,選了也能建立動作、能按開始,
 * 產生一場看起來完全正常的 Session——但 `computeMetricSample` 永遠讀
 * `angles.thigh` / `angles.knee`(腿部感測器),量表標籤也寫死「大腿仰角」。
 * 結果是把腿的資料錄成一場「肩關節」紀錄,而督導無從察覺。
 *
 * 泛化的正確順序見 ROADMAP 決策 D3(先改共享型別 proximal/distal → DB migration
 * → UI 標籤 → 判定邏輯)。在那之前,寧可明確擋下,也不要產生假的臨床紀錄。
 */
export const SUPPORTED_PROTOCOLS: readonly JointProtocol[] = ['knee']

export function isProtocolSupported(p: JointProtocol | null | undefined): boolean {
  return p != null && SUPPORTED_PROTOCOLS.includes(p)
}

/**
 * 動作判定規則:
 * - joint_angle:關節夾角達標(|knee - target| <= tol)
 * - segment_elevation:直膝抬腿(knee 接近 0 且 thigh >= target)
 * - segment_extension:直膝後擺(knee 接近 0 且 thigh <= -target)
 */
export type TriggerType = 'joint_angle' | 'segment_elevation' | 'segment_extension'

export const TRIGGER_TYPES: { value: TriggerType; label: string }[] = [
  { value: 'joint_angle', label: 'Joint Flexion (關節角度達標)' },
  { value: 'segment_elevation', label: 'Segment Elevation (直膝抬腿)' },
  { value: 'segment_extension', label: 'Segment Extension (直膝後擺)' }
]

/** 自訂復健動作(custom_actions 資料表) */
export interface CustomAction {
  id: number
  name: string
  description: string | null
  protocol: JointProtocol
  targetAngle: number
  tolerance: number
  holdTimeMs: number
  triggerType: TriggerType
  /**
   * 超限警報門檻(度)。null = 沿用導出值 target + tolerance + 10。
   * 獨立於 tolerance:放寬容錯讓患者容易達標,不該連帶把安全上限往外推。
   */
  safetyLimit: number | null
}

/** 建立/更新動作的輸入(無 id) */
export type CustomActionInput = Omit<CustomAction, 'id'>

/** 復健歷程(sessions 資料表) */
export interface Session {
  id: number
  startTime: string
  endTime: string | null
  targetAngle: number
  tolerance: number
  holdTimeMs: number
  /** 此 Session 使用的動作 id(對應 custom_actions.id);null 表示臨時動作 */
  actionId: number | null
  /** 動作名稱快照(即使動作日後被刪除,歷史仍可顯示) */
  actionName: string | null
  protocol: JointProtocol | null
  repsCompleted: number
  /** 當場的安全上限快照(null = 使用導出值) */
  safetyLimit: number | null
  /** 當場的判定型別快照;歷史分析據此畫出「實際被判定的那個指標」。舊列為 null */
  triggerType: TriggerType | null
  /**
   * 1 = 這場 Session 沒有正常結束(關窗/強殺/當機),由啟動時的孤兒收尾補上結束時間。
   * repsCompleted 只在正常結束時寫入,所以 abandoned 的列其 reps 不可信——
   * UI 必須標示出來,而不是把 0 當成事實呈現。
   */
  abandoned: 0 | 1
}

/** 開始 Session 的輸入 */
export interface SessionStartInput {
  targetAngle: number
  tolerance: number
  holdTimeMs: number
  actionId: number | null
  actionName: string | null
  protocol: JointProtocol | null
  triggerType: TriggerType | null
  safetyLimit: number | null
}

/** 單筆高頻角度讀數(sensor_data 資料表) */
export interface SensorReading {
  kneeAngle: number
  thighAngle: number
  shinAngle: number
  kneeRoll: number
  thighRoll: number
  shinRoll: number
  /** ISO 8601 時間戳 */
  timestamp: string
}

/** 含主鍵的已儲存讀數(查詢回傳用) */
export interface StoredReading extends SensorReading {
  id: number
  sessionId: number
}

/**
 * preload 透過 contextBridge 暴露給 renderer 的型別安全 API。
 * renderer 以 window.irms 存取,完全取代舊版的 HTTP fetch。
 */
export interface IrmsApi {
  sessions: {
    start(input: SessionStartInput): Promise<{ sessionId: number }>
    end(sessionId: number, repsCompleted: number): Promise<{ success: true }>
    /** 逐次持久化 reps,讓非正常結束的 Session 仍保有正確計數 */
    progress(sessionId: number, reps: number): Promise<{ success: true }>
    list(): Promise<Session[]>
    /** maxPoints 給定時於主進程 LTTB 抽樣(圖表用);CSV 匯出不給,取全量 */
    getData(sessionId: number, maxPoints?: number): Promise<StoredReading[]>
    delete(sessionId: number): Promise<{ success: true }>
  }
  data: {
    appendBatch(sessionId: number, readings: SensorReading[]): Promise<{ count: number }>
  }
  actions: {
    list(): Promise<CustomAction[]>
    create(input: CustomActionInput): Promise<CustomAction>
    update(id: number, input: CustomActionInput): Promise<CustomAction>
    delete(id: number): Promise<{ success: true }>
    restoreDefaults(): Promise<CustomAction[]>
  }
}
