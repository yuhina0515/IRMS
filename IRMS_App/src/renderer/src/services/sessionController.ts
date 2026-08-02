// renderer/services/sessionController.ts
// --- Session 生命週期協調器 ---
// 串接:即時角度 → 達標判定(TriggerEngine)→ 硬體回饋(BLE 指令)+ 資料緩衝寫入(IPC)。
// 取代舊版散落在 SessionControl 元件中的計時器/緩衝/指令去重邏輯。

import type { LiveAngles } from '@shared/protocol'
import { BleCommand } from '@shared/protocol'
import type { SensorReading, TriggerType } from '@shared/types'
import { clampTriggerParams } from '@shared/validation'
import { useStore } from '../store/useStore'
import { bluetoothService } from './bluetooth'
import { computeMetricSample, computeMetricZone, type TriggerConfig } from './movementMetric'
import { TriggerEngine } from './triggerEngine'
import { createTrailingThrottle } from './uiThrottle'

const MAX_BUFFER_RESTORE = 2000
/** UI 同步節流間隔:25Hz 封包流降為 ~12.5Hz 重繪;判定引擎與 DB 緩衝仍吃全速 */
const UI_SYNC_MS = 80
/**
 * 手動靜音警報的持續時間(ms)。
 * 靜音是暫時的而非永久:蜂鳴器綁在患者腿上,使用者必須能立刻讓它安靜;
 * 但超限本身是安全訊號,不該被一鍵永久關掉。時間到之後若仍超限會自動重新鳴響。
 */
export const ALARM_SILENCE_MS = 30_000

class SessionController {
  private engine: TriggerEngine
  private buffer: SensorReading[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private clockTimer: ReturnType<typeof setInterval> | null = null
  private startTimestamp = 0

  // 指令去重快取(避免每筆封包重複下發相同 BLE 指令)
  private lastLed: 'on' | 'off' | null = null
  private lastAlarm: 'on' | 'off' | null = null

  /** 引擎目前認定的超限狀態(僅是「想不想響」,實際輸出由 applyAlarmOutput 決定) */
  private wantAlarm = false
  /** 手動靜音的到期時間戳;0 = 未靜音 */
  private alarmSilencedUntil = 0

  // UI 同步節流:angles + holdProgress 合併為單一 set(一次重繪)
  private uiSync = createTrailingThrottle<{ angles: LiveAngles; hold: number | null }>(
    UI_SYNC_MS,
    ({ angles, hold }) => useStore.getState().syncLiveFrame(angles, hold)
  )
  /** 引擎最近一次回報的保持進度;由節流同步帶入 store,邊界事件(0/100)直寫 */
  private pendingHold: number | null = null

  constructor() {
    this.engine = new TriggerEngine({
      onZoneEnter: () => {
        useStore.getState().patchSession({ inZone: true })
        this.sendLed('on')
      },
      onZoneExit: () => {
        useStore.getState().patchSession({ inZone: false })
        this.sendLed('off')
      },
      onHoldProgress: (percent) => {
        this.pendingHold = percent
      },
      onRepCompleted: () => {
        // 完成瞬間為邊界事件:直寫精確值,並丟棄節流中的舊進度防止蓋回
        this.uiSync.cancel()
        this.pendingHold = null
        // 僅在 Session 進行中才累計次數與觸發達標音;
        // 連線但未開始時只保留區間 LED 回饋,避免「還沒開始就有 Reps」
        const { session } = useStore.getState()
        if (!session.running) {
          useStore.getState().patchSession({ holdProgress: 0, inZone: false })
          return
        }
        useStore.getState().patchSession({ reps: session.reps + 1, holdProgress: 100, inZone: false })
        void bluetoothService.send(BleCommand.GOAL)
      },
      onRestCompleted: () => {
        this.uiSync.cancel()
        this.pendingHold = null
        useStore.getState().patchSession({ holdProgress: 0 })
      },
      onOverExtension: (active) => {
        // 引擎只回報「是否超限」;要不要真的鳴響由 applyAlarmOutput 每筆封包重算,
        // 因為它還取決於 Session 是否進行中、以及使用者有沒有按靜音。
        this.wantAlarm = active
        // 回到安全範圍即解除靜音,下一次真正的超限才能立刻鳴響
        if (!active) this.alarmSilencedUntil = 0
        if (active) useStore.getState().log('⚠ Over-extension detected.')
      }
    })

    // 接收藍牙即時角度
    bluetoothService.onAnglesReceived = (angles) => this.onAngles(angles)

    // 連線確定失守(手動斷線/重連耗盡)→ 安全收尾 Session,保住已緩衝資料
    bluetoothService.onConnectionLost = () => void this.handleConnectionLost()

    useStore.subscribe((state, prev) => {
      // 斷線時重置指令去重快取:ESP32 斷線後 GPIO 狀態未知(可能重開機),
      // 若不重置,重連後的第一次 LED_ON/ALARM_ON 會被去重吃掉而永不下發
      if (prev.isConnected && !state.isConnected) {
        this.lastLed = null
        this.lastAlarm = null
      }
      // 重連成功:引擎的 alarmActive/holding 狀態是斷線前的舊觀點,而斷線期間
      // 患者可能已經移動。不重置的話,「重連時仍超限」不會產生狀態轉換,
      // ALARM_ON 就永遠不會重送——恰好在警報唯一有保護價值的那個窗口失效。
      if (!prev.isConnected && state.isConnected) {
        this.resetFeedbackState()
      }
      // 進入硬體錯誤(ERR:)當下,主動關閉硬體回饋,防止蜂鳴器/LED 卡在作動狀態
      if (!prev.hardwareError && state.hardwareError) {
        this.handleHardwareError()
      }
    })
  }

  /** 引擎 phase → store(去重,避免每筆封包都觸發 set) */
  private syncPhase(): void {
    const phase = this.engine.phase
    if (useStore.getState().session.phase !== phase) {
      useStore.getState().patchSession({ phase })
    }
  }

  /**
   * 統一的判定/回饋狀態重置。
   *
   * 過去引擎狀態與 store 狀態分別由數條各自不完整的路徑重置,結果是每條路徑
   * 都漏掉一點東西(handleHardwareError 清了 holdProgress 卻沒清 inZone;
   * 斷線訂閱器清了去重快取卻沒清引擎的 alarmActive)。所有重置點一律走這裡。
   */
  private resetFeedbackState(): void {
    this.engine.reset() // 會在需要時發出 onOverExtension(false) → wantAlarm = false
    this.syncPhase()
    this.uiSync.cancel()
    this.pendingHold = null
    this.wantAlarm = false
    this.alarmSilencedUntil = 0
    useStore.getState().patchSession({ holdProgress: 0, inZone: false, alarmActive: false })
  }

  /**
   * 每筆封包重算實際的警報輸出。
   * 三個條件同時成立才鳴響:引擎認定超限、Session 進行中、未被手動靜音。
   * 逐封包重算(而非只在引擎狀態轉換時動作)讓靜音到期能自動恢復鳴響。
   */
  private applyAlarmOutput(): void {
    const { session } = useStore.getState()
    const silenced = Date.now() < this.alarmSilencedUntil
    // 未開始 Session 時不鳴響:連線後只是坐上椅子(膝約 90–120°)就會超過
    // 預設動作的 overLimit,患者腿上會憑空長鳴且沒有 Session 可以結束
    const active = this.wantAlarm && session.running && !silenced
    if (session.alarmActive !== active) {
      useStore.getState().patchSession({ alarmActive: active })
    }
    this.sendAlarm(active ? 'on' : 'off')
  }

  /**
   * 手動靜音警報(供 UI 呼叫)。蜂鳴器綁在患者腿上,必須有軟體開關;
   * 但只靜音 ALARM_SILENCE_MS,時間到仍超限會自動重新鳴響。
   */
  silenceAlarm(): void {
    this.alarmSilencedUntil = Date.now() + ALARM_SILENCE_MS
    this.applyAlarmOutput()
    useStore.getState().log(`Alarm silenced for ${ALARM_SILENCE_MS / 1000}s.`)
  }

  /** ERR 當下:重置判定引擎並強制下發關閉指令(繞過去重,硬體實際狀態未知) */
  private handleHardwareError(): void {
    this.resetFeedbackState()
    this.lastLed = 'off'
    this.lastAlarm = 'off'
    void bluetoothService.send(BleCommand.LED_OFF)
    void bluetoothService.send(BleCommand.ALARM_OFF)
    useStore.getState().log('Hardware error — feedback outputs forced OFF.')
  }

  /** 斷線收尾:若 Session 進行中,自動結束並 flush 緩衝,資料不遺失 */
  private async handleConnectionLost(): Promise<void> {
    const { session } = useStore.getState()
    if (!session.running) return
    useStore.getState().log('Connection lost — auto-ending session to preserve buffered data.')
    await this.endSession()
  }

  /** 由 bluetoothService 推入的每筆即時角度 */
  private onAngles(angles: LiveAngles): void {
    const { session } = useStore.getState()

    // 達標/超限判定(即使未開始 Session 也判定,以便連線時即提供回饋)
    const cfg = this.currentConfig()
    this.engine.handle({
      sample: computeMetricSample(angles, cfg.triggerType, cfg.tolerance),
      zone: computeMetricZone(cfg),
      holdTimeMs: cfg.holdTimeMs
    })
    this.syncPhase()
    this.applyAlarmOutput()

    // 顯示更新走節流(最後一筆保證送達);判定與緩衝已在上方吃到全速資料
    this.uiSync.queue({ angles, hold: this.pendingHold })

    // 僅在 Session 進行中緩衝資料
    if (session.running && session.id != null) {
      this.buffer.push({
        kneeAngle: angles.knee,
        thighAngle: angles.thigh,
        shinAngle: angles.shin,
        kneeRoll: angles.kneeRoll,
        thighRoll: angles.thighRoll,
        shinRoll: angles.shinRoll,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * 判定引擎的設定來源。
   * 在此鉗制而非只在 UI 鉗制:這是所有判定參數進入引擎的唯一咽喉點,
   * 不論參數是使用者手打、從動作載入、還是舊版 persist 還原的,
   * 引擎都不可能看到會讓 zone 退化的值(負容錯、holdTimeMs=0)。
   */
  private currentConfig(): TriggerConfig {
    const state = useStore.getState()
    const action = state.customActions.find((a) => a.id === state.selectedActionId)
    const triggerType: TriggerType = action?.triggerType ?? 'joint_angle'
    return { ...clampTriggerParams(state.params), triggerType }
  }

  async startSession(): Promise<void> {
    const state = useStore.getState()
    const action = state.customActions.find((a) => a.id === state.selectedActionId)
    // 寫進 DB 的必須是引擎實際採用的值(已鉗制),否則歷史紀錄的 target/tolerance
    // 會與當時的判定行為對不上,事後無法解讀
    const params = clampTriggerParams(state.params)
    if (
      params.targetAngle !== state.params.targetAngle ||
      params.tolerance !== state.params.tolerance ||
      params.holdTimeMs !== state.params.holdTimeMs
    ) {
      useStore.getState().setParams(params)
      useStore.getState().log('Trigger parameters clamped to valid range.')
    }

    try {
      const { sessionId } = await window.irms.sessions.start({
        targetAngle: params.targetAngle,
        tolerance: params.tolerance,
        holdTimeMs: params.holdTimeMs,
        actionId: action?.id ?? null,
        actionName: action?.name ?? null,
        protocol: state.settings.protocol
      })

      this.buffer = []
      this.resetFeedbackState()
      this.startTimestamp = Date.now()

      useStore.getState().patchSession({
        id: sessionId,
        reps: 0,
        holdProgress: 0,
        inZone: false,
        alarmActive: false,
        elapsedSec: 0,
        running: true,
        phase: 'idle'
      })

      this.startTimers()
      useStore.getState().log(`Started session #${sessionId} (${action?.name ?? 'custom'}).`)
    } catch (err) {
      useStore.getState().log(`Failed to start session: ${(err as Error).message}`)
      throw err
    }
  }

  async endSession(): Promise<void> {
    const { session } = useStore.getState()
    if (session.id == null) return

    this.stopTimers()
    await this.flush()

    try {
      await window.irms.sessions.end(session.id, session.reps)
      useStore.getState().log(`Ended session #${session.id}. Reps: ${session.reps}.`)
    } catch (err) {
      useStore.getState().log(`Failed to end session: ${(err as Error).message}`)
    }

    // 收尾:關閉硬體回饋;丟棄節流中的殘留進度,防止蓋回已歸零的 session
    this.sendLed('off')
    this.sendAlarm('off')
    this.resetFeedbackState()
    useStore.getState().resetSession()
  }

  private startTimers(): void {
    const flushMs = Math.max(1, useStore.getState().settings.flushIntervalSec) * 1000
    this.flushTimer = setInterval(() => void this.flush(), flushMs)
    this.clockTimer = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - this.startTimestamp) / 1000)
      useStore.getState().patchSession({ elapsedSec })
    }, 1000)
  }

  private stopTimers(): void {
    if (this.flushTimer) clearInterval(this.flushTimer)
    if (this.clockTimer) clearInterval(this.clockTimer)
    this.flushTimer = null
    this.clockTimer = null
  }

  /** 批次寫入緩衝資料;失敗則回補緩衝(上限 2000 筆防止無限堆積) */
  private async flush(): Promise<void> {
    const { session } = useStore.getState()
    if (session.id == null || this.buffer.length === 0) return

    const readings = this.buffer
    this.buffer = []
    try {
      await window.irms.data.appendBatch(session.id, readings)
    } catch (err) {
      const combined = readings.concat(this.buffer)
      this.buffer = combined.slice(-MAX_BUFFER_RESTORE)
      useStore.getState().log(`Batch write failed, buffer restored: ${(err as Error).message}`)
    }
  }

  private sendLed(next: 'on' | 'off'): void {
    if (this.lastLed === next) return
    this.lastLed = next
    void bluetoothService.send(next === 'on' ? BleCommand.LED_ON : BleCommand.LED_OFF)
  }

  private sendAlarm(next: 'on' | 'off'): void {
    if (this.lastAlarm === next) return
    this.lastAlarm = next
    void bluetoothService.send(next === 'on' ? BleCommand.ALARM_ON : BleCommand.ALARM_OFF)
  }
}

export const sessionController = new SessionController()
