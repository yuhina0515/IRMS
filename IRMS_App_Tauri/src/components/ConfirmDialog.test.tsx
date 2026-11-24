import { act, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useUiStore } from '../store/useUiStore'
import { useStore } from '../store/useStore'
import { getT } from '../i18n'
import { ConfirmDialog } from './ConfirmDialog'
import { pushEscapeHandler } from '../services/escapeStack'

beforeEach(() => {
  useUiStore.setState({ confirm: null })
  useStore.setState({ hardwareError: null })
})

afterEach(() => {
  act(() => useUiStore.getState().resolveConfirm(false))
  vi.restoreAllMocks()
})

it('keeps forward and reverse keyboard traversal inside the confirmation', async () => {
  const user = userEvent.setup()
  render(<>
    <button onClick={() => { void useUiStore.getState().requestConfirm('Delete record', 'This cannot be undone.') }}>Open</button>
    <button>Background</button>
    <ConfirmDialog />
  </>)
  await user.click(screen.getByRole('button', { name: 'Open' }))
  const cancel = screen.getByRole('button', { name: getT().common.cancel })
  const confirm = screen.getByRole('button', { name: getT().common.confirm })
  expect(cancel).toHaveFocus()
  await user.tab()
  expect(confirm).toHaveFocus()
  await user.tab()
  expect(cancel).toHaveFocus()
  await user.tab({ shift: true })
  expect(confirm).toHaveFocus()
})

it('blocks external focus and activation, then restores the invoker after animated closing', async () => {
  const user = userEvent.setup()
  const background = vi.fn()
  const decided = vi.fn()
  const lowerEscape = vi.fn()
  const removeEscape = pushEscapeHandler(lowerEscape)
  const view = render(<>
    <button onClick={() => { void useUiStore.getState().requestConfirm('Delete', 'Irreversible.').then(decided) }}>Open</button>
    <button onClick={background}>Background</button>
    <ConfirmDialog />
  </>)
  try {
    const opener = screen.getByRole('button', { name: 'Open' })
    const outside = screen.getByRole('button', { name: 'Background' })
    await user.click(opener)
    expect(view.container).toHaveAttribute('inert')
    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription('Irreversible.')
    outside.focus()
    expect(screen.getByRole('button', { name: getT().common.cancel })).toHaveFocus()
    await user.click(outside)
    expect(background).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: getT().common.cancel }))
    expect(decided).toHaveBeenCalledExactlyOnceWith(false)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: getT().common.confirm })).toBeDisabled()
    await user.keyboard('{Enter}{Escape}')
    expect(lowerEscape).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(view.container).not.toHaveAttribute('inert')
    expect(opener).toHaveFocus()
    await user.click(outside)
    expect(background).toHaveBeenCalledOnce()
  } finally {
    removeEscape()
  }
})

it('Escape cancels only the top confirmation and preserves underlying Escape handlers', async () => {
  const user = userEvent.setup()
  const lower = vi.fn()
  const remove = pushEscapeHandler(lower)
  render(<ConfirmDialog />)
  let decision!: Promise<boolean>
  try {
    act(() => { decision = useUiStore.getState().requestConfirm('Delete', 'Confirm deletion') })
    await user.keyboard('{Escape}')
    await expect(decision).resolves.toBe(false)
    expect(lower).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await user.keyboard('{Escape}')
    expect(lower).toHaveBeenCalledOnce()
  } finally {
    remove()
  }
})

it('replaces a closing request without losing the original invoker or running the old removal timer', async () => {
  const user = userEvent.setup()
  const first = vi.fn()
  render(<>
    <button onClick={() => { void useUiStore.getState().requestConfirm('First', 'First request').then(first) }}>Open</button>
    <ConfirmDialog />
  </>)
  const opener = screen.getByRole('button', { name: 'Open' })
  await user.click(opener)
  await user.click(screen.getByRole('button', { name: getT().common.cancel }))
  let replacement!: Promise<boolean>
  act(() => { replacement = useUiStore.getState().requestConfirm('Replacement', 'Second request') })
  expect(first).toHaveBeenCalledExactlyOnceWith(false)
  expect(screen.getByRole('button', { name: getT().common.cancel })).toHaveFocus()
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 180)) })
  expect(screen.getByRole('alertdialog', { name: 'Replacement' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: getT().common.confirm }))
  await expect(replacement).resolves.toBe(true)
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  expect(opener).toHaveFocus()
})

it('preserves existing inert attributes, isolates new body siblings and cleans up on unmount', async () => {
  const preserved = document.createElement('aside')
  preserved.setAttribute('inert', 'preserved')
  const invoker = document.createElement('button')
  const late = document.createElement('button')
  const clicked = vi.fn()
  late.onclick = clicked
  document.body.append(preserved, invoker)
  const view = render(<ConfirmDialog />)
  invoker.focus()
  try {
    act(() => { void useUiStore.getState().requestConfirm('Delete', 'Confirm') })
    document.body.append(late)
    await waitFor(() => expect(late).toHaveAttribute('inert'))
    late.click()
    expect(clicked).not.toHaveBeenCalled()
    view.unmount()
    expect(preserved).toHaveAttribute('inert', 'preserved')
    expect(late).not.toHaveAttribute('inert')
    expect(invoker).not.toHaveAttribute('inert')
    expect(invoker).toHaveFocus()
    late.click()
    expect(clicked).toHaveBeenCalledOnce()
  } finally {
    preserved.remove()
    invoker.remove()
    late.remove()
  }
})

it.each(['removed', 'disabled'])('does not restore focus to an invoker that becomes %s', async (state) => {
  const user = userEvent.setup()
  const invoker = document.createElement('button')
  document.body.append(invoker)
  render(<ConfirmDialog />)
  invoker.focus()
  try {
    act(() => { void useUiStore.getState().requestConfirm('Delete', 'Confirm') })
    if (state === 'removed') invoker.remove()
    else invoker.disabled = true
    await user.click(screen.getByRole('button', { name: getT().common.cancel }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(invoker).not.toHaveFocus()
    expect(document.querySelector('[inert]')).toBeNull()
  } finally {
    invoker.remove()
  }
})

it.each([false, true])('lets a hardware emergency take over immediately, including closing=%s', async (closing) => {
  const user = userEvent.setup()
  const decided = vi.fn()
  function Harness(): JSX.Element {
    const error = useStore((s) => s.hardwareError)
    return <>
      <button onClick={() => { void useUiStore.getState().requestConfirm('Delete', 'Confirm').then(decided) }}>Open</button>
      <ConfirmDialog />
      {error && <div className="error-overlay"><button disabled>Unavailable save</button><button>Disconnect</button></div>}
    </>
  }
  const view = render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Open' }))
  if (closing) await user.click(screen.getByRole('button', { name: getT().common.cancel }))
  await act(async () => useStore.setState({ hardwareError: 'ERR:1' }))
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(decided).toHaveBeenCalledExactlyOnceWith(false)
  expect(view.container).not.toHaveAttribute('inert')
  expect(screen.getByRole('button', { name: 'Disconnect' })).toHaveFocus()
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 180)) })
  expect(screen.getByRole('button', { name: 'Disconnect' })).toHaveFocus()
  act(() => useStore.setState({ hardwareError: null }))
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

it('cancels a new confirmation when a hardware error already owns the screen', async () => {
  useStore.setState({ hardwareError: 'ERR:1' })
  const view = render(<ConfirmDialog />)
  let decision!: Promise<boolean>
  act(() => { decision = useUiStore.getState().requestConfirm('Delete', 'Confirm') })
  await expect(decision).resolves.toBe(false)
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(view.container).not.toHaveAttribute('inert')
})

it('restores inert states and the invoker after StrictMode effect replay on an initially open dialog', async () => {
  const user = userEvent.setup()
  const invoker = document.createElement('button')
  document.body.append(invoker)
  invoker.focus()
  let decision!: Promise<boolean>
  act(() => { decision = useUiStore.getState().requestConfirm('Delete', 'Strict lifecycle') })
  const view = render(<StrictMode><ConfirmDialog /></StrictMode>)
  try {
    expect(screen.getByRole('button', { name: getT().common.cancel })).toHaveFocus()
    expect(view.container).toHaveAttribute('inert')
    await user.click(screen.getByRole('button', { name: getT().common.cancel }))
    await expect(decision).resolves.toBe(false)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(view.container).not.toHaveAttribute('inert')
    expect(invoker).not.toHaveAttribute('inert')
    expect(invoker).toHaveFocus()
  } finally {
    invoker.remove()
  }
})
