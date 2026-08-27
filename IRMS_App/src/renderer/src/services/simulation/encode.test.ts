// 模擬器的**閘門測試**。
//
// 這個檔案在計畫裡被標成「不可略過」:如果編碼器對線格式的認知是錯的,
// 它仍然會產生看起來很像封包的字串,parseAnglePacket 仍然會解析成功,
// 下游每一個 CMD: 稽核測試都會全綠——而它們驗證的是一個現實中不存在的協定。
// 所以先在這裡把「編碼 → 解析」的往返關係釘死。

import { describe, expect, it } from 'vitest'
import { parseAnglePacket, type RawAngles } from '@shared/protocol'
import { applyCalibration, type Settings } from '../../store/useStore'
import { ERR_PACKET, encodeAnglePacket, encodeLegacyPacket, truncateTo } from './encode'
import { poseForKnee, REST_POSE } from './kinematics'

/** 預設校準:applyCalibration 在這組設定下是恆等轉換 */
const DEFAULT_CAL: Settings = {
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

describe('encodeAnglePacket — 線格式契約', () => {
  it('逐字對齊韌體 snprintf 的欄位順序與精度', () => {
    // 韌體 IRMS_Sensor.ino:203 的格式字串,K = |T-S|、KR = |TR-SR|
    const wire = encodeAnglePacket({ thigh: 12.5, shin: -45.2, thighRoll: 3.1, shinRoll: -2.4 })
    expect(wire).toBe('T:12.5,S:-45.2,K:57.7,TR:3.1,SR:-2.4,KR:5.5')
  })

  it('K: 與 KR: 必須存在於線上(解析器忽略它們,但長度決定截斷切點)', () => {
    const wire = encodeAnglePacket(REST_POSE)
    expect(wire).toContain(',K:')
    expect(wire).toContain(',KR:')
  })

  // ── 閘門:往返 ──
  //
  // 誤差上界刻意寫成「半個量化步階」而不是用 toBeCloseTo:協定以 %.1f 傳輸,
  // 量化底線就是 0.1°,所以往返誤差的理論最大值**正好是 0.05**,而且落在
  // x.x5 這種值上必然取到這個上界(第一次跑就被 thighRoll = -22.75 抓到)。
  // toBeCloseTo(x, 1) 用的是嚴格小於,會在恰好命中上界時失敗——那不是缺陷,
  // 是斷言把「≤」寫成了「<」。把量化底線明寫出來,順便讓這個限制在測試裡有名字。
  const QUANTISATION_STEP = 0.1
  const MAX_ROUND_TRIP_ERROR = QUANTISATION_STEP / 2

  it('往返:parse(encode(r)) 誤差不超過半個量化步階,含 ±180 折點', () => {
    const values = [-180, -179.9, -134.4, -90, -45.5, -0.1, 0, 0.1, 45.5, 90, 134.4, 179.9, 180]
    const within = (actual: number, expected: number): void => {
      expect(Math.abs(actual - expected)).toBeLessThanOrEqual(MAX_ROUND_TRIP_ERROR + Number.EPSILON * 100)
    }
    for (const t of values) {
      for (const s of values) {
        const raw: RawAngles = { thigh: t, shin: s, thighRoll: s / 2, shinRoll: t / 2 }
        const parsed = parseAnglePacket(encodeAnglePacket(raw))
        expect(parsed.kind).toBe('angles')
        if (parsed.kind !== 'angles') continue
        within(parsed.raw.thigh, raw.thigh)
        within(parsed.raw.shin, raw.shin)
        within(parsed.raw.thighRoll, raw.thighRoll)
        within(parsed.raw.shinRoll, raw.shinRoll)
        expect(parsed.hasRoll).toBe(true)
        expect(parsed.truncated).toBe(false)
      }
    }
  })

  it('完整封包長度確實超過 20 bytes(否則截斷情境測不到東西)', () => {
    expect(encodeAnglePacket(poseForKnee(90)).length).toBeGreaterThan(20)
  })
})

describe('truncateTo — MTU 未協商成功', () => {
  it('切到 20 bytes 後 T:/S: 仍存活、Roll 被丟棄並升起 truncated', () => {
    const parsed = parseAnglePacket(truncateTo(encodeAnglePacket(poseForKnee(90))))
    expect(parsed.kind).toBe('angles')
    if (parsed.kind !== 'angles') return
    // 判定只讀 Pitch,所以療程照常進行——這正是「不整包丟棄」的理由
    expect(parsed.raw.thigh).toBeCloseTo(0, 1)
    expect(parsed.raw.shin).toBeCloseTo(90, 1)
    expect(parsed.hasRoll).toBe(false)
    expect(parsed.truncated).toBe(true)
  })

  it('最壞情況 T:-180.0,S:-180.0 仍在 20 bytes 內完整存活', () => {
    const wire = truncateTo(encodeAnglePacket({ thigh: -180, shin: -180, thighRoll: 0, shinRoll: 0 }))
    const parsed = parseAnglePacket(wire)
    expect(parsed.kind).toBe('angles')
    if (parsed.kind !== 'angles') return
    expect(parsed.raw.thigh).toBeCloseTo(-180, 1)
    expect(parsed.raw.shin).toBeCloseTo(-180, 1)
  })
})

describe('其他封包種類', () => {
  it('舊韌體 3 欄格式:hasRoll=false 但 truncated=false(與 MTU 截斷可區分)', () => {
    const parsed = parseAnglePacket(encodeLegacyPacket({ thigh: 10, shin: 100 }))
    expect(parsed.kind).toBe('angles')
    if (parsed.kind !== 'angles') return
    expect(parsed.hasRoll).toBe(false)
    expect(parsed.truncated).toBe(false)
  })

  it('ERR 封包解析為 error', () => {
    const parsed = parseAnglePacket(ERR_PACKET)
    expect(parsed.kind).toBe('error')
  })
})

describe('poseForKnee — 姿勢與判定值的對應', () => {
  // kinematics.ts 的註解宣稱 poseForKnee(K) 會讓判定看到 knee = K。
  // 那是一個推導,推導會錯,所以在這裡實際跑過 applyCalibration 斷言它。
  it.each([0, 15, 45, 90, 120, 130, 179])('poseForKnee(%i) 經預設校準後 knee 等於該值', (k) => {
    const angles = applyCalibration(poseForKnee(k), DEFAULT_CAL)
    expect(angles.knee).toBeCloseTo(k, 5)
  })

  it('休息位的膝夾角為 0', () => {
    expect(applyCalibration(REST_POSE, DEFAULT_CAL).knee).toBeCloseTo(0, 5)
  })
})
