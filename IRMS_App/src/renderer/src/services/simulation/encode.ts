// renderer/services/simulation/encode.ts
// --- 韌體封包編碼器(模擬用)---
//
// 這是 shared/protocol.ts 的 parseAnglePacket 的逆運算,必須**逐位元對齊韌體實際送出的字串**。
// 韌體來源:IRMS_Sensor/IRMS_Sensor.ino:203
//   snprintf(buf, ..., "T:%.1f,S:%.1f,K:%.1f,TR:%.1f,SR:%.1f,KR:%.1f",
//            a.thigh, a.shin, a.knee, a.thighRoll, a.shinRoll, a.kneeRoll)
// 其中(同檔 :151, :154):
//   a.knee     = fabsf(a.thigh - a.shin)
//   a.kneeRoll = fabsf(a.thighRoll - a.shinRoll)
//
// ⚠ K: 與 KR: 這兩欄**在線上真實存在**,只是 parseAnglePacket 忽略它們、由 App 端
// 依校準後的值自行重算(kneeRoll 在 App 端還改成帶符號)。編碼器仍然必須輸出它們——
// 否則封包長度不對,而長度正是 MTU 截斷測試唯一在測的東西:少兩欄會讓切點落在
// 完全不同的位置,於是「截斷」情境測到的是一個現實中不存在的截斷。

import type { RawAngles } from '@shared/protocol'

/**
 * BLE MTU 未協商成功時,ATT notify 的實際承載上限(bytes)。
 * MTU 23 − 3 bytes ATT header = 20。config.h 請求的是 128,但 setMTU() 只是「請求」。
 */
export const MIN_MTU_PAYLOAD = 20

/** 韌體錯誤封包(IRMS_Sensor.ino:197) */
export const ERR_PACKET = 'ERR:1'

// C 的 %.1f 與 JS 的 toFixed(1) 在本專案的值域內行為一致(含 -0.0 的表示)
const f = (n: number): string => n.toFixed(1)

/** 依韌體線格式編碼一個 6 軸封包 */
export function encodeAnglePacket(raw: RawAngles): string {
  const knee = Math.abs(raw.thigh - raw.shin)
  const kneeRoll = Math.abs(raw.thighRoll - raw.shinRoll)
  return (
    `T:${f(raw.thigh)},S:${f(raw.shin)},K:${f(knee)},` +
    `TR:${f(raw.thighRoll)},SR:${f(raw.shinRoll)},KR:${f(kneeRoll)}`
  )
}

/**
 * 模擬 MTU 太小造成的硬切。
 * 韌體照樣送完整字串,是傳輸層把尾巴切掉——所以這裡切的是「已編碼的封包」,
 * 而不是少編幾個欄位。兩者對解析器來說是不同的東西。
 */
export function truncateTo(packet: string, bytes: number = MIN_MTU_PAYLOAD): string {
  return packet.slice(0, bytes)
}

/** 3 欄舊韌體格式(無 Roll)。用於驗證 hasRoll=false 與 truncated=false 的區別 */
export function encodeLegacyPacket(raw: Pick<RawAngles, 'thigh' | 'shin'>): string {
  const knee = Math.abs(raw.thigh - raw.shin)
  return `T:${f(raw.thigh)},S:${f(raw.shin)},K:${f(knee)}`
}
