import { beforeEach, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installIrmsStub } from '../test/irmsApiStub'
import type { UpdateStatus } from '@shared/types'
import { useStore } from '../store/useStore'
import { getT } from '../i18n'
import { UpdateBanner } from './UpdateBanner'

let emit!: (status: UpdateStatus) => void
let stub: ReturnType<typeof installIrmsStub>
beforeEach(() => {
  stub = installIrmsStub()
  useStore.getState().resetSession()
  let current: UpdateStatus = { state: 'downloaded', version: '2.0.0' }
  const listeners = new Set<(status: UpdateStatus) => void>()
  emit = (status) => { current = status; listeners.forEach((callback) => callback(status)) }
  stub.updates.onStatusChange.mockImplementation((callback) => {
    listeners.add(callback)
    callback(current)
    return () => listeners.delete(callback)
  })
})

it.each(['en', 'zh-Hant'] as const)('keeps %s installer progress visible and disables repeat action', async (locale) => {
  useStore.getState().setLanguage(locale)
  let finish!: () => void
  stub.updates.restartNow.mockImplementationOnce(() => {
    emit({ state: 'installing', version: '2.0.0' })
    return new Promise<void>((resolve) => { finish = resolve })
  })
  const { unmount } = render(<UpdateBanner />)
  const button = screen.getByRole('button', { name: getT().updateBanner.restartNow })
  await userEvent.click(button)
  const disabledWhilePending = button.hasAttribute('disabled')
  unmount()
  render(<UpdateBanner />)
  await act(async () => finish())
  expect(disabledWhilePending).toBe(true)
  expect(screen.getByRole('button', { name: getT().updateBanner.restartNow })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent(getT().updateBanner.installing)
  expect(screen.queryByText(getT().updateBanner.ready({ version: '2.0.0' }))).toBeNull()
})

it.each(['en', 'zh-Hant'] as const)('handles %s rejection, announces a generic error and permits explicit retry', async (locale) => {
  useStore.getState().setLanguage(locale)
  stub.updates.restartNow.mockImplementationOnce(async () => {
    emit({ state: 'install-error', version: '2.0.0' })
    throw new Error('private-native-detail')
  }).mockImplementationOnce(async () => emit({ state: 'installing', version: '2.0.0' }))
  render(<UpdateBanner />)
  const alert = screen.getByRole('alert')
  expect(alert).toBeEmptyDOMElement()
  await userEvent.click(screen.getByRole('button', { name: getT().updateBanner.restartNow }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(getT().updateBanner.installFailed))
  expect(screen.getByRole('alert')).toBe(alert)
  expect(screen.getByRole('status')).not.toHaveTextContent(getT().updateBanner.installFailed)
  expect(document.body).not.toHaveTextContent('private-native-detail')
  expect(screen.getByRole('button', { name: getT().updateBanner.restartNow })).toBeEnabled()
  await userEvent.click(screen.getByRole('button', { name: getT().updateBanner.restartNow }))
  expect(stub.updates.restartNow).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  expect(screen.getByRole('button', { name: getT().updateBanner.restartNow })).toBeDisabled()
})

it('keeps explicit retry blocked while a stopped session retains unsaved data', async () => {
  useStore.getState().patchSession({ id: 7, running: false })
  render(<UpdateBanner />)
  act(() => emit({ state: 'install-error', version: '2.0.0' }))
  const retry = screen.getByRole('button', { name: getT().updateBanner.restartNow })
  expect(retry).toBeDisabled()
  await userEvent.click(retry)
  expect(stub.updates.restartNow).not.toHaveBeenCalled()
  act(() => useStore.getState().resetSession())
  expect(retry).toBeEnabled()
  await userEvent.click(retry)
  expect(stub.updates.restartNow).toHaveBeenCalledTimes(1)
})
