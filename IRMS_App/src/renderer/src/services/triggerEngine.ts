// --- 動作判定狀態機 ---
// 純邏輯(不碰 DOM),透過注入的事件回呼通知外部。
// v3 重構:改吃 movementMetric 正規化後的 EngineInput,三種 triggerType 的
// 判定收斂為單一路徑(值越大越接近目標)。
// v3.1 穩定化:進區用嚴格區間、保持中放寬 HYSTERESIS_DEG(遲滯),
// 跳出放寬區間後再給 EXIT_GRACE_MS 寬限(進度凍結不歸零),寬限內回區即續算;
// rep 只會在「區間內的樣本」上完成,不會在寬限期間觸發。
import { EXIT_GRACE_MS, HYSTERESIS_DEG, type MetricSample, type MetricZone } from './movementMetric'

export interface EngineInput {
  sample: MetricSample
  zone: MetricZone
  holdTimeMs: number
}

export interface TriggerEvents {
  onZoneEnter(): void
  onZoneExit(): void
  onHoldProgress(percent: number): void
  onRepCompleted(): void
  onRestCompleted(): void
  /** 超限安全警報狀態變化(true=進入危險超限,false=回復安全) */
  onOverExtension(active: boolean): void
}

/** 引擎階段:idle=等待進區,holding=區間內維持中,restPending=已計一下、等回休息位 */
export type EnginePhase = 'idle' | 'holding' | 'restPending'

export class TriggerEngine {
  private state: EnginePhase = 'idle'
  private inZoneStartTime = 0
  /** 保持中跳出放寬區間的起始時刻;null = 目前在區內 */
  private graceStartedAt: number | null = null
  private alarmActive = false

  constructor(
    private readonly events: TriggerEvents,
    /** 可注入的時間來源,便於測試 */
    private readonly now: () => number = () => Date.now()
  ) {}

  /** 目前階段(供 UI 顯示 phase 徽章與教練提示) */
  get phase(): EnginePhase {
    return this.state
  }

  /** 每筆即時角度(經 metric 層正規化)進來時呼叫 */
  handle(input: EngineInput): void {
    const { sample, zone, holdTimeMs } = input

    // ── 安全優先:超限警報獨立於達標狀態機,任何時刻都判定 ──
    const overExtended = sample.value > zone.overLimit
    if (overExtended !== this.alarmActive) {
      this.alarmActive = overExtended
      this.events.onOverExtension(overExtended)
    }

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

    if (this.state === 'idle' && strictIn) {
      this.state = 'holding'
      this.inZoneStartTime = this.now()
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
        const elapsed = this.now() - this.inZoneStartTime
        const percent = Math.min(100, (elapsed / holdTimeMs) * 100)
        this.events.onHoldProgress(percent)
        if (percent >= 100) {
          this.state = 'restPending'
          this.events.onRepCompleted()
        }
      } else if (this.graceStartedAt == null) {
        // 剛跳出:啟動寬限計時,進度凍結(不發事件、不清零)
        this.graceStartedAt = this.now()
      } else if (this.now() - this.graceStartedAt > EXIT_GRACE_MS) {
        // 寬限逾時:確定離區,進度歸零
        this.state = 'idle'
        this.inZoneStartTime = 0
        this.graceStartedAt = null
        this.events.onHoldProgress(0)
        this.events.onZoneExit()
      }
      // 寬限期間:維持 holding,等待回區或逾時
    }
  }

  /** 重置狀態機(Session 開始/結束、硬體錯誤時呼叫) */
  reset(): void {
    this.state = 'idle'
    this.inZoneStartTime = 0
    this.graceStartedAt = null
    if (this.alarmActive) {
      this.alarmActive = false
      this.events.onOverExtension(false)
    }
    this.events.onHoldProgress(0)
  }
}
