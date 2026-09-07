import { describe, it, expect, afterEach } from 'vitest'
import { dispatchEscape, escapeStackDepth, pushEscapeHandler } from './escapeStack'

// 堆疊是模組層級的單例(整個 app 只有一個 Esc 派送點),測試間必須清乾淨
const cleanups: Array<() => void> = []
const track = (fn: () => void): (() => void) => {
  const off = pushEscapeHandler(fn)
  cleanups.push(off)
  return off
}

afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
  expect(escapeStackDepth()).toBe(0)
})

describe('escapeStack', () => {
  it('沒有處理者時回報未處理(不應吞掉 Esc)', () => {
    expect(dispatchEscape()).toBe(false)
  })

  it('只呼叫最上層,不會連下層一起關掉', () => {
    // 這正是原本「每層各掛一個 window capture listener + stopPropagation」的漏洞:
    // stopPropagation 擋不住同一個目標上的兄弟 listener,於是在歷史分析視窗上開啟
    // 刪除確認框時,一次 Esc 會把確認框與歷史視窗一起關掉。
    const closed: string[] = []
    track(() => closed.push('history'))
    track(() => closed.push('confirm'))

    expect(dispatchEscape()).toBe(true)
    expect(closed).toEqual(['confirm'])
  })

  it('最上層移除後,下一次 Esc 才輪到下一層', () => {
    const closed: string[] = []
    track(() => closed.push('wizard'))
    const offTop = pushEscapeHandler(() => closed.push('confirm'))

    dispatchEscape()
    offTop()
    dispatchEscape()

    expect(closed).toEqual(['confirm', 'wizard'])
  })

  it('中間層先移除時,剩下的順序仍然正確', () => {
    const closed: string[] = []
    track(() => closed.push('a'))
    const offMiddle = pushEscapeHandler(() => closed.push('b'))
    track(() => closed.push('c'))

    offMiddle()
    dispatchEscape()
    expect(closed).toEqual(['c'])
    expect(escapeStackDepth()).toBe(2)
  })

  it('移除函式重複呼叫不會誤刪別人', () => {
    const closed: string[] = []
    track(() => closed.push('keep'))
    const off = pushEscapeHandler(() => closed.push('gone'))

    off()
    off()
    off()

    expect(escapeStackDepth()).toBe(1)
    dispatchEscape()
    expect(closed).toEqual(['keep'])
  })

  it('派送時讀的是最新的處理者行為(hook 以 ref 轉發)', () => {
    // useEscapeKey 推入的是 `() => handlerRef.current?.()`,推入後不再重掛;
    // 因此堆疊必須在派送當下才解參考,否則會呼叫到過期的 closure。
    let target = 'old'
    const ref = { current: (): void => { target = 'first' } }
    track(() => ref.current())

    ref.current = (): void => { target = 'second' }
    dispatchEscape()

    expect(target).toBe('second')
  })
})
