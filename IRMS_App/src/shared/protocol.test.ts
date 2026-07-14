// parseAnglePacket 單元測試:6 軸封包、衍生欄位忽略、ERR、malformed、舊格式相容
import { describe, expect, it } from 'vitest'
import { parseAnglePacket } from './protocol'

describe('parseAnglePacket', () => {
  it('解析完整 6 軸封包(K/KR 為衍生值,應忽略)', () => {
    const r = parseAnglePacket('T:12.5,S:-45.2,K:57.7,TR:1.2,SR:-0.8,KR:2.0')
    expect(r.kind).toBe('angles')
    if (r.kind !== 'angles') return
    expect(r.raw).toEqual({ thigh: 12.5, shin: -45.2, thighRoll: 1.2, shinRoll: -0.8 })
  })

  it('解析 3 欄舊封包(無 Roll 欄位時 Roll 為 0)', () => {
    const r = parseAnglePacket('T:10.0,S:20.0,K:10.0')
    expect(r.kind).toBe('angles')
    if (r.kind !== 'angles') return
    expect(r.raw).toEqual({ thigh: 10, shin: 20, thighRoll: 0, shinRoll: 0 })
  })

  it('TR/SR 前綴不可被 T:/S: 誤吃', () => {
    const r = parseAnglePacket('TR:5.5,SR:6.6,T:1.1,S:2.2,K:1.1')
    expect(r.kind).toBe('angles')
    if (r.kind !== 'angles') return
    expect(r.raw.thigh).toBe(1.1)
    expect(r.raw.thighRoll).toBe(5.5)
    expect(r.raw.shinRoll).toBe(6.6)
  })

  it('ERR 封包回報硬體錯誤碼', () => {
    const r = parseAnglePacket('ERR:1')
    expect(r).toEqual({ kind: 'error', code: 'ERR:1' })
  })

  it('含尾端空白/換行仍可解析(韌體端 trim 對稱防禦)', () => {
    const r = parseAnglePacket('  ERR:1\n')
    expect(r.kind).toBe('error')
  })

  it('數值不合法 → malformed', () => {
    const r = parseAnglePacket('T:abc,S:1.0,K:2.0')
    expect(r.kind).toBe('malformed')
  })

  it('純數字舊韌體相容:視為膝夾角(以 shin 欄承載)', () => {
    const r = parseAnglePacket('45.5')
    expect(r.kind).toBe('angles')
    if (r.kind !== 'angles') return
    expect(r.raw.shin).toBe(45.5)
    expect(r.raw.thigh).toBe(0)
  })

  it('無法解析的字串 → malformed', () => {
    expect(parseAnglePacket('hello').kind).toBe('malformed')
  })
})
