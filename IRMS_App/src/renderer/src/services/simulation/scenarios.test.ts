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
import { REFERENCE_ACTION, SCENARIOS, scenarioById, type ScenarioFrame } from './scenarios'
import { computeMetricZone } from '../movementMetric'

const COMM_PERIOD_MS = 40

const DEFAULT_CAL = {
  thighAxisSwap: false,
  shinAxisSwap: false,
  thighInvert: false,
  thighZeroRaw: 0,
  shinInvert: false,
  shinZeroRaw: 0,
  thighRollInvert: false,
  thighRollZeroRaw: 0,
  shinRollInvert: false,
  shinRollZeroRaw: 0,
  thighRollVerified: false,
  shinRollVerified: false,
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

describe('情境共通性質', () => {
  it('參考動作導出的區間就是情境角度所依據的那組', () => {
    expect(zone).toEqual({ min: 80, max: 100, overLimit: 120, rest: 30 })
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

  it('不越過超限門檻(正常療程不該觸發安全警報)', () => {
    const knees = frames.map(kneeOf).filter((k): k is number => k != null)
    expect(knees.every((k) => k <= zone.overLimit)).toBe(true)
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

  it('確實越過超限門檻', () => {
    const knees = frames.map(kneeOf).filter((k): k is number => k != null)
    expect(knees.some((k) => k > zone.overLimit)).toBe(true)
  })

  it('超限狀態維持超過 30 秒的靜音期(否則測不到自動重新武裝)', () => {
    const over = frames.filter((f) => {
      const k = kneeOf(f)
      return k != null && k > zone.overLimit
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
