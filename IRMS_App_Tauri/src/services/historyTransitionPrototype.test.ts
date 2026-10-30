import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHistoryTransitionGate } from './historyTransitionPrototype'

// 受控 Promise 僅驗證 owner 排序，不宣稱取消 native 工作或實際 IPC 驗收。
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
afterEach(() => { vi.useRealTimers() })

describe('isolated history transition owner', () => {
  it('reserves before callbacks and waits full append then fence then mutation', async () => {
    const gate = createHistoryTransitionGate(), ack = deferred<number>(), fence = deferred<void>()
    const persist = vi.fn(() => fence.promise), mutate = vi.fn(async () => {})
    const append = gate.append(2, () => ack.promise)
    const change = gate.change(persist, mutate)
    expect(gate.snapshot()).toEqual({ phase: 'draining', reason: null, pendingAppend: true })
    await expect(gate.append(1, async () => 1)).rejects.toThrow('History transition unavailable')
    await expect(gate.change(persist, mutate)).rejects.toThrow()
    await flush(); expect(persist).not.toHaveBeenCalled()
    ack.resolve(2); await append; await flush()
    expect(persist).toHaveBeenCalledOnce(); expect(mutate).not.toHaveBeenCalled()
    fence.resolve(); await change
    expect(mutate).toHaveBeenCalledOnce()
    expect(gate.snapshot()).toEqual({ phase: 'held', reason: 'historyComplete', pendingAppend: false })
    await expect(gate.append(1, async () => 1)).rejects.toThrow()
  })

  it.each([0, 1, 3, NaN])('short or invalid acknowledgement %s never reaches fence', async count => {
    const gate = createHistoryTransitionGate(), ack = deferred<number>()
    const append = gate.append(2, () => ack.promise).catch(error => error)
    const persist = vi.fn(async () => {}), mutate = vi.fn(async () => {})
    const change = gate.change(persist, mutate).catch(error => error)
    ack.resolve(count); expect((await append).message).toBe('History transition unavailable')
    expect((await change).message).toBe('History transition unavailable')
    expect(persist).not.toHaveBeenCalled(); expect(mutate).not.toHaveBeenCalled()
    expect(gate.snapshot().reason).toBe('appendUncertain')
  })

  it('redacts synchronous throw and private rejection without leaking cause', async () => {
    for (const operation of [() => { throw new Error('private/path') }, () => Promise.reject(new Error('private/payload'))]) {
      const gate = createHistoryTransitionGate()
      const error = await gate.append(1, operation).catch(error => error)
      expect(error.message).toBe('History transition unavailable'); expect(error.cause).toBeUndefined()
      expect(gate.snapshot().reason).toBe('appendUncertain')
    }
  })

  it('registers append before callback reentry and bounds outstanding work', async () => {
    const gate = createHistoryTransitionGate(), ack = deferred<number>()
    let nested!: Promise<unknown>
    const first = gate.append(1, () => { nested = gate.append(1, async () => 1).catch(error => error); return ack.promise })
    await flush(); expect((await nested as Error).message).toBe('History transition unavailable')
    ack.resolve(1); await first; expect(gate.snapshot().phase).toBe('open')
    await expect(gate.append(1, async () => 1)).resolves.toBe(1)
  })

  it.each(['resolve', 'reject'])('drain timeout stays held after late %s', async outcome => {
    vi.useFakeTimers()
    const gate = createHistoryTransitionGate(), ack = deferred<number>()
    const append = gate.append(1, () => ack.promise).catch(error => error)
    const persist = vi.fn(async () => {}), mutate = vi.fn(async () => {})
    const change = gate.change(persist, mutate, 10).catch(error => error)
    await vi.advanceTimersByTimeAsync(10); await change
    expect(gate.snapshot()).toEqual({ phase: 'held', reason: 'drainTimedOut', pendingAppend: true })
    if (outcome === 'resolve') ack.resolve(1); else ack.reject(new Error('private'))
    await append; await flush()
    expect(gate.snapshot().reason).toBe('drainTimedOut'); expect(gate.snapshot().pendingAppend).toBe(false)
    expect(persist).not.toHaveBeenCalled(); expect(mutate).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([true, false])('same-deadline acknowledgement order is conservative (ack first %s)', async ackFirst => {
    vi.useFakeTimers()
    const gate = createHistoryTransitionGate(), ack = deferred<number>()
    const append = gate.append(1, () => ack.promise)
    const persist = vi.fn(async () => {}), mutate = vi.fn(async () => {})
    if (ackFirst) setTimeout(() => ack.resolve(1), 10)
    const change = gate.change(persist, mutate, 10).catch(error => error)
    if (!ackFirst) setTimeout(() => ack.resolve(1), 10)
    await vi.advanceTimersByTimeAsync(10); await append; await change
    expect(gate.snapshot().reason).toBe(ackFirst ? 'historyComplete' : 'drainTimedOut')
    expect(mutate).toHaveBeenCalledTimes(ackFirst ? 1 : 0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('callback may reenter change only after append registration', async () => {
    const gate = createHistoryTransitionGate(), ack = deferred<number>()
    let change!: Promise<void>
    const mutate = vi.fn(async () => {})
    const append = gate.append(1, () => { change = gate.change(async () => {}, mutate); return ack.promise })
    await flush(); expect(gate.snapshot().phase).toBe('draining'); expect(mutate).not.toHaveBeenCalled()
    ack.resolve(1); await append; await change
    expect(gate.snapshot().reason).toBe('historyComplete')
  })

  it.each([['fence', 'resolve'], ['fence', 'reject'], ['mutation', 'resolve'], ['mutation', 'reject']])('%s timeout stays held after late %s', async (stage, outcome) => {
    vi.useFakeTimers()
    const gate = createHistoryTransitionGate(), pending = deferred<void>()
    const persist = vi.fn(() => stage === 'fence' ? pending.promise : Promise.resolve())
    const mutate = vi.fn(() => stage === 'mutation' ? pending.promise : Promise.resolve())
    const change = gate.change(persist, mutate, 10).catch(error => error)
    await vi.advanceTimersByTimeAsync(10); await change
    expect(gate.snapshot().reason).toBe(stage === 'fence' ? 'fenceUncertain' : 'mutationUncertain')
    if (outcome === 'resolve') pending.resolve(); else pending.reject(new Error('private/path'))
    await flush()
    expect(gate.snapshot().phase).toBe('held')
    expect(mutate).toHaveBeenCalledTimes(stage === 'fence' ? 0 : 1)
    await expect(gate.change(persist, mutate)).rejects.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['fence', 'mutation'])('%s throw remains fixed and held', async stage => {
    const gate = createHistoryTransitionGate(), fail = () => { throw new Error('private/path') }
    const mutate = vi.fn(stage === 'mutation' ? fail : async () => {})
    const result = await gate.change(stage === 'fence' ? fail : async () => {}, mutate).catch(error => error)
    expect(result.message).toBe('History transition unavailable'); expect(result.cause).toBeUndefined()
    expect(gate.snapshot().reason).toBe(stage === 'fence' ? 'fenceUncertain' : 'mutationUncertain')
    expect(mutate).toHaveBeenCalledTimes(stage === 'fence' ? 0 : 1)
  })

  it('validates counts and deadline before dispatch or owner reservation', async () => {
    const gate = createHistoryTransitionGate(), operation = vi.fn(async () => 1)
    for (const n of [0, -1, NaN, Infinity, 1.5, 1001]) await expect(gate.append(n, operation)).rejects.toThrow()
    for (const n of [0, -1, NaN, Infinity, 1.5, 60001]) await expect(gate.change(async () => {}, async () => {}, n)).rejects.toThrow()
    expect(operation).not.toHaveBeenCalled(); expect(gate.snapshot().phase).toBe('open')
  })
})
