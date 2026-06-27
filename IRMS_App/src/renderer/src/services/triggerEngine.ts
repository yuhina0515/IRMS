// renderer/services/triggerEngine.ts
// --- 動作判定狀態機 ---
// 純邏輯(不碰 DOM),透過注入的事件回呼通知外部。
// 重點:本版重新實作了舊版重構時「遺失」的【超限安全警報】(Tier 1 安全功能)。

import type { LiveAngles } from '@shared/protocol'
import type { TriggerType } from '@shared/types'

export interface TriggerConfig {
  targetAngle: number
  tolerance: number
  holdTimeMs: number
  triggerType: TriggerType
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

type EngineState = 'IDLE' | 'HOLDING' | 'REST_PENDING'

/** 休息姿勢的放寬容錯(度) */
const REST_TOLERANCE = 30
/** 超限警報的額外安全邊界(度),對齊 AI_CODING_RULES §4.4 */
const OVER_EXTENSION_MARGIN = 10
/** segment 類動作判定膝近乎打直所允許的最大彎曲(度) */
const SEGMENT_KNEE_MAX = 15

export class TriggerEngine {
  private state: EngineState = 'IDLE'
  private inZoneStartTime = 0
  private alarmActive = false

  constructor(
    private readonly events: TriggerEvents,
    /** 可注入的時間來源,便於測試 */
    private readonly now: () => number = () => Date.now()
  ) {}

  /** 每筆即時角度進來時呼叫 */
  handle(angles: LiveAngles, config: TriggerConfig): void {
    // ── 安全優先:超限警報獨立於達標狀態機,任何時刻都判定 ──
    const overExtended = this.checkOverExtension(angles, config)
    if (overExtended !== this.alarmActive) {
      this.alarmActive = overExtended
      this.events.onOverExtension(overExtended)
    }

    const { knee, thigh, shin } = angles
    const { targetAngle, tolerance, holdTimeMs, triggerType } = config

    // ── 休息判定(完成一下後需回到休息位才能計下一下)──
    const atRest = this.checkRestCondition(knee, thigh, shin, triggerType)
    if (this.state === 'REST_PENDING') {
      if (atRest) {
        this.state = 'IDLE'
        this.events.onRestCompleted()
      }
      return
    }

    // ── 目標達標判定 ──
    const inZone = this.checkActionCondition(knee, thigh, shin, targetAngle, tolerance, triggerType)

    if (this.state === 'IDLE' && inZone) {
      this.state = 'HOLDING'
      this.inZoneStartTime = this.now()
      this.events.onZoneEnter()
    }

    if (this.state === 'HOLDING') {
      if (inZone) {
        const elapsed = this.now() - this.inZoneStartTime
        const percent = Math.min(100, (elapsed / holdTimeMs) * 100)
        this.events.onHoldProgress(percent)
        if (percent >= 100) {
          this.state = 'REST_PENDING'
          this.events.onRepCompleted()
        }
      } else {
        this.state = 'IDLE'
        this.inZoneStartTime = 0
        this.events.onHoldProgress(0)
        this.events.onZoneExit()
      }
    }
  }

  private checkActionCondition(
    knee: number,
    thigh: number,
    _shin: number,
    target: number,
    tol: number,
    triggerType: TriggerType
  ): boolean {
    switch (triggerType) {
      case 'segment_elevation':
        return knee <= Math.max(SEGMENT_KNEE_MAX, tol) && thigh >= target
      case 'segment_extension':
        return knee <= Math.max(SEGMENT_KNEE_MAX, tol) && thigh <= -target
      case 'joint_angle':
      default:
        return Math.abs(knee - target) <= tol
    }
  }

  private checkRestCondition(
    knee: number,
    thigh: number,
    _shin: number,
    triggerType: TriggerType
  ): boolean {
    switch (triggerType) {
      case 'segment_elevation':
        return thigh <= REST_TOLERANCE
      case 'segment_extension':
        return thigh >= -REST_TOLERANCE
      case 'joint_angle':
      default:
        return knee <= REST_TOLERANCE
    }
  }

  /** 超限危險判定:超過目標 + 容錯 + 安全邊界即觸發長鳴警報 */
  private checkOverExtension(angles: LiveAngles, config: TriggerConfig): boolean {
    const limit = config.targetAngle + config.tolerance + OVER_EXTENSION_MARGIN
    switch (config.triggerType) {
      case 'segment_elevation':
        return angles.thigh > limit
      case 'segment_extension':
        return angles.thigh < -limit
      case 'joint_angle':
      default:
        return angles.knee > limit
    }
  }

  /** 重置狀態機(Session 開始/結束時呼叫) */
  reset(): void {
    this.state = 'IDLE'
    this.inZoneStartTime = 0
    if (this.alarmActive) {
      this.alarmActive = false
      this.events.onOverExtension(false)
    }
    this.events.onHoldProgress(0)
  }
}
