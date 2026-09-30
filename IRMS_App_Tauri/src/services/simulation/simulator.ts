// renderer/services/simulation/simulator.ts
// --- 模擬裝置的播放器(pump)---
//
// 這是整個 simulation/ 目錄裡**唯一**會碰到 bluetoothService 單例、唯一有副作用、
// 唯一用到計時器的檔案。encode / kinematics / scenarios 全部保持純函式,
// 所以 vitest 可以直接消費它們而不必啟動這個 pump——兩個消費端共用同一份情境定義,
// 而不是「測試一套、demo 一套」各自漂移。
//
// 封包一律走 bluetoothService.ingest(),與真實 BLE 通知完全同一條路。

import { bluetoothService } from '../bluetooth'
import { useStore } from '../../store/useStore'
import { useUiStore } from '../../store/useUiStore'
import { currentTriggerConfig } from '../triggerConfig'
import { scenarioById, type Scenario, type ScenarioConfig } from './scenarios'

/** 對齊韌體 config.h 的 COMM_PERIOD_MS = 40(25Hz) */
const COMM_PERIOD_MS = 40

class DeviceSimulator {
  private timer: ReturnType<typeof setInterval> | null = null
  private startedAt = 0
  private scenario: Scenario | null = null
  private configKey = ''

  /**
   * 情境的角度與保持時間由當下選取動作的判定參數導出(否則保持時間較長或
   * segment 類的動作永遠無法達標)。參數在播放中被改動時重建情境,t 不歸零。
   */
  private resolve(id: string): Scenario | undefined {
    const cfg: ScenarioConfig = currentTriggerConfig()
    this.configKey = JSON.stringify(cfg)
    return scenarioById(id, cfg)
  }

  get running(): boolean {
    return this.timer != null
  }

  get currentScenarioId(): string | null {
    return this.scenario?.id ?? null
  }

  /** 開始播放指定情境。已在播放中則先停掉,避免兩條資料流疊在一起 */
  start(scenarioId: string): void {
    const scenario = this.resolve(scenarioId)
    if (!scenario) {
      useStore.getState().log(`Unknown simulation scenario: ${scenarioId}`)
      return
    }

    this.stop()
    this.scenario = scenario
    this.startedAt = Date.now()
    bluetoothService.beginSimulated(`IRMS Demo (${scenario.label})`)
    useUiStore.getState().setDemoPlaying(scenario.id)
    useStore.getState().log(`Simulation started: ${scenario.label}`)

    this.timer = setInterval(() => this.tick(), COMM_PERIOD_MS)
  }

  private tick(): void {
    let scenario = this.scenario
    if (!scenario) return
    if (JSON.stringify(currentTriggerConfig()) !== this.configKey) {
      scenario = this.resolve(scenario.id) ?? scenario
      this.scenario = scenario
    }

    const elapsed = Date.now() - this.startedAt

    // 以斷線收尾的情境(dropout)播完就真的讓鏈路失守,好演練 Session 自動收尾;
    // 其餘情境由 frameAt 自行循環,可以一直播下去給人看
    if (scenario.endsDisconnected && elapsed >= scenario.durationMs) {
      this.stop()
      return
    }

    const frame = scenario.frameAt(elapsed)
    // null = 這一拍鏈路上沒有東西送達。刻意什麼都不做:App 端本來就無從得知
    // 「對方沒送」與「還沒送到」的差別,這正是 dropout 情境要重現的處境。
    if (frame != null) bluetoothService.ingest(frame)
  }

  /** 停止播放並讓模擬鏈路下線(等同手動斷線 → 觸發 Session 安全收尾) */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.scenario = null
    useUiStore.getState().setDemoPlaying(null)
    bluetoothService.endSimulated()
  }
}

export const deviceSimulator = new DeviceSimulator()
