import { describe, it, expect } from 'vitest'
import { lttb, type Point } from './downsample'

function series(values: number[]): Point[] {
  return values.map((y, x) => ({ x, y }))
}

describe('lttb', () => {
  it('資料量小於門檻時原樣回傳', () => {
    const d = series([1, 2, 3])
    expect(lttb(d, 10)).toBe(d)
    expect(lttb(d, 3)).toBe(d)
  })

  it('門檻 <= 2 時不抽樣(避免退化成無意義的兩點)', () => {
    const d = series([1, 2, 3, 4, 5])
    expect(lttb(d, 2)).toBe(d)
  })

  it('抽樣後的點數等於門檻', () => {
    const d = series(Array.from({ length: 5000 }, (_, i) => Math.sin(i / 50) * 90))
    expect(lttb(d, 500)).toHaveLength(500)
  })

  it('首尾點一律保留(時間軸範圍不縮水)', () => {
    const d = series(Array.from({ length: 1000 }, (_, i) => i))
    const out = lttb(d, 100)
    expect(out[0]).toEqual(d[0])
    expect(out.at(-1)).toEqual(d.at(-1))
  })

  it('輸出維持 x 遞增', () => {
    const d = series(Array.from({ length: 3000 }, (_, i) => Math.cos(i / 30) * 45 + 45))
    const out = lttb(d, 300)
    for (let i = 1; i < out.length; i++) {
      expect(out[i].x).toBeGreaterThan(out[i - 1].x)
    }
  })

  it('保留孤立峰值——臨床上這正是要看的東西', () => {
    // 一條平坦的線,中間插一個尖峰(一次危險的超伸)
    const values = Array.from({ length: 2000 }, () => 10)
    values[977] = 165
    const out = lttb(series(values), 200)
    expect(out.some((p) => p.y === 165)).toBe(true)
  })

  it('均勻取樣會漏掉的峰,LTTB 抓得到(對照組)', () => {
    const values = Array.from({ length: 2000 }, () => 10)
    values[977] = 165
    const stride = Math.ceil(2000 / 200)
    const uniform = series(values).filter((_, i) => i % stride === 0)
    expect(uniform.some((p) => p.y === 165)).toBe(false) // 977 % 10 !== 0
    expect(lttb(series(values), 200).some((p) => p.y === 165)).toBe(true)
  })

  it('保留多個峰值', () => {
    const values = Array.from({ length: 4000 }, () => 5)
    for (const i of [301, 1123, 2517, 3733]) values[i] = 120 + (i % 7)
    const out = lttb(series(values), 400)
    for (const i of [301, 1123, 2517, 3733]) {
      expect(out.some((p) => p.x === i)).toBe(true)
    }
  })
})
