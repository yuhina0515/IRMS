import { describe, it, expect } from 'vitest'
import {
  maxAxisDelta,
  PITCH_AXES,
  ROLL_AXES,
  CAPTURE_ROLL_DELTA_MIN,
  CAPTURE_DELTA_MIN
} from './calibration'
import type { RawAngles } from '@shared/protocol'

const pose = (thigh: number, shin: number, thighRoll = 0, shinRoll = 0): RawAngles => ({
  thigh,
  shin,
  thighRoll,
  shinRoll
})

/** 站直基準 */
const BASELINE = pose(0, 0, 0, 0)

describe('maxAxisDelta', () => {
  it('只看被指定的軸', () => {
    const rollOnly = pose(0, 0, 22, 18)
    expect(maxAxisDelta(BASELINE, rollOnly, ROLL_AXES)).toBeCloseTo(22)
    expect(maxAxisDelta(BASELINE, rollOnly, PITCH_AXES)).toBeCloseTo(0)
  })

  it('取指定軸中的最大位移', () => {
    expect(maxAxisDelta(BASELINE, pose(12, 47), PITCH_AXES)).toBeCloseTo(47)
  })

  it('空軸集回傳 0(基準步驟本身不設位移門檻)', () => {
    expect(maxAxisDelta(BASELINE, pose(90, 90, 90, 90), [])).toBe(0)
  })

  it('跨 ±180 分支切點用最短弧,不會算出 350°', () => {
    // 腳踝外旋讓 roll 落在 -175,基準在 +175 —— 實際只差 10°
    expect(maxAxisDelta(pose(0, 0, 175, 0), pose(0, 0, -175, 0), ROLL_AXES)).toBeCloseTo(10)
  })
})

describe('免手擷取的步驟門檻(2026-08-03 會議發現)', () => {
  // 第 4 步(後勾小腿)擷取完成的瞬間,患者必然仍維持著勾腿姿勢——那正是剛剛
  // 擷取的姿勢。此時 pitch 相對站直基準已有數十度,roll 完全沒動。
  const HEEL_HOOK_RESIDUAL = pose(8, 47, 1.2, 0.8)

  it('殘留的勾腿姿勢不得滿足外展步驟的 roll 門檻', () => {
    const moved = maxAxisDelta(BASELINE, HEEL_HOOK_RESIDUAL, ROLL_AXES)
    expect(moved).toBeLessThan(CAPTURE_ROLL_DELTA_MIN)
  })

  it('對照:若沿用「四軸取最大」的舊寫法,同一個姿勢會誤觸發', () => {
    // 這是修正前的行為。保留為對照組,證明缺陷真實存在而非臆測:
    // 47° 的小腿 pitch 殘留輕鬆越過 15° 的 roll 門檻,外展步驟於是在患者
    // 根本沒有外展的情況下自動擷取,把該步驟靜默消耗掉。
    const oldMoved = maxAxisDelta(BASELINE, HEEL_HOOK_RESIDUAL, [
      ...PITCH_AXES,
      ...ROLL_AXES
    ])
    expect(oldMoved).toBeGreaterThan(CAPTURE_ROLL_DELTA_MIN)
  })

  it('真正做了外展仍然會觸發', () => {
    const abducted = pose(6, 4, 25, 21)
    expect(maxAxisDelta(BASELINE, abducted, ROLL_AXES)).toBeGreaterThanOrEqual(CAPTURE_ROLL_DELTA_MIN)
  })

  it('站直不動不會觸發抬腿步驟', () => {
    const standing = pose(0.7, -0.4, 0.3, 0.2)
    expect(maxAxisDelta(BASELINE, standing, PITCH_AXES)).toBeLessThan(CAPTURE_DELTA_MIN)
  })

  it('真的抬腿會觸發抬腿步驟', () => {
    expect(maxAxisDelta(BASELINE, pose(38, 30), PITCH_AXES)).toBeGreaterThanOrEqual(CAPTURE_DELTA_MIN)
  })
})
