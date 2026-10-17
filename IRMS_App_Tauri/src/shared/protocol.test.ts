// parseAnglePacket 單元測試。
// 大部分情境已搬進 fixtures/angle-packets.json,由 protocol.contract.test.ts 與
// src-tauri/src/protocol.rs 的 angle_packet_contract 共用同一份輸入/預期值——
// 見該檔案開頭的說明。這裡只留下純粹針對 TS 常數本身、不涉及解析輸出比對的檢查。
import { describe, expect, it } from 'vitest'
import { parseRawPacket } from './protocol'

describe('MTU 23 截斷常數自我檢查', () => {
  // 韌體 6 軸封包最長 54 bytes。若 BLE MTU 停在預設 23,notify 承載只剩 20 bytes,
  // 封包被硬切。T:/S: 最壞情況只佔 18 bytes,在 20 bytes 的切點下必定存活——
  // 這個前提是 fixtures/angle-packets.json 裡兩個 MTU23 案例的切點依據,獨立驗證
  // 該前提本身成立,而非重複驗證解析輸出(那部分由共用 fixture 覆蓋)。
  const FULL = 'T:-180.0,S:-180.0,K:360.0,TR:-180.0,SR:-180.0,KR:360.0'
  const MTU23_PAYLOAD = 20

  it('完整封包超出預設 MTU 承載,而 T:/S: 必定在切點內存活', () => {
    expect(FULL.length).toBeGreaterThan(MTU23_PAYLOAD)
    expect('T:-180.0,S:-180.0,'.length).toBeLessThanOrEqual(MTU23_PAYLOAD)
    expect(FULL.slice(0, MTU23_PAYLOAD)).toBe('T:-180.0,S:-180.0,K:')
  })
})

describe('parseRawPacket', () => {
  const ok = 'G:1.5/-2/0.25/3/4/5/0.01/-0.02/1/0/0.5/-0.87'
  it('parses 12 fields into gyro and accel vectors', () => {
    const m = parseRawPacket(ok)
    expect(m?.thighGyro).toEqual({ x: 1.5, y: -2, z: 0.25 })
    expect(m?.shinAcc).toEqual({ x: 0, y: 0.5, z: -0.87 })
  })
  it('rejects truncated, empty-field, non-numeric and non-G packets', () => {
    expect(parseRawPacket('G:1/2/3')).toBeNull()
    expect(parseRawPacket('G:1/2/3/4/5/6/7/8/9/10/11/')).toBeNull()
    expect(parseRawPacket(ok.replace('0.25', 'x'))).toBeNull()
    expect(parseRawPacket('T:1,S:2,K:3')).toBeNull()
  })
})
