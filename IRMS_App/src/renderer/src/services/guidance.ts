// --- 教練提示 (guidance) 純函式 ---
// 由主指標樣本 + 區間 + 引擎 phase 推導「使用者現在該做什麼」。
// UI 每幀計算(輸入皆來自 store 既有更新),引擎不需為此增加事件。
import type { MetricInfo, MetricSample, MetricZone } from './movementMetric'
import type { EnginePhase } from './triggerEngine'

export type Guidance =
  | { kind: 'noData' }
  | { kind: 'overLimit'; excessDeg: number }
  | { kind: 'straightenKnee'; excessDeg: number }
  | { kind: 'raise'; deltaDeg: number }
  | { kind: 'lower'; deltaDeg: number }
  | { kind: 'hold'; heldSec: number; totalSec: number }
  | { kind: 'returnToRest'; deltaDeg: number }

export function computeGuidance(
  sample: MetricSample | null,
  zone: MetricZone,
  phase: EnginePhase,
  holdProgress: number,
  holdTimeMs: number
): Guidance {
  if (!sample) return { kind: 'noData' }

  // 安全優先:超限時無論 phase 一律先要求回落
  if (sample.value > zone.overLimit) {
    return { kind: 'overLimit', excessDeg: sample.value - zone.overLimit }
  }

  if (phase === 'restPending') {
    return { kind: 'returnToRest', deltaDeg: Math.max(0, sample.value - zone.rest) }
  }

  if (phase === 'holding') {
    const totalSec = holdTimeMs / 1000
    return { kind: 'hold', heldSec: (holdProgress / 100) * totalSec, totalSec }
  }

  // idle:先滿足前置條件(segment 類膝直),再引導主指標往目標帶
  if (!sample.kneeStraightOk && sample.kneeMax != null) {
    return { kind: 'straightenKnee', excessDeg: sample.knee - sample.kneeMax }
  }
  if (sample.value < zone.min) {
    return { kind: 'raise', deltaDeg: zone.min - sample.value }
  }
  // joint_angle 過頭但未超限(value > max;segment 類 max=Infinity 不會走到這裡)
  return { kind: 'lower', deltaDeg: sample.value - zone.max }
}

const fmt = (n: number): string => (Math.round(n * 10) / 10).toFixed(1)

/** 中文提示字串(依 metric 語意選動詞) */
export function guidanceText(g: Guidance, info: MetricInfo): string {
  const verb = info.key === 'kneeAngle' ? '彎曲' : info.key === 'thighExtension' ? '後伸' : '抬高'
  switch (g.kind) {
    case 'noData':
      return '等待感測資料…'
    case 'overLimit':
      return `⚠ 超限 ${fmt(g.excessDeg)}°,請立即回落`
    case 'straightenKnee':
      return `膝蓋再打直 ${fmt(g.excessDeg)}°`
    case 'raise':
      return `再${verb} ${fmt(g.deltaDeg)}°`
    case 'lower':
      return `回降 ${fmt(g.deltaDeg)}° 進入目標區`
    case 'hold':
      return `保持!${g.heldSec.toFixed(1)}s / ${g.totalSec.toFixed(1)}s`
    case 'returnToRest':
      return g.deltaDeg > 0 ? `完成!回到起始位(再回 ${fmt(g.deltaDeg)}°)` : '完成!已回起始位'
  }
}
