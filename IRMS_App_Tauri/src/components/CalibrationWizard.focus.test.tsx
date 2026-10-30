import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CalibrationWizard } from './CalibrationWizard'
import { ConfirmDialog } from './ConfirmDialog'
import { ErrorOverlay } from './ErrorOverlay'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { getT } from '../i18n'
import { pushEscapeHandler } from '../services/escapeStack'

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined) }))
beforeEach(() => {
  useStore.getState().resetSession()
  useStore.setState((s) => ({ hardwareError: null, isConnected: true, settings: { ...s.settings, language: 'zh-Hant', wearSide: null } }))
  useUiStore.setState({ confirm: null })
})
afterEach(() => { cleanup(); useStore.setState({ hardwareError: null }); vi.useRealTimers(); vi.restoreAllMocks() })

it('portals the named wizard outside its host and owns/restores focus under StrictMode', async () => {
  const outside = document.createElement('button')
  outside.textContent = 'Invoker'
  document.body.append(outside)
  outside.focus()
  const view = render(<StrictMode><CalibrationWizard onClose={() => {}} /></StrictMode>)
  try {
    const close = screen.getByRole('button', { name: getT().common.close })
    expect(close).toHaveFocus()
    const dialog = screen.getByRole('dialog', { name: getT().calibration.title })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(view.container).not.toContainElement(dialog)
    expect(view.container).toHaveAttribute('inert')
    view.unmount()
    expect(outside).toHaveFocus()
    expect(view.container).not.toHaveAttribute('inert')
  } finally { view.unmount(); outside.remove() }
})

it('wraps Tab, blocks background focus/pointers and repairs disabled/removed controls', async () => {
  const click = vi.fn()
  const user = userEvent.setup()
  render(<><button onClick={click}>Background</button><CalibrationWizard onClose={() => {}} /></>)
  const outside = screen.getByText('Background')
  const close = screen.getByRole('button', { name: getT().common.close })
  const right = screen.getByRole('button', { name: getT().clinical.terms.rightLeg })
  await user.tab({ shift: true })
  expect(right).toHaveFocus()
  await user.tab()
  expect(close).toHaveFocus()
  outside.focus()
  expect(close).toHaveFocus()
  fireEvent.click(outside)
  expect(click).not.toHaveBeenCalled()
  right.focus()
  right.setAttribute('disabled', '')
  await waitFor(() => expect(close).toHaveFocus())
  right.removeAttribute('disabled')
  right.focus()
  right.remove()
  await waitFor(() => expect(close).toHaveFocus())
})

it('keeps capture Escape from a later background handler while explicit Close still works', async () => {
  vi.useFakeTimers()
  const close = vi.fn()
  const lower = vi.fn()
  const view = render(<CalibrationWizard onClose={close} />)
  const remove = pushEscapeHandler(lower)
  try {
    fireEvent.click(screen.getByRole('button', { name: getT().clinical.terms.leftLeg }))
    fireEvent.click(screen.getByRole('button', { name: getT().common.start }))
    const capture = screen.getByRole('button', { name: getT().calibration.captureButton })
    capture.focus()
    fireEvent.click(capture)
    await act(async () => {})
    expect(screen.getByRole('button', { name: /3…/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: getT().common.close })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(lower).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: getT().common.close }))
    expect(close).toHaveBeenCalledOnce()
    view.unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  } finally { remove(); view.unmount() }
})

it.each([false, true])('yields to real confirmation including closing and resumes its control (reverse=%s)', async (reverse) => {
  const onClose = vi.fn()
  render(reverse ? <><ConfirmDialog /><CalibrationWizard onClose={onClose} /></> : <><CalibrationWizard onClose={onClose} /><ConfirmDialog /></>)
  const left = screen.getByRole('button', { name: getT().clinical.terms.leftLeg })
  left.focus()
  act(() => { void useUiStore.getState().requestConfirm('Confirm fixture', 'Decision') })
  const cancel = screen.getByRole('button', { name: getT().common.cancel })
  expect(cancel).toHaveFocus()
  expect(cancel.closest('[inert]')).toBeNull()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(onClose).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  await waitFor(() => expect(left).toHaveFocus())
  expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledOnce()
})

it.each([false, true])('yields to emergency recovery without focus loops (reverse=%s)', async (reverse) => {
  const onClose = vi.fn()
  render(reverse ? <><ErrorOverlay /><CalibrationWizard onClose={onClose} /></> : <><CalibrationWizard onClose={onClose} /><ErrorOverlay /></>)
  const left = screen.getByRole('button', { name: getT().clinical.terms.leftLeg })
  left.focus()
  act(() => useStore.setState({ hardwareError: 'ERR:1' }))
  const disconnect = screen.getByRole('button', { name: getT().common.disconnect })
  expect(disconnect).toHaveFocus()
  expect(disconnect.closest('[inert]')).toBeNull()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(onClose).not.toHaveBeenCalled()
  act(() => useStore.setState({ hardwareError: null }))
  await waitFor(() => expect(left).toHaveFocus())
})

it('does not restore background focus when wizard unmounts during an emergency', () => {
  const invoker = document.createElement('button')
  document.body.append(invoker); invoker.focus()
  const focus = vi.spyOn(invoker, 'focus')
  const view = render(<><CalibrationWizard onClose={() => {}} /><ErrorOverlay /></>)
  act(() => useStore.setState({ hardwareError: 'ERR:1' }))
  focus.mockClear()
  view.rerender(<>{null}<ErrorOverlay /></>)
  expect(screen.getByRole('button', { name: getT().common.disconnect })).toHaveFocus()
  expect(focus).not.toHaveBeenCalled()
  view.unmount(); invoker.remove()
})

it('a wizard mounted below an existing emergency cannot take its focus or Escape', () => {
  useStore.setState({ hardwareError: 'ERR:1' })
  const close = vi.fn()
  const view = render(<><ErrorOverlay />{null}</>)
  const disconnect = screen.getByRole('button', { name: getT().common.disconnect })
  view.rerender(<><ErrorOverlay /><CalibrationWizard onClose={close} /></>)
  expect(disconnect).toHaveFocus()
  expect(disconnect.closest('[inert]')).toBeNull()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(close).not.toHaveBeenCalled()
})

it('a later wizard stays below an existing confirmation and resumes after its closing interval', async () => {
  const close = vi.fn()
  const view = render(<><ConfirmDialog />{null}</>)
  act(() => { void useUiStore.getState().requestConfirm('Existing confirm', 'Decision') })
  const cancel = screen.getByRole('button', { name: getT().common.cancel })
  view.rerender(<><ConfirmDialog /><CalibrationWizard onClose={close} /></>)
  expect(cancel).toHaveFocus()
  expect(cancel.closest('.overlay')).toHaveStyle({ zIndex: '1200' })
  expect(cancel.closest('[inert]')).toBeNull()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(close).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  await waitFor(() => expect(screen.getByRole('button', { name: getT().common.close })).toHaveFocus())
})
