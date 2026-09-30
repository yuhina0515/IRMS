// services/liveShareHost.ts
// 即時分享模組(IRMS-Modules `live-share`)能碰到的 App 能力。模組本身不能 import,
// 所以這裡是它與 App 之間唯一的介面,只透過 ModuleContext.liveShare 交給 id 為
// `live-share` 的模組:
//   - snapshot/subscribe:即時狀態的唯讀快照(已校準角度、判定主指標、區間、reps、參數)
//   - telemetry:遙測是否開啟與本次啟動的 runId(伺服器只允許「正在上傳遙測」的裝置分享)
//   - request:經 Rust 轉送到收集器的 /v1/share API(WebView CSP 只允許 IPC)
//   - applyParams:套用遠端觀看者送來的判定參數;療程進行中一律拒絕
// 快照刻意不含動作名稱與任何使用者輸入的文字:動作名稱可能含患者姓名。
import { invoke } from '@tauri-apps/api/core'
import { clampTriggerParams } from '@shared/validation'
import type { TriggerType } from '@shared/types'
import { useStore, type SessionParams } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { computeMetricSample, computeMetricZone, metricInfo } from './movementMetric'
import { currentTriggerConfig } from './triggerConfig'
import { getTelemetryStatus } from './telemetry'
import { getT } from '../i18n'

export interface LiveSnapshot {
  t: string
  connected: boolean
  demo: boolean
  hardwareError: string | null
  triggerType: TriggerType
  metric: { label: string; value: number | null; unit: string }
  angles: { knee: number; thigh: number; shin: number } | null
  params: SessionParams
  zone: { min: number; max: number | null; rest: number }
  /** 使用者本人的舒適角度/極限範圍(膝角);未量測為 null */
  limits: { comfort: number | null; limit: number | null }
  session: {
    running: boolean
    reps: number
    holdProgress: number
    inZone: boolean
    alarmActive: boolean
    overComfort: boolean
    elapsedSec: number
    phase: string
  }
}

export interface ShareHttpRequest {
  method: 'GET' | 'POST' | 'DELETE'
  path: string
  token?: string
  body?: unknown
  timeoutMs?: number
}

export interface LiveShareApi {
  snapshot(): LiveSnapshot
  /** 狀態變化時回呼(最多每 200ms 一次);回傳解除訂閱函式 */
  subscribe(listener: (s: LiveSnapshot) => void): () => void
  telemetry(): Promise<{ enabled: boolean; runId: string; endpoint: string }>
  request(req: ShareHttpRequest): Promise<{ status: number; body: unknown }>
  applyParams(params: Partial<SessionParams>): { ok: boolean; error?: string; params?: SessionParams }
}

const round1 = (n: number): number => Math.round(n * 10) / 10

export function buildSnapshot(): LiveSnapshot {
  const s = useStore.getState()
  const cfg = currentTriggerConfig()
  const zone = computeMetricZone(cfg)
  const info = metricInfo(cfg.triggerType)
  const value = s.angles ? computeMetricSample(s.angles, cfg.triggerType, cfg.tolerance).value : null
  return {
    t: new Date().toISOString(),
    connected: s.isConnected,
    demo: useUiStore.getState().demoMode,
    hardwareError: s.hardwareError,
    triggerType: cfg.triggerType,
    metric: { label: info.label, value: value == null ? null : round1(value), unit: info.unit },
    angles: s.angles ? { knee: round1(s.angles.knee), thigh: round1(s.angles.thigh), shin: round1(s.angles.shin) } : null,
    params: { targetAngle: cfg.targetAngle, tolerance: cfg.tolerance, holdTimeMs: cfg.holdTimeMs },
    zone: { min: zone.min, max: Number.isFinite(zone.max) ? zone.max : null, rest: zone.rest },
    limits: { comfort: cfg.limits?.comfort ?? null, limit: cfg.limits?.limit ?? null },
    session: {
      running: s.session.running,
      reps: s.session.reps,
      holdProgress: Math.round(s.session.holdProgress),
      inZone: s.session.inZone,
      alarmActive: s.session.alarmActive,
      overComfort: s.session.overComfort,
      elapsedSec: s.session.elapsedSec,
      phase: s.session.phase
    }
  }
}

const SUBSCRIBE_INTERVAL_MS = 200

function subscribe(listener: (s: LiveSnapshot) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const fire = (): void => {
    timer = null
    try {
      listener(buildSnapshot())
    } catch {
      // 模組的回呼出錯不能影響 App 的狀態更新
    }
  }
  const schedule = (): void => {
    if (timer == null) timer = setTimeout(fire, SUBSCRIBE_INTERVAL_MS)
  }
  const unsubStore = useStore.subscribe(schedule)
  const unsubUi = useUiStore.subscribe(schedule)
  schedule()
  return () => {
    unsubStore()
    unsubUi()
    if (timer != null) clearTimeout(timer)
  }
}

export function applyRemoteParams(patch: Partial<SessionParams>): { ok: boolean; error?: string; params?: SessionParams } {
  const s = useStore.getState()
  if (s.session.running) return { ok: false, error: getT().liveShare.sessionRunning }
  const merged: SessionParams = { ...s.params }
  for (const key of ['targetAngle', 'tolerance', 'holdTimeMs'] as const) {
    const v = patch[key]
    if (v === undefined) continue
    if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, error: getT().liveShare.notANumber({ key }) }
    merged[key] = v
  }
  const params = clampTriggerParams(merged)
  s.setParams(params)
  s.log(`Live share: parameters changed remotely → target ${params.targetAngle}°, tol ${params.tolerance}°, hold ${params.holdTimeMs}ms`)
  return { ok: true, params }
}

export const liveShareApi: LiveShareApi = {
  snapshot: buildSnapshot,
  subscribe,
  async telemetry() {
    const status = await getTelemetryStatus()
    return { enabled: status.enabled, runId: status.runId, endpoint: useStore.getState().settings.telemetryEndpoint }
  },
  request(req) {
    return invoke<{ status: number; body: unknown }>('live_share_request', {
      request: { ...req, endpoint: useStore.getState().settings.telemetryEndpoint }
    })
  },
  applyParams: applyRemoteParams
}
