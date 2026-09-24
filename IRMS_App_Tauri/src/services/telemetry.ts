// services/telemetry.ts
// --- 使用者自選的即時遙測上傳(前端側) ---
// 佇列、批次上傳、重試都在 Rust(src-tauri/src/telemetry.rs);這裡只負責:
// 1. 把 settings 裡的開關/網址同步給 Rust(啟動時一次,之後每次變更)
// 2. 送出只有前端知道的事件:Session 開始/結束(含校準快照)、App 日誌
// 任何失敗都吞掉——遙測壞了不能影響量測本身。

import { invoke } from '@tauri-apps/api/core'
import { logListeners, useStore, type Settings } from '../store/useStore'

export interface TelemetryStatus {
  enabled: boolean
  runId: string
  pending: number
  sent: number
  dropped: number
  lastError: string | null
}

type TelemetryConfig = Pick<Settings, 'telemetryEnabled' | 'telemetryEndpoint'>

let enabled = false

/** 發出一筆前端事件。未啟用時不走 IPC,避免高頻呼叫點的無謂開銷。 */
export function logTelemetry(kind: string, data: unknown = null): void {
  if (!enabled) return
  invoke('telemetry_log', { kind, data }).catch(() => {})
}

export async function configureTelemetry(config: TelemetryConfig): Promise<TelemetryStatus> {
  const status = await invoke<TelemetryStatus>('telemetry_configure', {
    enabled: config.telemetryEnabled,
    endpoint: config.telemetryEndpoint
  })
  enabled = status.enabled
  return status
}

export function getTelemetryStatus(): Promise<TelemetryStatus> {
  return invoke<TelemetryStatus>('telemetry_status')
}

function sameConfig(a: TelemetryConfig, b: TelemetryConfig): boolean {
  return a.telemetryEnabled === b.telemetryEnabled && a.telemetryEndpoint === b.telemetryEndpoint
}

/** 啟動時呼叫一次:套用已存設定,並追蹤之後的變更。 */
export function initTelemetry(): void {
  const apply = (config: TelemetryConfig): void => {
    configureTelemetry(config).catch((err) => {
      enabled = false
      useStore.getState().log(`Telemetry disabled: ${String(err)}`)
    })
  }
  let current: TelemetryConfig = useStore.getState().settings
  apply(current)
  useStore.subscribe((state) => {
    if (sameConfig(state.settings, current)) return
    current = state.settings
    apply(current)
  })
  logListeners.add((message) => logTelemetry('app_log', { message }))
}
