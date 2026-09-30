// services/triggerConfig.ts
// 判定引擎實際採用的參數:目前選取動作的觸發型別與安全上限 + 鉗制後的目標參數。
// 獨立成檔(不放在 sessionController)是為了讓示範模擬器與即時分享模組也能讀同一份值,
// 而不必載入 sessionController 連帶的藍牙單例。
import type { TriggerType } from '@shared/types'
import { clampTriggerParams } from '@shared/validation'
import { useStore } from '../store/useStore'
import type { AngleLimits, TriggerConfig } from './movementMetric'

export function currentTriggerConfig(): TriggerConfig {
  const state = useStore.getState()
  const action = state.customActions.find((a) => a.id === state.selectedActionId)
  const triggerType: TriggerType = action?.triggerType ?? 'joint_angle'
  return { ...clampTriggerParams(state.params), triggerType, limits: currentLimits() }
}

/** 目前生效的個人舒適角度/極限範圍;未量測為 null(沒有預設值,每個人都不一樣) */
export function currentLimits(): AngleLimits {
  const r = useStore.getState().angleRange
  return { comfort: r?.comfortAngle ?? null, limit: r?.limitAngle ?? null }
}
