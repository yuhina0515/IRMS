// AngleSmoother 單元測試:播種、收斂、衍生角一致性、reset 語意
import { describe, expect, it } from 'vitest'
import type { LiveAngles } from '@shared/protocol'
import { AngleSmoother, EMA_ALPHA } from './smoothing'

function angles(thigh: number, shin = 0, thighRoll = 0, shinRoll = 0): LiveAngles {
  return {
    thigh,
    shin,
    thighRoll,
    shinRoll,
    knee: Math.abs(thigh - shin),
    kneeRoll: shinRoll - thighRoll,
    rawThigh: thigh,
    rawShin: shin,
    rawThighRoll: thighRoll,
    rawShinRoll: shinRoll
  }
}

describe('AngleSmoother', () => {
  it('首筆直接播種(不從 0 拖出假角度)', () => {
    const s = new AngleSmoother()
    const out = s.next(angles(45, 10, 3, 7))
    expect(out.thigh).toBe(45)
    expect(out.shin).toBe(10)
    expect(out.thighRoll).toBe(3)
    expect(out.shinRoll).toBe(7)
  })

  it('階躍輸入以 α 權重收斂,單筆雜訊尖峰被壓制', () => {
    const s = new AngleSmoother()
    s.next(angles(0))
    const spike = s.next(angles(20)) // 單筆 20° 尖峰
    expect(spike.thigh).toBeCloseTo(20 * EMA_ALPHA) // 只透過 30%
    const back = s.next(angles(0))
    expect(back.thigh).toBeLessThan(spike.thigh) // 回落
  })

  it('持續輸入時收斂到真值', () => {
    const s = new AngleSmoother()
    s.next(angles(0))
    let out = angles(0)
    for (let i = 0; i < 30; i++) out = s.next(angles(50))
    expect(out.thigh).toBeCloseTo(50, 1)
  })

  it('衍生角由平滑值重算:knee = |thigh − shin| 恆成立', () => {
    const s = new AngleSmoother()
    s.next(angles(0, 0))
    const out = s.next(angles(60, 20, 5, 12))
    expect(out.knee).toBeCloseTo(Math.abs(out.thigh - out.shin))
    expect(out.kneeRoll).toBeCloseTo(out.shinRoll - out.thighRoll)
  })

  it('raw* 欄位透傳不平滑(校準精靈依賴原始值)', () => {
    const s = new AngleSmoother()
    s.next(angles(0))
    const out = s.next(angles(20))
    expect(out.rawThigh).toBe(20)
  })

  it('reset 後重新播種,不殘留舊狀態', () => {
    const s = new AngleSmoother()
    s.next(angles(80))
    s.reset()
    const out = s.next(angles(10))
    expect(out.thigh).toBe(10)
  })
})
