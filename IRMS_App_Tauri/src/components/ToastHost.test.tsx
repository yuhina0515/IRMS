import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useUiStore } from '../store/useUiStore'
import { ToastHost } from './ToastHost'

afterEach(() => useUiStore.setState({ toasts: [] }))

it('updates persistent polite and urgent regions when asynchronous notifications arrive', () => {
  useUiStore.setState({ toasts: [] })
  render(<ToastHost />)
  const status = screen.getByRole('status')
  const alert = screen.getByRole('alert')
  expect(status).toBeEmptyDOMElement()
  expect(alert).toBeEmptyDOMElement()

  act(() => useUiStore.setState({ toasts: [
    { id: 1, type: 'success', message: 'Saved' },
    { id: 2, type: 'error', message: 'Connection failed' }
  ] }))
  expect(screen.getByRole('status')).toBe(status)
  expect(status).toHaveTextContent('Saved')
  expect(status).not.toHaveTextContent('Connection failed')
  expect(alert).toHaveTextContent('Connection failed')
})
