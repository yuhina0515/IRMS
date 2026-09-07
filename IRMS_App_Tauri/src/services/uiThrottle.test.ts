// createTrailingThrottle 單元測試:首筆即發、區間內合併、尾緣保證、cancel 丟棄
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTrailingThrottle } from './uiThrottle'

describe('createTrailingThrottle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function make(): { pushed: number[]; throttle: ReturnType<typeof createTrailingThrottle<number>> } {
    const pushed: number[] = []
    const throttle = createTrailingThrottle<number>(80, (v) => pushed.push(v), () => Date.now())
    return { pushed, throttle }
  }

  it('首筆立即送出(不等一個完整區間)', () => {
    const { pushed, throttle } = make()
    throttle.queue(1)
    vi.advanceTimersByTime(0)
    expect(pushed).toEqual([1])
  })

  it('區間內多筆合併,只送最後一筆(trailing)', () => {
    const { pushed, throttle } = make()
    throttle.queue(1)
    vi.advanceTimersByTime(0) // 首筆送出
    throttle.queue(2)
    vi.advanceTimersByTime(40)
    throttle.queue(3) // 覆蓋 pending 的 2
    vi.advanceTimersByTime(40) // 滿 80ms
    expect(pushed).toEqual([1, 3])
  })

  it('資料流停止後,最後一筆仍保證送達', () => {
    const { pushed, throttle } = make()
    throttle.queue(1)
    vi.advanceTimersByTime(0)
    throttle.queue(2) // 之後不再有資料
    vi.advanceTimersByTime(200)
    expect(pushed).toEqual([1, 2])
  })

  it('cancel 丟棄 pending,之後 queue 恢復運作', () => {
    const { pushed, throttle } = make()
    throttle.queue(1)
    vi.advanceTimersByTime(0)
    throttle.queue(2)
    throttle.cancel() // 2 被丟棄
    vi.advanceTimersByTime(200)
    expect(pushed).toEqual([1])
    throttle.queue(3)
    vi.advanceTimersByTime(200)
    expect(pushed).toEqual([1, 3])
  })

  it('推送頻率不超過 1/intervalMs:連續灌入 25Hz,80ms 內至多一筆', () => {
    const { pushed, throttle } = make()
    for (let i = 0; i < 25; i++) {
      throttle.queue(i)
      vi.advanceTimersByTime(40) // 25Hz
    }
    vi.advanceTimersByTime(100) // 讓尾緣 flush 完成
    // 1000ms / 80ms ≈ 12.5 → 首筆 + 每滿 80ms 一筆,遠低於 25 筆
    expect(pushed.length).toBeLessThanOrEqual(14)
    expect(pushed.at(-1)).toBe(24) // 最後一筆送達
  })
})
