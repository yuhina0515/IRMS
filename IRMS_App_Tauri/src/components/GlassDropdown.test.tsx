import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GlassDropdown } from './GlassDropdown'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
describe('dropdown viewport placement', () => {
  it('opens upward at the bottom edge, clamps horizontally and selects an option', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 730, bottom: 760, left: 970, width: 140, height: 30 } as DOMRect)
    const change = vi.fn()
    render(<GlassDropdown value="a" options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]} onChange={change} />)
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
    const popup = screen.getByRole('listbox')
    expect(parseFloat(popup.style.top)).toBeLessThan(730)
    expect(parseFloat(popup.style.left) + parseFloat(popup.style.width)).toBeLessThanOrEqual(window.innerWidth - 8)
    expect(popup.style.overflowY).toBe('auto')
    fireEvent.click(screen.getByRole('option', { name: 'Beta' }))
    expect(change).toHaveBeenCalledWith('b')
  })
  it('repositions on resize and constrains a long list to the available height', () => {
    let bottom = 100
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ top: bottom - 30, bottom, left: 10, width: 200, height: 30 }) as DOMRect)
    render(<GlassDropdown value="0" options={Array.from({ length: 30 }, (_, i) => ({ value: `${i}`, label: `Option ${i}` }))} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button'))
    const popup = screen.getByRole('listbox')
    expect(parseFloat(popup.style.top)).toBe(106)
    bottom = window.innerHeight - 8
    fireEvent.resize(window)
    expect(parseFloat(popup.style.top)).toBeLessThan(bottom - 30)
    expect(parseFloat(popup.style.top) + parseFloat(popup.style.maxHeight)).toBeLessThanOrEqual(window.innerHeight - 8)
  })
})
