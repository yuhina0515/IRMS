// renderer/services/sessionController.ts
// --- Session 生命週期協調器 ---
// 串接:即時角度 → 達標判定(TriggerEngine)→ 硬體回饋(BLE 指令)+ 資料緩衝寫入(IPC)。
// 取代舊版散落在 SessionControl 元件中的計時器/緩衝/指令去重邏輯。

import type { LiveAngles } from '@shared/protocol'
import { BleCommand } from '@shared/protocol'
import type { SensorReading, TriggerType } from '@shared/types'
import { useStore } from '../store/useStore'
import { bluetoothService } from './bluetooth'
import { TriggerEngine, type TriggerConfig } from './triggerEngine'

const MAX_BUFFER_RESTORE = 2000

class SessionController {
  private engine: TriggerEngine
  private buffer: SensorReading[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private clockTimer: ReturnType<typeof setInterval> | null = null
  private startTimestamp = 0

  // 指令去重快取(避免每筆封包重複下發相同 BLE 指令)
  private lastLed: 'on' | 'off' | null = null
  private lastAlarm: 'on' | 'off' | null = null

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
      onHoldProgress: (percent) => useStore.getState().patchSession({ holdProgress: percent }),
      onRepCompleted: () => {
        const reps = useStore.getState().session.reps + 1
        useStore.getState().patchSession({ reps, holdProgress: 100, inZone: false })
        void bluetoothService.send(BleCommand.GOAL)
      },
      onRestCompleted: () => useStore.getState().patchSession({ holdProgress: 0 }),
      onOverExtension: (active) => {
        useStore.getState().patchSession({ alarmActive: active })
        this.sendAlarm(active ? 'on' : 'off')
        if (active) useStore.getState().log('⚠ Over-extension detected — alarm engaged.')
      }
    })

    // 接收藍牙即時角度
    bluetoothService.onAnglesReceived = (angles) => this.onAngles(angles)
  }

  /** 由 bluetoothService 推入的每筆即時角度 */
  private onAngles(angles: LiveAngles): void {
    const { session } = useStore.getState()

    // 達標/超限判定(即使未開始 Session 也判定,以便連線時即提供回饋)
    this.engine.handle(angles, this.currentConfig())

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

  private currentConfig(): TriggerConfig {
    const state = useStore.getState()
    const action = state.customActions.find((a) => a.id === state.selectedActionId)
    const triggerType: TriggerType = action?.triggerType ?? 'joint_angle'
    return { ...state.params, triggerType }
  }

  async startSession(): Promise<void> {
    const state = useStore.getState()
    const action = state.customActions.find((a) => a.id === state.selectedActionId)

    try {
      const { sessionId } = await window.irms.sessions.start({
        targetAngle: state.params.targetAngle,
        tolerance: state.params.tolerance,
        holdTimeMs: state.params.holdTimeMs,
        actionId: action?.id ?? null,
        actionName: action?.name ?? null,
        protocol: state.settings.protocol
      })

      this.buffer = []
      this.engine.reset()
      this.startTimestamp = Date.now()

      useStore.getState().patchSession({
        id: sessionId,
        reps: 0,
        holdProgress: 0,
        inZone: false,
        alarmActive: false,
        elapsedSec: 0,
        running: true
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

    // 收尾:關閉硬體回饋
    this.sendLed('off')
    this.sendAlarm('off')
    this.engine.reset()
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
