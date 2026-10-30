// 隔離互鎖原型；正式 IPC 尚未匯入，所有相關寫入最終必須共用同一 owner。
import budget from '@shared/storage-budget.json'

type Phase = 'open' | 'draining' | 'fencing' | 'mutating' | 'held'
type Hold = 'appendUncertain' | 'drainTimedOut' | 'fenceUncertain' | 'mutationUncertain' | 'historyComplete'

export type StartupOutcome =
  | { status: 'ready'; owner: ReturnType<typeof createHistoryTransitionGate> }
  | { status: 'held'; reason: 'storageUnavailable' | 'historyUnresolved' | 'pendingJournal' }

type Gate = ReturnType<typeof createHistoryTransitionGate>
type CooperatingOwner = Omit<Gate, 'snapshot'> & { snapshot: () => ReturnType<Gate['snapshot']> & { leaseActive: boolean } }
export type CooperatingOutcome =
  | { status: 'ready'; owner: CooperatingOwner; release: () => boolean }
  | { status: 'held'; reason: 'contextBusy' | 'coordinationUnavailable' | 'storageUnavailable' | 'historyUnresolved' | 'pendingJournal' }

// 固定名稱且不 steal／排隊；只約束合作的同來源 contexts，不是 native 全域鎖。
export async function openCooperatingHistoryOwner(readStats: () => Promise<unknown>, timeoutMs = 5000,
  manager?: Pick<LockManager, 'request'> | null): Promise<CooperatingOutcome> {
  const unavailable = (): CooperatingOutcome => ({ status: 'held', reason: 'coordinationUnavailable' })
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60000) return unavailable()
  let locks: Pick<LockManager, 'request'> | null | undefined
  try {
    locks = manager === undefined ? globalThis.navigator?.locks : manager
    if (!locks || typeof locks.request !== 'function') return unavailable()
  } catch { return unavailable() }
  return new Promise(resolve => {
    let published = false, expired = false, revoke = () => {}
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (result: CooperatingOutcome) => {
      if (timer !== undefined) clearTimeout(timer)
      if (!published) { published = true; resolve(result) }
    }
    timer = setTimeout(() => { expired = true; finish(unavailable()) }, timeoutMs)
    try {
      const requested = locks.request('irms-recovery-prototype-history-owner-v1', { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (expired || published) return
        if (timer !== undefined) clearTimeout(timer)
        if (!lock) { finish({ status: 'held', reason: 'contextBusy' }); return }
        const startup = await openHistoryTransitionGate(readStats, timeoutMs)
        // request 可能在 audit 等待期間已失敗；不可替已結束的請求留下孤兒 lifetime。
        if (expired || published) return
        if (startup.status !== 'ready') { finish(startup); return }
        let live = true, releaseLock!: () => void
        const lifetime = new Promise<void>(yes => { releaseLock = yes })
        revoke = () => { live = false; releaseLock() }
        const error = () => new Error('History owner unavailable')
        const owner: CooperatingOwner = {
          snapshot: () => ({ ...startup.owner.snapshot(), leaseActive: live }),
          append: (count, operation) => live && typeof operation === 'function' ? startup.owner.append(count, () => {
            if (!live) throw error()
            return operation()
          }) : Promise.reject(error()),
          change: (persistFence, mutate, deadline) => live && typeof persistFence === 'function' && typeof mutate === 'function'
            ? startup.owner.change(() => {
              if (!live) throw error()
              return persistFence()
            }, () => {
              if (!live) throw error()
              return mutate()
            }, deadline) : Promise.reject(error()),
        }
        finish({ status: 'ready', owner, release: () => {
          if (!live) return false
          const state = startup.owner.snapshot()
          if (state.pendingAppend || !(state.phase === 'open' || state.reason === 'historyComplete')) return false
          // 同步撤銷所有既有函數參照，再結束 lock callback 的 lifetime promise。
          revoke(); return true
        } })
        await lifetime
      })
      Promise.resolve(requested).then(() => { revoke(); finish(unavailable()) }, () => { revoke(); finish(unavailable()) })
    } catch { revoke(); finish(unavailable()) }
  })
}

// 只接可信 journal.stats 的已稽核結果；空值不是 native 歷史或跨視窗 lease 的證明。
export async function openHistoryTransitionGate(readStats: () => Promise<unknown>, timeoutMs = 5000): Promise<StartupOutcome> {
  const unavailable = (): StartupOutcome => ({ status: 'held', reason: 'storageUnavailable' })
  if (typeof readStats !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60000) return unavailable()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const value = await Promise.race([Promise.resolve().then(readStats), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Startup storage unavailable')), timeoutMs)
    })])
    if (!value || typeof value !== 'object' || Array.isArray(value)) return unavailable()
    const record = value as Record<string, unknown>
    if (['key', 'rows', 'batches', 'bytes', 'historyFence'].some(key => !Object.hasOwn(record, key))) return unavailable()
    const { key, rows, batches, bytes, historyFence } = record
    if (key !== 'totals' || [rows, batches, bytes].some(n => !Number.isSafeInteger(n) || (n as number) < 0)) return unavailable()
    const counts = [rows, batches, bytes] as number[]
    if (!(counts.every(n => n === 0) || counts.every(n => n > 0)) || (batches as number) > (rows as number)) return unavailable()
    if (historyFence !== null) {
      if (!historyFence || typeof historyFence !== 'object' || Array.isArray(historyFence)) return unavailable()
      return { status: 'held', reason: 'historyUnresolved' }
    }
    if (rows !== 0 || batches !== 0 || bytes !== 0) return { status: 'held', reason: 'pendingJournal' }
    return { status: 'ready', owner: createHistoryTransitionGate() }
  } catch { return unavailable() }
  finally { if (timer !== undefined) clearTimeout(timer) }
}

export function createHistoryTransitionGate() {
  let phase: Phase = 'open', reason: Hold | null = null
  let active: { settled: Promise<boolean> } | null = null
  const failure = () => new Error('History transition unavailable')
  // 一旦不確定就單向保留，晚到回覆不能覆寫最先的原因或重新開放。
  function hold(value: Hold) { if (phase !== 'held') { phase = 'held'; reason = value } }

  async function bounded<T>(work: Promise<T>, timeoutMs: number, cause: Hold): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([work, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { hold(cause); reject(failure()) }, timeoutMs)
      })])
    } finally { if (timer !== undefined) clearTimeout(timer) }
  }

  return {
    snapshot: () => ({ phase, reason, pendingAppend: active !== null }),
    append(expectedCount: number, operation: () => Promise<number>): Promise<number> {
      if (phase !== 'open' || active || !Number.isSafeInteger(expectedCount) || expectedCount <= 0 ||
          expectedCount > budget.maxBatchRows || typeof operation !== 'function') return Promise.reject(failure())
      let settle!: (ok: boolean) => void
      const entry = { settled: new Promise<boolean>(resolve => { settle = resolve }) }
      active = entry
      // 登記後才呼叫 callback；同步 throw、重入與非完整回覆都走固定錯誤出口。
      return Promise.resolve().then(operation).then(count => {
        if (count !== expectedCount) throw failure()
        active = null; settle(true)
        return count
      }, () => { throw failure() }).catch(() => {
        active = null; hold('appendUncertain'); settle(false)
        throw failure()
      })
    },
    async change(persistFence: () => Promise<void>, mutate: () => Promise<void>, timeoutMs = 5000): Promise<void> {
      if (phase !== 'open' || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60000 ||
          typeof persistFence !== 'function' || typeof mutate !== 'function') throw failure()
      phase = 'draining'
      const pending = active
      try {
        if (pending && !await bounded(pending.settled, timeoutMs, 'drainTimedOut')) throw failure()
        // await 期間的失敗或 deadline 不得被後續 continuation 解除。
        if (reason !== null) throw failure()
        phase = 'fencing'
        await bounded(Promise.resolve().then(persistFence), timeoutMs, 'fenceUncertain')
        if (reason !== null) throw failure()
        phase = 'mutating'
        await bounded(Promise.resolve().then(mutate), timeoutMs, 'mutationUncertain')
        if (reason !== null) throw failure()
        hold('historyComplete')
      } catch {
        if (phase === 'draining') hold('appendUncertain')
        else if (phase === 'fencing') hold('fenceUncertain')
        else if (phase === 'mutating') hold('mutationUncertain')
        throw failure()
      }
    },
  }
}
