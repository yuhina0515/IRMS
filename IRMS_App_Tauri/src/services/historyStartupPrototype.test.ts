import { afterEach, describe, expect, it, vi } from 'vitest'
import { openHistoryTransitionGate } from './historyTransitionPrototype'

// 讀值 stub 只測建立 owner 前的門檻；實際 IDB 稽核由獨立瀏覽器探測驗證。
const empty = () => ({ key: 'totals', rows: 0, batches: 0, bytes: 0, historyFence: null })
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
afterEach(() => vi.useRealTimers())

describe('isolated startup-readiness factory', () => {
  it('exposes no owner until the audit completes, then allows local empty readiness', async () => {
    const read = deferred<unknown>()
    let published = false
    const startup = openHistoryTransitionGate(() => read.promise).then(result => { published = true; return result })
    await Promise.resolve(); expect(published).toBe(false)
    read.resolve(empty()); const result = await startup
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') throw new Error('Expected local readiness')
    await expect(result.owner.append(1, async () => 1)).resolves.toBe(1)
  })

  it.each([[1, 1, 200], [2, 1, 400], [2, 2, 400]])('blocks valid pending totals %s/%s/%s without exposing owner', async (rows, batches, bytes) => {
    const snapshot = { ...empty(), rows, batches, bytes }
    expect(await openHistoryTransitionGate(async () => snapshot)).toEqual({ status: 'held', reason: 'pendingJournal' })
    expect(snapshot).toEqual({ ...empty(), rows, batches, bytes })
  })

  it.each(['delete', 'restore'])('blocks %s fence even on an empty queue', async kind => {
    expect(await openHistoryTransitionGate(async () => ({ ...empty(), historyFence: { kind } })))
      .toEqual({ status: 'held', reason: 'historyUnresolved' })
  })

  it('gives unresolved history priority over pending readings', async () => {
    expect(await openHistoryTransitionGate(async () => ({ ...empty(), rows: 2, batches: 1, bytes: 400, historyFence: { kind: 'restore' } })))
      .toEqual({ status: 'held', reason: 'historyUnresolved' })
  })

  it('rejects unavailable, legacy, invalid or inherited snapshot fields', async () => {
    const legacy: Record<string, unknown> = { ...empty() }; delete legacy.historyFence
    for (const value of [null, [], legacy, Object.create(empty()), { ...empty(), rows: -1 }, { ...empty(), rows: NaN },
      { ...empty(), rows: Infinity }, { ...empty(), bytes: '0' }, { ...empty(), key: 'other' },
      { ...empty(), historyFence: undefined }, { ...empty(), historyFence: false }, { ...empty(), rows: 1 },
      { ...empty(), rows: 1, batches: 2, bytes: 400 }]) {
      expect(await openHistoryTransitionGate(async () => value)).toEqual({ status: 'held', reason: 'storageUnavailable' })
    }
  })

  it.each(['throw', 'reject'])('contains private storage %s without public error details', async kind => {
    const reader = kind === 'throw' ? () => { throw new Error('private/path') } : () => Promise.reject(new Error('private/payload'))
    expect(await openHistoryTransitionGate(reader)).toEqual({ status: 'held', reason: 'storageUnavailable' })
  })

  it.each(['resolve', 'reject'])('timeout stays held after late %s and clears timers', async kind => {
    vi.useFakeTimers()
    const read = deferred<unknown>()
    const startup = openHistoryTransitionGate(() => read.promise, 10)
    await vi.advanceTimersByTimeAsync(10)
    const held = await startup
    if (kind === 'resolve') read.resolve(empty()); else read.reject(new Error('private'))
    await vi.advanceTimersByTimeAsync(0)
    expect(held).toEqual({ status: 'held', reason: 'storageUnavailable' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('validates deadline before invoking reader', async () => {
    const reader = vi.fn(async () => empty())
    for (const n of [0, -1, NaN, Infinity, 1.5, 60001]) {
      expect(await openHistoryTransitionGate(reader, n)).toEqual({ status: 'held', reason: 'storageUnavailable' })
    }
    expect(reader).not.toHaveBeenCalled()
  })

  it.each([true, false])('same-tick read/deadline preserves first outcome (read first %s)', async readFirst => {
    vi.useFakeTimers()
    const read = deferred<unknown>()
    if (readFirst) setTimeout(() => read.resolve(empty()), 10)
    const startup = openHistoryTransitionGate(() => read.promise, 10)
    if (!readFirst) setTimeout(() => read.resolve(empty()), 10)
    await vi.advanceTimersByTimeAsync(10)
    expect((await startup).status).toBe(readFirst ? 'ready' : 'held')
    expect(vi.getTimerCount()).toBe(0)
  })
})
