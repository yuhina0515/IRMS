// 隔離互鎖原型；正式 IPC 尚未匯入，所有相關寫入最終必須共用同一 owner。
import budget from '@shared/storage-budget.json'

type Phase = 'open' | 'draining' | 'fencing' | 'mutating' | 'held'
type Hold = 'appendUncertain' | 'drainTimedOut' | 'fenceUncertain' | 'mutationUncertain' | 'historyComplete'

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
