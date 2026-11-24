// --- 動作判定狀態機 ---
// 純邏輯(不碰 DOM),透過注入的事件回呼通知外部。
// v3 重構:改吃 movementMetric 正規化後的 EngineInput,三種 triggerType 的
// 判定收斂為單一路徑(值越大越接近目標)。
// v3.1 穩定化:進區用嚴格區間、保持中放寬 HYSTERESIS_DEG(遲滯),
// 跳出放寬區間後再給 EXIT_GRACE_MS 寬限(進度凍結不歸零),寬限內回區即續算;
// rep 只會在「區間內的樣本」上完成,不會在寬限期間觸發。
import { EXIT_GRACE_MS, HYSTERESIS_DEG, NO_LIMITS, type AngleLimits, type MetricSample, type MetricZone } from './movementMetric'

export interface EngineInput {
  sample: MetricSample
  zone: MetricZone
  holdTimeMs: number
  /** 使用者本人的舒適角度/極限範圍(膝角);未量測為 null,不做任何角度警示 */
  limits?: AngleLimits
}

export interface TriggerEvents {
  onZoneEnter(): void
  onZoneExit(): void
  onHoldProgress(percent: number): void
  onRepCompleted(): void
  onRestCompleted(): void
  /** 超出極限範圍的狀態變化(true=膝角超過個人極限,false=回到極限內) */
  onOverExtension(active: boolean): void
  /** 超出舒適角度的狀態變化(只做畫面提示) */
  onComfortExceeded?(active: boolean): void
}

/** 引擎階段:idle=等待進區,holding=區間內維持中,restPending=已計一下、等回休息位 */
export type EnginePhase = 'idle' | 'holding' | 'restPending'

/** 接收端連續性防線；25Hz 串流超過 250ms 未收到樣本便不可延續保持，非臨床閾值。 */
export const ENGINE_MAX_SAMPLE_GAP_MS = 250

export class TriggerEngine {
  private state: EnginePhase = 'idle'
  private inZoneStartTime = 0
  /** 保持中跳出放寬區間的起始時刻;null = 目前在區內 */
  private graceStartedAt: number | null = null
  private alarmActive = false
  private overComfort = false
  /** 上筆樣本的接收端單調時間；不代表感測器來源時間或跨感測器同步。 */
  private lastSampleAt: number | null = null

  constructor(
    private readonly events: TriggerEvents,
    /** 可注入的時間來源,便於測試 */
    private readonly now: () => number = () => performance.now()
  ) {}

  /** 目前階段(供 UI 顯示 phase 徽章與教練提示) */
  get phase(): EnginePhase {
    return this.state
  }

  /** 每筆即時角度(經 metric 層正規化)進來時呼叫 */
  handle(input: EngineInput): void {
    const { sample, zone, holdTimeMs } = input
    const limits = input.limits ?? NO_LIMITS

    // ── 個人角度範圍:獨立於達標狀態機,任何時刻都判定(一律比膝角)──
    const overExtended = limits.limit != null && sample.knee > limits.limit
    if (overExtended !== this.alarmActive) {
      this.alarmActive = overExtended
      this.events.onOverExtension(overExtended)
    }
    const overComfort = limits.comfort != null && sample.knee > limits.comfort
    if (overComfort !== this.overComfort) {
      this.overComfort = overComfort
      this.events.onComfortExceeded?.(overComfort)
    }

    // 每筆只讀一次時鐘。空窗或時鐘異常只中止保持，不解除 restPending／個人角度警示。
    const now = this.now()
    const validTime = Number.isFinite(now)
    const discontinuous = !validTime || (this.lastSampleAt != null &&
      (now < this.lastSampleAt || now - this.lastSampleAt > ENGINE_MAX_SAMPLE_GAP_MS))
    this.lastSampleAt = validTime ? now : null
    if (discontinuous) this.leaveHolding()
    if (!validTime) return

    // ── 休息判定(完成一下後需回到休息位才能計下一下)──
    if (this.state === 'restPending') {
      if (sample.value <= zone.rest) {
        this.state = 'idle'
        this.events.onRestCompleted()
      }
      return
    }

    // ── 進區:嚴格區間(遲滯的窄邊)──
    const strictIn = sample.kneeStraightOk && sample.value >= zone.min && sample.value <= zone.max

    // 寬限已逾時才來下一筆(例如藍牙中斷):不論這筆是否在區內,先確認離區,
    // 否則整段空白會被算進保持時間。
    if (
      this.state === 'holding' &&
      this.graceStartedAt != null &&
      now - this.graceStartedAt > EXIT_GRACE_MS
    ) {
      this.leaveHolding()
    }

    if (this.state === 'idle' && strictIn) {
      this.state = 'holding'
      this.inZoneStartTime = now
      this.graceStartedAt = null
      this.events.onZoneEnter()
    }

    if (this.state === 'holding') {
      // 保持中改判放寬區間(遲滯的寬邊);膝直前置同樣放寬,防止邊界抖動
      const kneeOkRelaxed = sample.kneeMax == null || sample.knee <= sample.kneeMax + HYSTERESIS_DEG
      const relaxedIn =
        kneeOkRelaxed &&
        sample.value >= zone.min - HYSTERESIS_DEG &&
        sample.value <= zone.max + HYSTERESIS_DEG

      if (relaxedIn) {
        this.graceStartedAt = null
        const elapsed = now - this.inZoneStartTime
        // holdTimeMs 為 0 時 (elapsed / 0) 在第一個封包是 0/0 = NaN,之後是 Infinity;
        // NaN 會一路流進 session.holdProgress 與量表。輸入端已鉗制下限,這裡再防一層。
        const percent = Math.min(100, (elapsed / Math.max(1, holdTimeMs)) * 100)
        this.events.onHoldProgress(percent)
        if (percent >= 100) {
          this.state = 'restPending'
          this.events.onRepCompleted()
        }
      } else if (this.graceStartedAt == null) {
        // 剛跳出:啟動寬限計時,進度凍結(不發事件、不清零)
        this.graceStartedAt = now
      }
      // 寬限期間:維持 holding,等待回區或逾時
    }
  }

  /** 連續性失守與離區逾時共用的保持取消；已完成一下的回位義務保持不變。 */
  private leaveHolding(): void {
    if (this.state !== 'holding') return
    this.state = 'idle'
    this.inZoneStartTime = 0
    this.graceStartedAt = null
    this.events.onHoldProgress(0)
    this.events.onZoneExit()
  }

  /** 重置狀態機(Session 開始/結束、硬體錯誤時呼叫) */
  reset(): void {
    this.state = 'idle'
    this.inZoneStartTime = 0
    this.graceStartedAt = null
    this.lastSampleAt = null
    if (this.alarmActive) {
      this.alarmActive = false
      this.events.onOverExtension(false)
    }
    if (this.overComfort) {
      this.overComfort = false
      this.events.onComfortExceeded?.(false)
    }
    this.events.onHoldProgress(0)
  }
}
