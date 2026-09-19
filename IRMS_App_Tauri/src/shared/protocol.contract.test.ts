import { describe, expect, it } from 'vitest'
import angleCases from '../../fixtures/angle-packets.json'
import vectorCases from '../../fixtures/vector-packets.json'
import { parseAnglePacket } from './protocol'

// TS 與 Rust 共用同一份輸入與預期值，避免兩端測試各自維護而一起漏接邊界。
describe('shared vector packet contract', () => {
  it.each(vectorCases)('$name', ({ packet, truncated, vectors }) => {
    const result = parseAnglePacket(packet)
    expect(result.kind).toBe('angles')
    if (result.kind !== 'angles') throw new Error('Expected angle packet')
    expect(result.truncated).toBe(truncated)
    expect(result.raw.thigh).toBe(1)
    expect(result.raw.shin).toBe(2)
    const { thighAccel: t, shinAccel: s } = result.raw
    expect(t && s ? [t.x, t.y, t.z, s.x, s.y, s.z] : null).toEqual(vectors)
    expect(Boolean(t)).toBe(Boolean(s))
  })
})

// 涵蓋一般封包解析:合法欄位組合、ERR、malformed、MTU 截斷降級。與上面的向量
// fixture 分開——這份固定 T:/S: 之外的每個欄位組合都不同,向量 fixture 固定
// T:1,S:2 只變化 V: 欄位本身。src-tauri/src/protocol.rs 的 angle_packet_contract
// 讀同一份 JSON。
describe('shared angle packet contract', () => {
  it.each(angleCases)('$name', (testCase) => {
    const result = parseAnglePacket(testCase.packet)
    expect(result.kind).toBe(testCase.kind)

    if (testCase.kind === 'error') {
      if (result.kind !== 'error') throw new Error('Expected error packet')
      expect(result.code).toBe(testCase.code)
      return
    }

    if (testCase.kind === 'malformed') return

    if (result.kind !== 'angles') throw new Error('Expected angle packet')
    if (!testCase.raw) throw new Error('Expected fixture raw for angles case')
    const expectedRaw = testCase.raw
    expect(result.hasRoll).toBe(testCase.hasRoll)
    expect(result.truncated).toBe(testCase.truncated)
    expect(result.raw.thigh).toBe(expectedRaw.thigh)
    expect(result.raw.shin).toBe(expectedRaw.shin)
    expect(result.raw.thighRoll).toBe(expectedRaw.thighRoll)
    expect(result.raw.shinRoll).toBe(expectedRaw.shinRoll)
    const { thighAccel: t, shinAccel: s } = result.raw
    expect(t ?? null).toEqual(expectedRaw.thighAccel)
    expect(s ?? null).toEqual(expectedRaw.shinAccel)
  })
})
