// 情境的自我描述測試。
//
// 每個情境都宣稱自己會演練某件事(「超限」「截斷」「壞封包」)。這個檔案逐一
// 驗證它真的產生得出那種封包——否則情境可能因為一次角度調整就靜靜地不再越過門檻,
// 而消費它的 CMD: 稽核測試會照常全綠,因為「沒有觸發」與「觸發後處理正確」
// 在只看結果的斷言下長得一模一樣。
//
// 這也是 scenarios 的第二個消費端(另一個是 demo 的 pump)。

import { describe, expect, it } from 'vitest'
import { parseAnglePacket } from '@shared/protocol'
import { applyCalibration, type Settings } from '../../store/useStore'
import { REFERENCE_ACTION, SCENARIOS, scenarioById, type ScenarioConfig, type ScenarioFrame } from './scenarios'
import { computeMetricSample, computeMetricZone } from '../movementMetric'
import { TriggerEngine } from '../triggerEngine'

const COMM_PERIOD_MS = 40

const DEFAULT_CAL = {
  proximalAxisRotationDeg: 0,
  distalAxisRotationDeg: 0,
  proximalAxisRotationVerified: false,
  distalAxisRotationVerified: false,
  proximalInvert: false,
  proximalZeroRaw: 0,
  distalInvert: false,
  distalZeroRaw: 0,
  proximalRollInvert: false,
  proximalRollZeroRaw: 0,
  distalRollInvert: false,
  distalRollZeroRaw: 0,
  proximalRollVerified: false,
  distalRollVerified: false,
  lastCalibratedAt: null
} as Settings

/** 以 25Hz 播完整個情境,收集每一拍的產出 */
function playAll(id: string): ScenarioFrame[] {
  const s = scenarioById(id)
  if (!s) throw new Error(`no scenario ${id}`)
  const frames: ScenarioFrame[] = []
  for (let t = 0; t < s.durationMs; t += COMM_PERIOD_MS) frames.push(s.frameAt(t))
  return frames
}

/** 該拍若是合法角度封包,回傳判定會看到的膝夾角 */
function kneeOf(frame: ScenarioFrame): number | null {
  if (frame == null) return null
  const parsed = parseAnglePacket(frame)
  if (parsed.kind !== 'angles') return null
  return applyCalibration(parsed.raw, DEFAULT_CAL).knee
}

const zone = computeMetricZone(REFERENCE_ACTION)
/** 參考動作搭配的個人極限範圍(測試用;真實使用者沒有預設值) */
const LIMIT = REFERENCE_ACTION.limits.limit!

describe('情境共通性質', () => {
  it('參考動作導出的區間就是情境角度所依據的那組', () => {
    expect(zone).toEqual({ min: 80, max: 100, rest: 30 })
  })

  it.each(SCENARIOS.map((s) => s.id))('%s 有非零長度且至少產生一個封包', (id) => {
    const frames = playAll(id)
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.some((f) => f != null)).toBe(true)
  })
})

describe('rep-cycle', () => {
  const frames = playAll('rep-cycle')

  it('全部是合法角度封包(沒有混入壞封包)', () => {
    expect(frames.every((f) => f != null && parseAnglePacket(f).kind === 'angles')).toBe(true)
  })

  it('確實進入達標區間,也確實回到休息位以下', () => {
    const knees = frames.map(kneeOf).filter((k): k is number => k != null)
    expect(knees.some((k) => k >= zone.min && k <= zone.max)).toBe(true)
    expect(knees.some((k) => k <= zone.rest)).toBe(true)
  })

  it('不越過個人極限範圍(正常療程不該觸發警示)', () => {
    const knees = frames.map(kneeOf).filter((k): k is number => k != null)
    expect(knees.every((k) => k <= LIMIT)).toBe(true)
  })

  it('在區間內停留的時間超過 holdTimeMs(否則永遠計不出一下)', () => {
    const inZone = frames.filter((f) => {
      const k = kneeOf(f)
      return k != null && k >= zone.min && k <= zone.max
    })
    expect(inZone.length * COMM_PERIOD_MS).toBeGreaterThan(REFERENCE_ACTION.holdTimeMs)
  })
})

describe('over-limit', () => {
  const frames = playAll('over-limit')

  it('確實越過個人極限範圍', () => {
    const knees = frames.map(kneeOf).filter((k): k is number => k != null)
    expect(knees.some((k) => k > LIMIT)).toBe(true)
  })

  it('超出極限範圍的狀態維持超過 30 秒的靜音期(否則測不到自動重新武裝)', () => {
    const over = frames.filter((f) => {
      const k = kneeOf(f)
      return k != null && k > LIMIT
    })
    expect(over.length * COMM_PERIOD_MS).toBeGreaterThan(30_000)
  })
})

describe('hardware-error', () => {
  const frames = playAll('hardware-error')

  it('產生 ERR 封包,且前後都有正常封包(證明可復原而非直接卡死)', () => {
    const kinds = frames.map((f) => (f == null ? 'none' : parseAnglePacket(f).kind))
    const firstErr = kinds.indexOf('error')
    const lastErr = kinds.lastIndexOf('error')
    expect(firstErr).toBeGreaterThan(0)
    expect(kinds.slice(0, firstErr).every((k) => k === 'angles')).toBe(true)
    expect(kinds.slice(lastErr + 1).some((k) => k === 'angles')).toBe(true)
  })
})

describe('truncated-link', () => {
  const frames = playAll('truncated-link')

  it('每一個封包都被判定為截斷、且 Roll 不可用', () => {
    for (const f of frames) {
      const parsed = parseAnglePacket(f as string)
      expect(parsed.kind).toBe('angles')
      if (parsed.kind !== 'angles') continue
      expect(parsed.truncated).toBe(true)
      expect(parsed.hasRoll).toBe(false)
    }
  })

  it('Pitch 仍然存活,療程照常可以完成——這正是「不整包丟棄」的理由', () => {
    const knees = frames.map(kneeOf).filter((k): k is number => k != null)
    expect(knees.some((k) => k >= zone.min && k <= zone.max)).toBe(true)
  })
})

describe('garbage', () => {
  const frames = playAll('garbage')

  it('混入 malformed 封包,但多數仍是合法角度', () => {
    const kinds = frames.map((f) => (f == null ? 'none' : parseAnglePacket(f).kind))
    const malformed = kinds.filter((k) => k === 'malformed').length
    expect(malformed).toBeGreaterThan(0)
    expect(kinds.filter((k) => k === 'angles').length).toBeGreaterThan(malformed * 2)
  })
})

describe('dropout', () => {
  const s = scenarioById('dropout')!
  const frames = playAll('dropout')

  it('封包在中途停止,且情境標記為以斷線收尾', () => {
    expect(frames.some((f) => f != null)).toBe(true)
    expect(frames.at(-1)).toBeNull()
    expect(s.endsDisconnected).toBe(true)
  })
})

// 2026-09-27:情境原本寫死 90°/保持 2.5 秒,只有參考動作能達標;預設的 Squat(保持 3 秒)
// 與所有 segment 類動作在示範模式裡永遠停在 0 下。情境改由動作參數導出後,
// 這裡把封包實際餵進判定引擎,確認每種動作都真的數得到三下、超限情境真的會觸發警報。
describe('情境隨動作參數導出', () => {
  const configs = [
    { name: '參考動作', cfg: REFERENCE_ACTION },
    { name: '保持 5 秒的膝屈曲', cfg: { ...REFERENCE_ACTION, targetAngle: 60, tolerance: 8, holdTimeMs: 5000, limits: { comfort: 75, limit: 95 } } },
    { name: '直膝抬腿', cfg: { targetAngle: 45, tolerance: 10, holdTimeMs: 3000, triggerType: 'segment_elevation' as const, limits: { comfort: 100, limit: 130 } } },
    { name: '直膝後擺(低目標)', cfg: { targetAngle: 20, tolerance: 5, holdTimeMs: 2000, triggerType: 'segment_extension' as const, limits: { comfort: 90, limit: null } } },
    { name: '低角度膝屈曲', cfg: { targetAngle: 15, tolerance: 5, holdTimeMs: 1000, triggerType: 'joint_angle' as const, limits: { comfort: 25, limit: 40 } } }
  ]

  function drive(id: string, cfg: ScenarioConfig): { reps: number; alarms: number } {
    const s = scenarioById(id, cfg)!
    const zone = computeMetricZone(cfg)
    let now = 0
    let reps = 0
    let alarms = 0
    const engine = new TriggerEngine(
      {
        onZoneEnter: () => {},
        onZoneExit: () => {},
        onHoldProgress: () => {},
        onRepCompleted: () => reps++,
        onRestCompleted: () => {},
        onOverExtension: (on) => {
          if (on) alarms++
        }
      },
      () => now
    )
    for (let t = 0; t < s.durationMs; t += COMM_PERIOD_MS) {
      now = t
      const frame = s.frameAt(t)
      if (frame == null) continue
      const parsed = parseAnglePacket(frame)
      if (parsed.kind !== 'angles') continue
      const sample = computeMetricSample(applyCalibration(parsed.raw, DEFAULT_CAL), cfg.triggerType, cfg.tolerance)
      engine.handle({ sample, zone, holdTimeMs: cfg.holdTimeMs, limits: cfg.limits })
    }
    return { reps, alarms }
  }

  it.each(configs)('$name:rep-cycle 數到三下且不觸發警報', ({ cfg }) => {
    expect(drive('rep-cycle', cfg)).toEqual({ reps: 3, alarms: 0 })
  })

  it.each(configs)('$name:over-limit 情境使個人範圍的警示觸發', ({ cfg }) => {
    // 只設舒適角度的人沒有極限警示;情境仍要越過舒適角度
    if (cfg.limits.limit != null) expect(drive('over-limit', cfg).alarms).toBeGreaterThan(0)
    const s = scenarioById('over-limit', cfg)!
    const peak = Math.max(...Array.from({ length: 200 }, (_, i) => kneeOf(s.frameAt(i * 40)) ?? 0))
    expect(peak).toBeGreaterThan(cfg.limits.comfort!)
  })

  it('沒有量測個人範圍時,極限範圍情境不產生任何警示', () => {
    expect(drive('over-limit', { ...REFERENCE_ACTION, limits: { comfort: null, limit: null } }).alarms).toBe(0)
  })
})
