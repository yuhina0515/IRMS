import { describe, expect, it } from 'vitest'
import { analyzeSession, MAX_SAMPLE_GAP_MS, type MetricPoint } from './sessionAnalysis'

const zone = { min: 80, max: 100, overLimit: 135, rest: 40 }
/** 25Hz 連續取樣 */
const series = (values: (number | null)[], start = 0): MetricPoint[] =>
  values.map((v, i) => ({ t: start + i * 40, v }))

describe('analyzeSession', () => {
  it('以時間加權計算目標區比例、平均與峰值', () => {
    // 前 10 筆 0°、後 10 筆 90°:一半時間在區內(最後一筆不計時間)
    const a = analyzeSession(series([...Array(10).fill(0), ...Array(11).fill(90)]), zone)
    expect(a.activeSec).toBeCloseTo(0.8)
    expect(a.inZoneRatio).toBeCloseTo(0.5)
    expect(a.mean).toBeCloseTo(45)
    expect(a.peak).toBe(90)
    expect(a.overLimitEvents).toBe(0)
  })

  it('每次從未超限進入超限算一次,持續超限不重複計', () => {
    const a = analyzeSession(series([90, 140, 140, 90, 140, 90]), zone)
    expect(a.overLimitEvents).toBe(2)
    expect(a.overLimitSec).toBeCloseTo(0.12)
  })

  it('斷線空窗不計入任何時間', () => {
    const before = series([90, 90])
    const after = series([90, 90], 40 + MAX_SAMPLE_GAP_MS + 1)
    const a = analyzeSession([...before, ...after], zone)
    expect(a.activeSec).toBeCloseTo(0.08)
    expect(a.inZoneRatio).toBe(1)
  })

  it('沒有目標設定時不宣稱目標區比例;缺值被略過', () => {
    const a = analyzeSession(series([null, 10, 20, null]), null)
    expect(a.inZoneRatio).toBeNull()
    expect(a.peak).toBe(20)
  })

  it('空資料不產生 NaN', () => {
    const a = analyzeSession([], zone)
    expect(a).toMatchObject({ activeSec: 0, peak: null, mean: null, inZoneRatio: null, overLimitEvents: 0 })
  })
})
