import { describe, expect, it } from 'vitest'

if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size
      }
    },
    configurable: true
  })
}

describe('requestConfirm', () => {
  it('a second request resolves the replaced one as cancelled instead of leaving it pending', async () => {
    const { useUiStore } = await import('./useUiStore')
    const first = useUiStore.getState().requestConfirm('a', 'first')
    const second = useUiStore.getState().requestConfirm('b', 'second')
    await expect(first).resolves.toBe(false)
    useUiStore.getState().resolveConfirm(true)
    await expect(second).resolves.toBe(true)
  })
})
