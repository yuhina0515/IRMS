// --- 尾緣節流 (trailing throttle) ---
// 高頻資料流(25Hz BLE)餵 UI 的減壓閥:推送頻率上限 1000/intervalMs Hz,
// 且保證「最後一筆一定送達」(trailing)——資料流停止時 UI 不會卡在舊值。
// 判定引擎與 DB 緩衝不經過此層,永遠吃全速資料。

export interface TrailingThrottle<T> {
  queue(value: T): void
  /** 丟棄未送出的 pending 值(要直接寫入精確值前呼叫,防止稍後被舊值蓋回) */
  cancel(): void
}

export function createTrailingThrottle<T>(
  intervalMs: number,
  push: (value: T) => void,
  /** 可注入的時間來源,便於測試 */
  now: () => number = () => Date.now()
): TrailingThrottle<T> {
  let pending: { value: T } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastPushAt = -Infinity

  const flush = (): void => {
    timer = null
    if (!pending) return
    const { value } = pending
    pending = null
    lastPushAt = now()
    push(value)
  }

  return {
    queue(value: T): void {
      pending = { value }
      if (timer == null) {
        const wait = Math.max(0, intervalMs - (now() - lastPushAt))
        timer = setTimeout(flush, wait)
      }
    },
    cancel(): void {
      if (timer != null) clearTimeout(timer)
      timer = null
      pending = null
    }
  }
}
