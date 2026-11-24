import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ErrorOverlay } from './ErrorOverlay'
import { useStore } from '../store/useStore'
import { getT } from '../i18n'
import { ConfirmDialog } from './ConfirmDialog'
import { useUiStore } from '../store/useUiStore'
import { installIrmsStub } from '../test/irmsApiStub'
import { bluetoothService } from '../services/bluetooth'
import { pushEscapeHandler } from '../services/escapeStack'
import { isolateBody } from '../services/modalIsolation'

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined) }))
beforeEach(() => { installIrmsStub(); useStore.getState().resetSession(); useStore.setState({ hardwareError: null }); useUiStore.setState({ confirm: null }) })
afterEach(() => { cleanup(); useStore.setState({ hardwareError: null }); vi.restoreAllMocks() })

it('standalone hardware alert takes focus and exposes an accessible emergency dialog', () => {
  const outside = document.createElement('button')
  outside.textContent = 'Prior control'
  document.body.append(outside); outside.focus()
  const { unmount } = render(<ErrorOverlay />)
  act(() => useStore.setState({ hardwareError: 'ERR:1' }))
  expect(screen.getByRole('button', { name: getT().common.disconnect })).toHaveFocus()
  expect(screen.getByRole('alertdialog', { name: getT().errorOverlay.title })).toHaveAttribute('aria-modal', 'true')
  unmount(); outside.remove()
})

it('contains Tab/programmatic focus/pointers and consumes Escape without dismissing or reaching later layers', async () => {
  const click = vi.fn()
  const user = userEvent.setup()
  useStore.getState().patchSession({ id: 7, running: true })
  useStore.setState({ hardwareError: 'ERR:1' })
  render(<><button onClick={click}>Background</button><ErrorOverlay /></>)
  const save = screen.getByRole('button', { name: getT().common.endAndSaveSession })
  const disconnect = screen.getByRole('button', { name: getT().common.disconnect })
  expect(save).toHaveFocus()
  await user.tab({ shift: true }); expect(disconnect).toHaveFocus()
  await user.tab(); expect(save).toHaveFocus()
  screen.getByRole('button', { name: 'Background', hidden: true }).focus()
  expect(save).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Background', hidden: true }))
  expect(click).not.toHaveBeenCalled()
  const laterLayer = vi.fn()
  const remove = pushEscapeHandler(laterLayer)
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(laterLayer).not.toHaveBeenCalled()
  expect(useStore.getState().hardwareError).toBe('ERR:1')
  remove()
})

it('moves focus away from a saving/removed control while preserving actual save/disconnect actions', async () => {
  const stub = installIrmsStub()
  let finish!: (value: { success: true }) => void
  stub.sessions.end.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const disconnect = vi.spyOn(bluetoothService, 'disconnect').mockResolvedValue(undefined)
  useStore.getState().patchSession({ id: 7, running: true, reps: 3 })
  useStore.setState({ hardwareError: 'ERR:1' })
  render(<ErrorOverlay />)
  await userEvent.click(screen.getByRole('button', { name: getT().common.endAndSaveSession }))
  expect(screen.getByRole('button', { name: getT().sessionDock.blocker.finishing })).toBeDisabled()
  await act(async () => {})
  expect(screen.getByRole('button', { name: getT().common.disconnect })).toHaveFocus()
  await act(async () => finish({ success: true }))
  expect(stub.sessions.end).toHaveBeenCalledWith(7, 3)
  expect(screen.queryByRole('button', { name: getT().common.endAndSaveSession })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: getT().common.disconnect })).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: getT().common.disconnect }))
  expect(disconnect).toHaveBeenCalledTimes(1)
})

it('releases isolation and restores eligible prior focus through StrictMode and recovery', () => {
  const outside = document.createElement('button')
  const preserved = document.createElement('div')
  preserved.setAttribute('inert', 'preserved')
  document.body.append(outside, preserved); outside.focus()
  useStore.setState({ hardwareError: 'ERR:1' })
  const { unmount } = render(<StrictMode><ErrorOverlay /></StrictMode>)
  expect(outside).toHaveAttribute('inert')
  act(() => useStore.setState({ hardwareError: null }))
  expect(outside).not.toHaveAttribute('inert')
  expect(outside).toHaveFocus()
  expect(preserved).toHaveAttribute('inert', 'preserved')
  unmount(); outside.remove(); preserved.remove()
})

it('already-active emergency rejects new confirmation without losing its own focus', async () => {
  useStore.setState({ hardwareError: 'ERR:1' })
  render(<StrictMode><ConfirmDialog /><ErrorOverlay /></StrictMode>)
  let decision!: Promise<boolean>
  act(() => { decision = useUiStore.getState().requestConfirm('Late confirm', 'No action') })
  await expect(decision).resolves.toBe(false)
  expect(screen.getAllByRole('alertdialog')).toHaveLength(1)
  expect(screen.getByRole('button', { name: getT().common.disconnect })).toHaveFocus()
})

it('falls back to the dialog when all controls are unavailable and resumes normal Tab when enabled', async () => {
  useStore.setState({ hardwareError: 'ERR:1' })
  render(<ErrorOverlay />)
  const dialog = screen.getByRole('alertdialog')
  const disconnect = screen.getByRole('button', { name: getT().common.disconnect }) as HTMLButtonElement
  await act(async () => { disconnect.disabled = true })
  expect(dialog).toHaveFocus()
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
  expect(dialog).toHaveFocus()
  await act(async () => { disconnect.disabled = false })
  fireEvent.keyDown(dialog, { key: 'Tab' })
  expect(disconnect).toHaveFocus()
})

for (const reverse of [false, true]) {
  for (const closing of [false, true]) {
    it(`takes over real confirmation and restores its invoker (reverse=${reverse}, closing=${closing})`, async () => {
      const outside = document.createElement('button')
      document.body.append(outside); outside.focus()
      const { container, unmount } = render(reverse ? <><ErrorOverlay /><ConfirmDialog /></> : <><ConfirmDialog /><ErrorOverlay /></>)
      let decision!: Promise<boolean>
      act(() => { decision = useUiStore.getState().requestConfirm('Confirm fixture', 'No action') })
      if (closing) act(() => useUiStore.getState().resolveConfirm(false))
      await act(async () => useStore.setState({ hardwareError: 'ERR:1' }))
      await expect(decision).resolves.toBe(false)
      expect(screen.getByRole('button', { name: getT().common.disconnect })).toHaveFocus()
      expect(container).toHaveAttribute('inert')
      expect(screen.getByRole('alertdialog', { name: getT().errorOverlay.title }).closest('[inert]')).toBeNull()
      await act(async () => useStore.setState({ hardwareError: null }))
      expect(outside).toHaveFocus()
      expect(container).not.toHaveAttribute('inert')
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      unmount(); outside.remove()
    })
  }
}

it('overlapping isolation leases cannot release another owner or lose original attributes', async () => {
  const background = document.createElement('div')
  const a = document.createElement('div')
  const b = document.createElement('div')
  document.body.append(background, a, b)
  const releaseA = isolateBody(a)
  const releaseB = isolateBody(b)
  releaseA()
  expect(background).toHaveAttribute('inert')
  const added = document.createElement('div')
  document.body.append(added)
  await act(async () => {})
  expect(added).toHaveAttribute('inert')
  releaseB(); releaseA()
  expect(background).not.toHaveAttribute('inert')
  expect(added).not.toHaveAttribute('inert')
  background.remove(); a.remove(); b.remove(); added.remove()
})
