// shared/validation.ts
// --- 判定參數的界限與鉗制(App 與 DB 共用的單一真實來源)---
//
// 2026-08-01 會議 F6:目標角度/容錯/維持時間三個輸入原本完全沒有驗證
// (裸 `type="number"` + `parseFloat(...) || 0`,DB 也沒有 CHECK),而它們
// 直接決定判定行為:
//
//   - 負的 tolerance → zone.min > zone.max → strictIn 永不為真
//     → rep 計數靜默永不前進,使用者看不到任何錯誤訊息
//   - holdTimeMs = 0 → (elapsed / 0):第一個封包是 0/0 = NaN 流進進度環,
//     之後是 Infinity → 每次進區立即完成一下
//
// 這與 rest 不變式(movementMetric.REST_MARGIN)是同一類缺陷:判定參數的
// 不變式無人強制。此檔負責在輸入端就把值收進合法範圍,DB migration 的
// CHECK 約束則是最後一道防線。

export interface NumericBound {
  min: number
  max: number
  /** 非有限值(NaN/Infinity,例如清空輸入框)時採用的值 */
  fallback: number
}

/**
 * 目標角度下限刻意設為 10 而非更低:
 * `restThreshold` 由 min 減去 REST_MARGIN(5) 導出,目標過低會讓休息門檻逼近或
 * 低於 0,要求患者反向移動才算回位。10° 讓最低的休息門檻仍為正值。
 */
export const TARGET_ANGLE_BOUND: NumericBound = { min: 10, max: 170, fallback: 45 }
/** 容錯必須為正:0 會讓 joint_angle 的達標區間退化成一個點,實務上不可能達成 */
export const TOLERANCE_BOUND: NumericBound = { min: 1, max: 30, fallback: 10 }
/** 維持時間下限 500ms:低於此值等同「碰到就算」,且 0 會造成 NaN/Infinity */
export const HOLD_TIME_BOUND: NumericBound = { min: 500, max: 20_000, fallback: 2000 }

/** 把任意輸入鉗制進界限;非有限值回退到 fallback 而非 0 */
export function clampToBound(value: number, bound: NumericBound): number {
  if (!Number.isFinite(value)) return bound.fallback
  return Math.min(bound.max, Math.max(bound.min, value))
}

export const clampTargetAngle = (v: number): number => clampToBound(v, TARGET_ANGLE_BOUND)
export const clampTolerance = (v: number): number => clampToBound(v, TOLERANCE_BOUND)
export const clampHoldTimeMs = (v: number): number => Math.round(clampToBound(v, HOLD_TIME_BOUND))

export interface TriggerParams {
  targetAngle: number
  tolerance: number
  holdTimeMs: number
}

/** 一次鉗制整組判定參數(動作儲存、Session 參數變更共用) */
export function clampTriggerParams<T extends TriggerParams>(p: T): T {
  return {
    ...p,
    targetAngle: clampTargetAngle(p.targetAngle),
    tolerance: clampTolerance(p.tolerance),
    holdTimeMs: clampHoldTimeMs(p.holdTimeMs)
  }
}
