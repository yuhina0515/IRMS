import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CalibrationWizardB } from './CalibrationWizardB'
import { ConfirmDialog } from './ConfirmDialog'
import { ErrorOverlay } from './ErrorOverlay'
import { bluetoothService } from '../services/bluetooth'
import { getT } from '../i18n'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { pushEscapeHandler } from '../services/escapeStack'

vi.mock('../services/bluetooth', () => ({ bluetoothService: {
  onRawMotion: vi.fn(() => vi.fn()),
  enableRawStream: vi.fn(async () => undefined),
  send: vi.fn(async () => undefined),
  disconnect: vi.fn(async () => undefined)
} }))
beforeEach(() => {
  vi.clearAllMocks()
  useStore.getState().resetSession()
  useStore.setState((s) => ({ hardwareError: null, settings: { ...s.settings, language: 'zh-Hant', wearSide: null } }))
  useUiStore.setState({ confirm: null })
})
afterEach(() => { cleanup(); useStore.setState({ hardwareError: null }); vi.useRealTimers() })

it('owns a named body portal and restores the invoker under StrictMode without leaking raw listeners', () => {
  const invoker = document.createElement('button')
  document.body.append(invoker); invoker.focus()
  const view = render(<StrictMode><CalibrationWizardB onClose={() => {}} /></StrictMode>)
  try {
    const close = screen.getByRole('button', { name: getT().common.close })
    expect(close).toHaveFocus()
    const dialog = screen.getByRole('dialog', { name: new RegExp(getT().calibrationB.title) })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(view.container).not.toContainElement(dialog)
    expect(view.container).toHaveAttribute('inert')
    view.unmount()
    expect(invoker).toHaveFocus()
    expect(view.container).not.toHaveAttribute('inert')
    expect(bluetoothService.enableRawStream).toHaveBeenLastCalledWith(false)
    for (const result of vi.mocked(bluetoothService.onRawMotion).mock.results) expect(result.value).toHaveBeenCalledOnce()
  } finally { view.unmount(); invoker.remove() }
})

it.each(['zh-Hant', 'en'] as const)('exposes %s keyboard side selection and Close without persisting', async (language) => {
  useStore.setState((s) => ({ settings: { ...s.settings, language } }))
  const settings = useStore.getState().settings
  const user = userEvent.setup()
  const close = vi.fn()
  render(<CalibrationWizardB onClose={close} />)
  const m = getT()
  const closeButton = screen.getByRole('button', { name: m.common.close })
  const left = screen.getByRole('button', { name: m.clinical.terms.leftLeg, pressed: false })
  const right = screen.getByRole('button', { name: m.clinical.terms.rightLeg, pressed: false })
  await user.tab()
  expect(left).toHaveFocus()
  await user.keyboard(' ')
  expect(left).toHaveAttribute('aria-pressed', 'true')
  await user.tab()
  expect(right).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(right).toHaveAttribute('aria-pressed', 'true')
  expect(left).toHaveAttribute('aria-pressed', 'false')
  await user.tab()
  expect(closeButton).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(close).toHaveBeenCalledOnce()
  expect(useStore.getState().settings).toBe(settings)
})

it.each(['left', 'right'] as const)('exposes saved %s without changing detection gating', (side) => {
  useStore.setState((s) => ({ settings: { ...s.settings, wearSide: side } }))
  render(<CalibrationWizardB onClose={() => {}} />)
  const m = getT()
  expect(screen.getByRole('button', { name: m.clinical.terms.leftLeg, pressed: side === 'left' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: m.clinical.terms.rightLeg, pressed: side === 'right' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: m.common.start })).toBeDisabled()
})

it('retains raw detection delay and capture Escape ownership with explicit Close cleanup', async () => {
  vi.useFakeTimers()
  const close = vi.fn()
  const background = vi.fn()
  const view = render(<CalibrationWizardB onClose={close} />)
  const remove = pushEscapeHandler(background)
  try {
    fireEvent.click(screen.getByRole('button', { name: getT().clinical.terms.leftLeg }))
    const start = screen.getByRole('button', { name: getT().common.start })
    await act(async () => { await vi.advanceTimersByTimeAsync(2499) })
    expect(start).toBeDisabled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(start).not.toBeDisabled()
    fireEvent.click(start)
    fireEvent.click(screen.getByRole('button', { name: getT().calibrationB.capture }))
    expect(screen.getByRole('button', { name: /3…/ })).toBeDisabled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(background).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: getT().common.close }))
    expect(close).toHaveBeenCalledOnce()
    view.unmount()
    expect(bluetoothService.enableRawStream).toHaveBeenLastCalledWith(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  } finally { remove(); view.unmount() }
})

it('yields to real confirmation then emergency and resumes without restarting raw stream', async () => {
  const close = vi.fn()
  render(<><CalibrationWizardB onClose={close} /><ConfirmDialog /><ErrorOverlay /></>)
  const right = screen.getByRole('button', { name: getT().clinical.terms.rightLeg })
  right.focus()
  act(() => { void useUiStore.getState().requestConfirm('B confirm', 'Decision') })
  expect(screen.getByRole('button', { name: getT().common.cancel })).toHaveFocus()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(close).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  await waitFor(() => expect(right).toHaveFocus())
  act(() => useStore.setState({ hardwareError: 'ERR:1' }))
  expect(screen.getByRole('button', { name: getT().common.disconnect })).toHaveFocus()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(close).not.toHaveBeenCalled()
  act(() => useStore.setState({ hardwareError: null }))
  await waitFor(() => expect(right).toHaveFocus())
  expect(bluetoothService.enableRawStream).toHaveBeenCalledTimes(1)
  expect(bluetoothService.enableRawStream).toHaveBeenCalledWith(true)
})
