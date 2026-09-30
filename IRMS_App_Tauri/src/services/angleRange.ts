// services/angleRange.ts
// 個人舒適角度/極限範圍紀錄的讀寫。資料庫是唯一來源;store.angleRange 只是最新一筆的快取,
// 判定引擎與畫面從那裡讀。量測介面在 IRMS-Modules 的 angle-range 模組,透過
// ModuleContext.angleRange 呼叫這裡。
import type { AngleRangeInput, AngleRangeRecord } from '@shared/types'
import { irms } from '../platform/irmsApi'
import { useStore } from '../store/useStore'
import { getT } from '../i18n'
import { liveShareApi, type LiveSnapshot } from './liveShareHost'

export async function loadAngleRange(): Promise<AngleRangeRecord[]> {
  const records = await irms.angleRanges.list()
  useStore.getState().setAngleRange(records[0] ?? null)
  return records
}

export async function addAngleRange(input: AngleRangeInput): Promise<AngleRangeRecord> {
  const comfort = Number(input.comfortAngle)
  const limit = input.limitAngle == null ? null : Number(input.limitAngle)
  if (!Number.isFinite(comfort) || comfort < 0 || comfort > 180) throw new Error(getT().clinical.angleRange.comfortOutOfRange)
  if (limit != null && (!Number.isFinite(limit) || limit < comfort || limit > 180)) {
    throw new Error(getT().clinical.angleRange.limitOutOfRange)
  }
  if (useStore.getState().session.running) throw new Error(getT().clinical.angleRange.sessionRunning)
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 200) : null
  const record = await irms.angleRanges.add({ comfortAngle: comfort, limitAngle: limit, note })
  await loadAngleRange()
  useStore.getState().log(`Angle range recorded: comfort ${comfort}°${limit != null ? `, limit ${limit}°` : ''}`)
  return record
}

export async function removeAngleRange(id: number): Promise<void> {
  if (useStore.getState().session.running) throw new Error(getT().clinical.angleRange.sessionRunning)
  await irms.angleRanges.remove(id)
  await loadAngleRange()
}

/**
 * 交給 IRMS-Modules `angle-range` 模組的能力(ModuleContext.angleRange)。
 * 即時資料沿用即時分享的快照(已校準膝角、連線/示範/療程狀態),寫入一律經上面的驗證。
 */
export interface AngleRangeModuleApi {
  subscribe(listener: (s: LiveSnapshot) => void): () => void
  snapshot(): LiveSnapshot
  current(): AngleRangeRecord | null
  list(): Promise<AngleRangeRecord[]>
  add(input: AngleRangeInput): Promise<AngleRangeRecord>
  remove(id: number): Promise<void>
}

export const angleRangeModuleApi: AngleRangeModuleApi = {
  subscribe: (listener) => liveShareApi.subscribe(listener),
  snapshot: () => liveShareApi.snapshot(),
  current: () => useStore.getState().angleRange,
  list: loadAngleRange,
  add: addAngleRange,
  remove: removeAngleRange
}
