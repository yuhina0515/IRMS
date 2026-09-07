// renderer/services/simulation/kinematics.ts
// --- 模擬姿勢來源(純函式)---
//
// 全部是 (t: ms) → RawAngles 的純函式:不讀掛鐘、不用 Math.random,
// 同樣的 t 永遠得到同樣的姿勢。這是 vitest 能在 fake timers 下消費它們的前提,
// 也是「同一個情境跑兩次結果不同」這種除錯地獄的預防。
//
// ⚠ 這裡產生的是**原始**角度(套用校準之前)。以預設校準
// (zeroRaw 全 0、invert 全 false、axisSwap 全 false)而言,applyCalibration
// 是恆等轉換,所以 poseForKnee(K) 會讓判定看到 value = K。校準若非預設,
// 這個對應關係就不成立——那正是校準測試要測的東西,不是這裡的責任。

import type { RawAngles } from '@shared/protocol'

/** 站直休息位:四軸皆 0,膝夾角 0° */
export const REST_POSE: RawAngles = { thigh: 0, shin: 0, thighRoll: 0, shinRoll: 0 }

/**
 * 造出一個「膝夾角 = kneeDeg」的原始姿勢。
 *
 * 大腿固定 0(站直),小腿轉 kneeDeg;因為
 * knee = |shortestArcDelta(shin, thigh)| = |kneeDeg|(|kneeDeg| ≤ 180)。
 * 這個等式由 kinematics.test.ts 實際斷言,不是靠推導。
 */
export function poseForKnee(kneeDeg: number, roll: { thigh?: number; shin?: number } = {}): RawAngles {
  return {
    thigh: 0,
    shin: kneeDeg,
    thighRoll: roll.thigh ?? 0,
    shinRoll: roll.shin ?? 0
  }
}

/** 造出一個「大腿仰角 = thighDeg」的姿勢(segment_elevation / segment_extension 用) */
export function poseForThigh(thighDeg: number, kneeDeg = 0): RawAngles {
  return { thigh: thighDeg, shin: thighDeg + kneeDeg, thighRoll: 0, shinRoll: 0 }
}

export interface SweepOptions {
  /** 一個完整來回的週期 */
  periodMs: number
  /** 掃描下界(度) */
  min: number
  /** 掃描上界(度) */
  max: number
  /** 相位偏移(0–1),讓小腿可以落後大腿 */
  phase?: number
}

/**
 * 鐘擺式來回掃描,回傳 min–max 之間的值。
 * 用 cos 而非 sin,讓 t=0 落在 min(從休息位出發),而不是從區間正中央開始——
 * 從中央出發的情境會讓「進區」事件在第一拍就發生,測不到進區前的那段。
 */
export function sweep(tMs: number, { periodMs, min, max, phase = 0 }: SweepOptions): number {
  const theta = ((tMs / periodMs + phase) % 1) * 2 * Math.PI
  const unit = (1 - Math.cos(theta)) / 2 // 0 → 1 → 0
  return min + (max - min) * unit
}

/**
 * 種子化的可重現雜訊,值域 ±amplitude。
 * 用整數雜湊而非 Math.random:模擬器必須可重播,否則「偶爾才紅」的測試無法除錯。
 */
export function noiseAt(seed: number, amplitude: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b)
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
  x = (x ^ (x >>> 16)) >>> 0
  return (x / 0xffffffff - 0.5) * 2 * amplitude
}
