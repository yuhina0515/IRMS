// --- Dashboard 顯示狀態推導(純函式)---
// 設計語言 v2 §8.1:畫面第一件要回答的是「現在安全嗎、做對了嗎、下一步是什麼」。
// 這裡把原本散在 DashboardView 巢狀三元式裡的判斷收成單一優先序,先命中者勝。
// 只決定「怎麼呈現」,不參與判定——判定仍 100% 在 triggerEngine/sessionController。
import type { EnginePhase } from './triggerEngine'
import type { MetricSample, MetricZone } from './movementMetric'

export type DashboardMode =
  /** 硬體 ERR:感測器 I2C 中斷,數值凍結 */
  | 'hardwareError'
  /** 目前協定的判定尚未支援 */
  | 'unsupported'
  /** 斷線後自動重連中:最後一筆數值已過期 */
  | 'stale'
  /** 未連線 */
  | 'disconnected'
  /** 已連線但未選動作 */
  | 'noAction'
  /** 超限警報鳴響中 */
  | 'alarm'
  /** 仍超限,但警報在手動靜音期間 */
  | 'silenced'
  /** 保持中 */
  | 'holding'
  /** 達標後回位中 */
  | 'returning'
  /** 主指標在目標區內(尚未進入保持) */
  | 'inZone'
  /** 一般量測中 */
  | 'active'

/** 這些狀態下不能量測:以阻斷面板取代量表,不畫一個看起來在運作的量表 */
export const BLOCKING_MODES: ReadonlySet<DashboardMode> = new Set(['hardwareError', 'unsupported', 'disconnected', 'noAction'])

export interface DashboardInputs {
  hardwareError: boolean
  protocolSupported: boolean
  isConnected: boolean
  reconnecting: boolean
  hasAction: boolean
  sessionRunning: boolean
  alarmActive: boolean
  /** 警報手動靜音到期時間(epoch ms);0 = 未靜音 */
  alarmSilencedUntil: number
  now: number
  phase: EnginePhase
  sample: MetricSample | null
  zone: MetricZone
}

export function deriveDashboardMode(i: DashboardInputs): DashboardMode {
  if (i.hardwareError) return 'hardwareError'
  // 未支援的協定排在連線之前:接上裝置也不會讓它變成可用的量測
  if (!i.protocolSupported) return 'unsupported'
  if (!i.isConnected) return i.reconnecting ? 'stale' : 'disconnected'
  if (!i.hasAction) return 'noAction'
  if (i.alarmActive) return 'alarm'
  const over = i.sample != null && i.sample.value > i.zone.overLimit
  if (i.sessionRunning && over && i.now < i.alarmSilencedUntil) return 'silenced'
  if (i.phase === 'holding') return 'holding'
  if (i.phase === 'restPending') return 'returning'
  if (isInZone(i.sample, i.zone)) return 'inZone'
  return 'active'
}

/** 主指標是否在目標帶內(與量表的上色規則共用) */
export function isInZone(sample: MetricSample | null, zone: MetricZone): boolean {
  if (sample == null) return false
  return sample.value >= zone.min && sample.value <= Math.min(zone.max, zone.overLimit)
}

/** 量表/數值的上色類別:目標區外中性、區內 success、超限 danger(§8.2)——不用 accent 表示「做對」 */
export function valueTone(sample: MetricSample | null, zone: MetricZone): 'out' | 'in' | 'over' {
  if (sample == null) return 'out'
  if (sample.value > zone.overLimit) return 'over'
  return isInZone(sample, zone) ? 'in' : 'out'
}
