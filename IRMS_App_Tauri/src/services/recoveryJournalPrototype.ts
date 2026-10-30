// 隔離原型，正式收集流程尚未匯入；只在 transaction complete 後回報持久入列。
import type { SensorReading } from '@shared/types'

export const JOURNAL_LIMITS = { rows: 2000, batches: 128, bytes: 512 * 1024, batchRows: 1000, timestampBytes: 128 } as const
export interface JournalBatch { sessionId: number; storageIdentity: string; batchId: string; readings: SensorReading[] }
interface Totals { key: 'totals'; rows: number; batches: number; bytes: number }
interface Entry { order: number; sessionId: number; storageIdentity: string; batchId: string; payload: string; rows: number; bytes: number }
const encoder = new TextEncoder()
const identityPattern = /^[a-f\d]{32}\/[a-f\d]{32}$/
const batchPattern = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/
function fail(message = 'Journal integrity check failed'): never { throw new Error(message) }
function fields(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail()
}
function header(value: Record<string, unknown>): void {
  if (!Number.isSafeInteger(value.sessionId) || (value.sessionId as number) <= 0 ||
    typeof value.storageIdentity !== 'string' || value.storageIdentity.length !== 65 || !identityPattern.test(value.storageIdentity) ||
    typeof value.batchId !== 'string' || value.batchId.length !== 36 || !batchPattern.test(value.batchId)) fail()
}

// 固定順序與欄位，正規化 JSON 數字，不接受人口資料、額外路徑或不完整讀值。
function canonical(value: unknown): string {
  fields(value, ['sessionId', 'storageIdentity', 'batchId', 'readings'])
  header(value)
  if (!Array.isArray(value.readings) || value.readings.length < 1 || value.readings.length > JOURNAL_LIMITS.batchRows) fail()
  const readings = value.readings.map((reading: unknown) => {
    const names = ['timestamp', 'kneeAngle', 'proximalAngle', 'distalAngle', 'kneeRoll', 'proximalRoll', 'distalRoll']
    fields(reading, names)
    const timestamp = reading.timestamp
    if (typeof timestamp !== 'string' || timestamp.length > JOURNAL_LIMITS.timestampBytes ||
      [...timestamp].some(char => { const code = char.codePointAt(0)!; return code >= 0xd800 && code <= 0xdfff }) ||
      encoder.encode(timestamp).length > JOURNAL_LIMITS.timestampBytes || names.slice(1).some(name => !Number.isFinite(reading[name]))) fail()
    return Object.fromEntries(names.map(name => [name, reading[name]]))
  })
  const payload = JSON.stringify({ sessionId: value.sessionId, storageIdentity: value.storageIdentity, batchId: value.batchId, readings })
  if (payload.length > JOURNAL_LIMITS.bytes || encoder.encode(payload).length > JOURNAL_LIMITS.bytes) fail('Journal byte budget exceeded')
  return payload
}

function checkEntry(value: unknown): Entry {
  fields(value, ['order', 'sessionId', 'storageIdentity', 'batchId', 'payload', 'rows', 'bytes'])
  header(value)
  if (!Number.isSafeInteger(value.order) || (value.order as number) <= 0 || typeof value.payload !== 'string' ||
      value.payload.length > JOURNAL_LIMITS.bytes) fail()
  let batch: JournalBatch
  try { batch = JSON.parse(value.payload) as JournalBatch } catch { return fail() }
  if (canonical(batch) !== value.payload || batch.sessionId !== value.sessionId || batch.storageIdentity !== value.storageIdentity ||
    batch.batchId !== value.batchId || batch.readings.length !== value.rows || encoder.encode(value.payload).length !== value.bytes) fail()
  return value as unknown as Entry
}

export async function openRecoveryJournal(name: string) {
  if (!/^irms-recovery-prototype-[a-z\d-]{1,64}$/.test(name) || name.trim() !== name) fail('Invalid prototype journal name')
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let rejected = false
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      const entries = request.result.createObjectStore('entries', { keyPath: 'order', autoIncrement: true })
      entries.createIndex('identity', ['storageIdentity', 'batchId'], { unique: true })
      request.result.createObjectStore('meta', { keyPath: 'key' }).put({ key: 'totals', rows: 0, bytes: 0, batches: 0 })
    }
    request.onerror = () => { rejected = true; reject(new Error('Cannot open journal')) }
    request.onblocked = () => { rejected = true; reject(new Error('Journal database blocked')) }
    request.onsuccess = () => { if (rejected) request.result.close(); else resolve(request.result) }
  })
  db.onversionchange = () => db.close()
  let observedDurability: IDBTransactionDurability | null = null

  // cursor audit、容量核對與變更在同一交易；callback 內不 await，避免交易提前結束。
  function transaction<T>(mode: IDBTransactionMode, operation: (entries: IDBObjectStore, meta: IDBObjectStore, totals: Totals,
    first: Entry | null, done: (result: T) => void, abort: (reason: unknown) => void) => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction
      try { tx = db.transaction(['entries', 'meta'], mode, mode === 'readwrite' ? { durability: 'strict' } : undefined) }
      catch { reject(new Error('Cannot start journal transaction')); return }
      let error: Error | null = null, result: T, ready = false
      const abort = (reason: unknown) => {
        error = reason instanceof Error ? reason : new Error('Journal transaction failed')
        try { tx.abort() } catch { reject(error) }
      }
      const guarded = (callback: () => void) => { try { callback() } catch (reason) { abort(reason) } }
      tx.onabort = () => reject(error ?? new Error('Journal transaction failed'))
      tx.onerror = () => { /* 保留預設 abort 行為，不把 request error 當作成功。 */ }
      tx.oncomplete = () => { if (ready) resolve(result); else reject(new Error('Journal result missing')) }
      if (mode === 'readwrite') {
        observedDurability = tx.durability
        if (observedDurability !== 'strict') { abort(new Error('Strict journal durability unavailable')); return }
      }
      const entries = tx.objectStore('entries'), meta = tx.objectStore('meta')
      const totals: Totals = { key: 'totals', rows: 0, bytes: 0, batches: 0 }
      let first: Entry | null = null
      const cursor = entries.openCursor()
      cursor.onsuccess = () => guarded(() => {
        if (cursor.result) {
          const entry = checkEntry(cursor.result.value)
          totals.rows += entry.rows; totals.bytes += entry.bytes; totals.batches++
          if (totals.rows > JOURNAL_LIMITS.rows || totals.bytes > JOURNAL_LIMITS.bytes || totals.batches > JOURNAL_LIMITS.batches) fail()
          first ??= entry
          cursor.result.continue()
        } else {
          const request = meta.get('totals')
          request.onsuccess = () => guarded(() => {
            fields(request.result, ['key', 'rows', 'bytes', 'batches'])
            if (Object.keys(totals).some(key => request.result[key] !== totals[key as keyof Totals])) fail()
            const count = meta.count()
            count.onsuccess = () => guarded(() => {
              if (count.result !== 1) fail()
              operation(entries, meta, totals, first, value => { result = value; ready = true }, abort)
            })
          })
        }
      })
    })
  }

  const journal = {
    async enqueue(batch: JournalBatch): Promise<number> {
      // 在啟動交易前完成複製／驗證，呼叫端之後修改原陣列不會改寫已準備批次。
      const payload = canonical(batch), copy = JSON.parse(payload) as JournalBatch
      const bytes = encoder.encode(payload).length
      return transaction<number>('readwrite', (entries, meta, totals, _first, done, abort) => {
        const request = entries.index('identity').get([copy.storageIdentity, copy.batchId])
        request.onsuccess = () => {
          try {
            if (request.result) {
              const entry = checkEntry(request.result)
              if (entry.payload !== payload) fail('Journal batch identity conflict')
              done(entry.order)
              return
            }
            if (totals.rows + copy.readings.length > JOURNAL_LIMITS.rows || totals.bytes + bytes > JOURNAL_LIMITS.bytes ||
              totals.batches + 1 > JOURNAL_LIMITS.batches) fail('Journal capacity exceeded')
            const add = entries.add({ sessionId: copy.sessionId, storageIdentity: copy.storageIdentity, batchId: copy.batchId,
              payload, rows: copy.readings.length, bytes })
            add.onsuccess = () => done(add.result as number)
            meta.put({ key: 'totals', rows: totals.rows + copy.readings.length, bytes: totals.bytes + bytes, batches: totals.batches + 1 })
          } catch (reason) {
            // 讓 transaction 的固定錯誤出口處理，不把量測內容寫進訊息。
            abort(reason)
          }
        }
      })
    },
    peek: () => transaction<JournalBatch | null>('readonly', (_entries, _meta, _totals, first, done) => {
      done(first ? JSON.parse(first.payload) as JournalBatch : null)
    }),
    acknowledge: async (ack: { sessionId: number; storageIdentity: string; batchId: string; count: number }) => {
      fields(ack, ['sessionId', 'storageIdentity', 'batchId', 'count']); header(ack)
      return transaction<void>('readwrite', (entries, meta, totals, first, done) => {
        if (!first || first.sessionId !== ack.sessionId || first.storageIdentity !== ack.storageIdentity ||
          first.batchId !== ack.batchId || first.rows !== ack.count) fail('Journal acknowledgement mismatch')
        entries.delete(first.order)
        meta.put({ key: 'totals', rows: totals.rows - first.rows, bytes: totals.bytes - first.bytes, batches: totals.batches - 1 })
        done(undefined)
      })
    },
    stats: () => transaction<Totals & { observedDurability: IDBTransactionDurability | null }>('readonly',
      (_entries, _meta, totals, _first, done) => done({ ...totals, observedDurability })),
    close: () => db.close()
  }
  // 開啟損壞日誌時保留原資料，不自動清空或宣稱復原成功。
  try { await journal.stats() } catch (error) { db.close(); throw error }
  return journal
}
