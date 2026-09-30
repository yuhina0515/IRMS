// Regression for 2026-09-27: after opening a session review and going back, History showed one
// session per page because the hook kept observing the unmounted list body.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { usePageSize } from './usePageSize'

class FakeResizeObserver {
  static all: FakeResizeObserver[] = []
  targets: Element[] = []
  constructor(private cb: () => void) {
    FakeResizeObserver.all.push(this)
  }
  observe(el: Element): void {
    this.targets.push(el)
  }
  disconnect(): void {
    this.targets = []
  }
  fire(): void {
    this.cb()
  }
}

let original: typeof ResizeObserver | undefined
beforeEach(() => {
  original = globalThis.ResizeObserver
  FakeResizeObserver.all = []
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 400 })
})
afterEach(() => {
  globalThis.ResizeObserver = original as typeof ResizeObserver
  delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight
})

function List(): JSX.Element {
  const [reviewing, setReviewing] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const rows = usePageSize(ref, 50, 6)
  if (reviewing) return <button onClick={() => setReviewing(false)}>back</button>
  return (
    <div ref={ref}>
      <span>rows {rows}</span>
      <button onClick={() => setReviewing(true)}>review</button>
    </div>
  )
}

describe('usePageSize', () => {
  it('keeps the page size after the list is unmounted and mounted again', () => {
    render(<List />)
    expect(screen.getByText('rows 8')).toBeInTheDocument()
    act(() => screen.getByText('review').click())
    // The old observer reports the detached body (height would read 0 in a browser).
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 0 })
    act(() => FakeResizeObserver.all.forEach((o) => o.fire()))
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 400 })
    act(() => screen.getByText('back').click())
    expect(screen.getByText('rows 8')).toBeInTheDocument()
    const live = FakeResizeObserver.all.filter((o) => o.targets.length > 0)
    expect(live).toHaveLength(1)
    expect(live[0].targets[0].isConnected).toBe(true)
  })
})
