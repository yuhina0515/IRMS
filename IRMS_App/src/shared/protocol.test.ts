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

  // --- MTU 截斷(issue #2)---------------------------------------------------
  // 韌體 6 軸封包最長 54 bytes。若 BLE MTU 停在預設 23,notify 承載只剩 20 bytes,
  // 封包被硬切。舊解析器把切出來的殘骸當成合法的 3 欄舊封包,Roll 靜靜變 0。
  //
  // 但整包丟棄是過度反應:T:/S: 最壞情況只佔 18 bytes,在 20 bytes 的切點下必定存活,
  // 而判定只讀 Pitch。所以策略是逐軸降級 + 升起 truncated 旗標,不是拒收。
  describe('MTU 23 截斷:保住 Pitch、丟掉 Roll、明確升旗', () => {
    const FULL = 'T:-180.0,S:-180.0,K:360.0,TR:-180.0,SR:-180.0,KR:360.0'
    const MTU23_PAYLOAD = 20

    it('完整封包超出預設 MTU 承載,而 T:/S: 必定在切點內存活', () => {
      expect(FULL.length).toBeGreaterThan(MTU23_PAYLOAD)
      expect('T:-180.0,S:-180.0,'.length).toBeLessThanOrEqual(MTU23_PAYLOAD)
    })

    it('切在 `K:` 後留下空值 → Pitch 保留、truncated 升起、Roll 不是靜默的 0', () => {
      const cut = FULL.slice(0, MTU23_PAYLOAD)
      expect(cut).toBe('T:-180.0,S:-180.0,K:')
      const r = parseAnglePacket(cut)
      expect(r.kind).toBe('angles')
      if (r.kind !== 'angles') return
      expect(r.raw.thigh).toBe(-180)
      expect(r.raw.shin).toBe(-180)
      expect(r.truncated).toBe(true)
      expect(r.hasRoll).toBe(false)
    })

    it('切在前綴中間(`,K`)→ 同樣降級而非丟棄', () => {
      const r = parseAnglePacket('T:-180.0,S:-180.0,K')
      expect(r.kind).toBe('angles')
      if (r.kind !== 'angles') return
      expect(r.raw.thigh).toBe(-180)
      expect(r.truncated).toBe(true)
    })

    it('只切到一半的 Roll(有 TR、沒 SR)→ 丟掉單邊 Roll,不拿去算內外翻', () => {
      const r = parseAnglePacket('T:1.0,S:2.0,K:1.0,TR:3.0')
      expect(r.kind).toBe('angles')
      if (r.kind !== 'angles') return
      expect(r.raw.thighRoll).toBe(0)
      expect(r.hasRoll).toBe(false)
      expect(r.truncated).toBe(true)
    })

    it('缺 T 或缺 S → malformed(判定來源不可信,必須拒絕而非降級)', () => {
      expect(parseAnglePacket('S:2.0,K:1.0,TR:3.0,SR:4.0').kind).toBe('malformed')
      expect(parseAnglePacket('T:1.0,K:1.0,TR:3.0,SR:4.0').kind).toBe('malformed')
    })

    it('中段壞掉 → malformed(那是亂碼,不是尾端截斷)', () => {
      expect(parseAnglePacket('T:1.0,S:abc,K:1.0,TR:3.0,SR:4.0').kind).toBe('malformed')
      expect(parseAnglePacket('T:1.0,T:2.0,S:3.0').kind).toBe('malformed')
    })
  })

  // --- hasRoll / truncated ---------------------------------------------------
  // Roll=0 與「這條鏈路沒送 Roll」在數字上分不出來,但前者是擺平、後者是資料缺失。
  // 判定不讀 Roll(computeMetricSample 只用 Pitch),但校準精靈的外展步驟與 3D
  // 姿態視圖會讀,所以缺值必須明說而不是用 0 混過去。
  describe('hasRoll / truncated 明確區分「本來就沒有」與「送了沒收到」', () => {
    it('6 軸封包 → hasRoll true、truncated false', () => {
      const r = parseAnglePacket('T:12.5,S:-45.2,K:57.7,TR:1.2,SR:-0.8,KR:2.0')
      expect(r.kind === 'angles' && r.hasRoll).toBe(true)
      expect(r.kind === 'angles' && r.truncated).toBe(false)
    })

    it('真正的 3 欄舊韌體 → hasRoll false,但 truncated 必須是 false', () => {
      const r = parseAnglePacket('T:10.0,S:20.0,K:10.0')
      expect(r.kind === 'angles' && r.hasRoll).toBe(false)
      expect(r.kind === 'angles' && r.truncated).toBe(false)
    })

    it('切點剛好落在數值邊界 → 與舊封包無法區分,寧可漏報 truncated 也不誤報', () => {
      const r = parseAnglePacket('T:12.5,S:-45.2,K:57.')
      expect(r.kind).toBe('angles')
      if (r.kind !== 'angles') return
      expect(r.raw.thigh).toBe(12.5)
      expect(r.hasRoll).toBe(false)
      expect(r.truncated).toBe(false)
    })

    it('純數字舊韌體 → hasRoll false、truncated false', () => {
      const r = parseAnglePacket('45.5')
      expect(r.kind === 'angles' && r.hasRoll).toBe(false)
      expect(r.kind === 'angles' && r.truncated).toBe(false)
    })
  })
})