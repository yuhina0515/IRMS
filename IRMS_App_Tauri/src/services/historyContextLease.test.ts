import { afterEach, describe, expect, it, vi } from 'vitest'
import { openCooperatingHistoryOwner } from './historyTransitionPrototype'

// Fake manager 只測錯誤／晚到 callback 邊界；真正互斥由雙 target Chrome 探測驗證。
const empty = async () => ({ key: 'totals', rows: 0, batches: 0, bytes: 0, historyFence: null })
const manager = (request: unknown) => ({ request }) as Pick<LockManager, 'request'>
afterEach(() => vi.useRealTimers())

describe('cooperating context lease boundary', () => {
  it('denies missing API without reading storage', async () => {
    const reader = vi.fn(empty)
    expect(await openCooperatingHistoryOwner(reader, 10, null)).toEqual({ status: 'held', reason: 'coordinationUnavailable' })
    expect(reader).not.toHaveBeenCalled()
  })
  it.each(['throw', 'reject', 'getter'])('redacts request %s', async kind => {
    const reader = vi.fn(empty)
    const request = kind === 'throw' ? () => { throw new Error('private/path') } : () => Promise.reject(new Error('private'))
    const provided = kind === 'getter' ? Object.defineProperty({}, 'request', { get() { throw new Error('private/path') } }) as Pick<LockManager, 'request'> : manager(request)
    expect(await openCooperatingHistoryOwner(reader, 10, provided)).toEqual({ status: 'held', reason: 'coordinationUnavailable' })
    expect(reader).not.toHaveBeenCalled()
  })
  it('busy callback never invokes the audit', async () => {
    const reader = vi.fn(empty)
    const request = (_name: string, options: unknown, callback: (lock: null) => Promise<void>) => {
      expect(options).toEqual({ mode: 'exclusive', ifAvailable: true }); return callback(null)
    }
    expect(await openCooperatingHistoryOwner(reader, 10, manager(request))).toEqual({ status: 'held', reason: 'contextBusy' })
    expect(reader).not.toHaveBeenCalled()
  })
  it('ignores late grants after deadline and leaves no audit or owner', async () => {
    vi.useFakeTimers()
    let grant!: (lock: object) => Promise<void>
    const reader = vi.fn(empty)
    const requested = new Promise<void>(() => {})
    const request = (_name: string, _options: unknown, callback: typeof grant) => { grant = callback; return requested }
    const startup = openCooperatingHistoryOwner(reader, 10, manager(request))
    await vi.advanceTimersByTimeAsync(10)
    expect(await startup).toEqual({ status: 'held', reason: 'coordinationUnavailable' })
    await grant({}); expect(reader).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
  })
  it('revokes even destructured functions before releasing the callback', async () => {
    const request = (_name: string, _options: unknown, callback: (lock: object) => Promise<void>) => callback({})
    const result = await openCooperatingHistoryOwner(empty, 100, manager(request))
    if (result.status !== 'ready') throw new Error('Expected local owner')
    const { append, change } = result.owner
    expect(result.release()).toBe(true); expect(result.release()).toBe(false)
    expect(result.owner.snapshot().leaseActive).toBe(false)
    await expect(append(1, async () => 1)).rejects.toThrow('History owner unavailable')
    await expect(change(async () => {}, async () => {})).rejects.toThrow('History owner unavailable')
  })
  it('revokes a published proxy if the request later fails', async () => {
    let fail!: (reason: unknown) => void
    const requested = new Promise<void>((_yes, no) => { fail = no })
    const request = (_name: string, _options: unknown, callback: (lock: object) => Promise<void>) => {
      void callback({}).catch(() => {}); return requested
    }
    const result = await openCooperatingHistoryOwner(empty, 100, manager(request))
    if (result.status !== 'ready') throw new Error('Expected local owner')
    fail(new Error('private/path')); await Promise.resolve(); await Promise.resolve()
    expect(result.owner.snapshot().leaseActive).toBe(false); expect(result.release()).toBe(false)
    await expect(result.owner.append(1, async () => 1)).rejects.toThrow('History owner unavailable')
  })
  it('ends the callback if request fails during audit and audit later succeeds', async () => {
    vi.useFakeTimers()
    let fail!: (reason: unknown) => void, finishAudit!: (value: unknown) => void
    let callbackDone = false
    const requested = new Promise<void>((_yes, no) => { fail = no })
    const audit = new Promise<unknown>(yes => { finishAudit = yes })
    const request = (_name: string, _options: unknown, callback: (lock: object) => Promise<void>) => {
      void callback({}).then(() => { callbackDone = true }); return requested
    }
    const startup = openCooperatingHistoryOwner(() => audit, 100, manager(request))
    await Promise.resolve(); fail(new Error('private/path'))
    expect(await startup).toEqual({ status: 'held', reason: 'coordinationUnavailable' })
    finishAudit(await empty())
    for (let i = 0; i < 12; i++) await Promise.resolve()
    expect(callbackDone).toBe(true); expect(vi.getTimerCount()).toBe(0)
  })
  it('does not dispatch mutation after lease loss while fence is pending', async () => {
    let fail!: (reason: unknown) => void, finishFence!: () => void
    const requested = new Promise<void>((_yes, no) => { fail = no })
    const fence = new Promise<void>(yes => { finishFence = yes })
    const request = (_name: string, _options: unknown, callback: (lock: object) => Promise<void>) => {
      void callback({}).catch(() => {}); return requested
    }
    const result = await openCooperatingHistoryOwner(empty, 100, manager(request))
    if (result.status !== 'ready') throw new Error('Expected local owner')
    const persist = vi.fn(() => fence), mutate = vi.fn(async () => {})
    const change = result.owner.change(persist, mutate).catch(error => error)
    for (let i = 0; i < 4; i++) await Promise.resolve()
    expect(persist).toHaveBeenCalledOnce()
    fail(new Error('private')); await Promise.resolve(); finishFence(); await change
    expect(mutate).not.toHaveBeenCalled()
  })
  it('does not dispatch accepted callback after lease loss before its microtask', async () => {
    let fail!: (reason: unknown) => void
    const requested = new Promise<void>((_yes, no) => { fail = no })
    const request = (_name: string, _options: unknown, callback: (lock: object) => Promise<void>) => {
      void callback({}).catch(() => {}); return requested
    }
    const result = await openCooperatingHistoryOwner(empty, 100, manager(request))
    if (result.status !== 'ready') throw new Error('Expected local owner')
    fail(new Error('private'))
    const operation = vi.fn(async () => 1)
    await result.owner.append(1, operation).catch(() => {})
    expect(operation).not.toHaveBeenCalled()
  })
})
