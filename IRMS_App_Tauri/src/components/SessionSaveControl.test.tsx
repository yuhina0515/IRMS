import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installIrmsStub } from '../test/irmsApiStub'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { getT } from '../i18n'
import { SessionDock } from './SessionDock'
import { ErrorOverlay } from './ErrorOverlay'
import { ErrorBoundary } from './ErrorBoundary'

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

beforeEach(() => {
  useStore.getState().resetSession()
  useStore.setState({ hardwareError: null })
})
afterEach(() => {
  useStore.getState().resetSession()
  vi.restoreAllMocks()
})

describe('session persistence recovery controls', () => {
  it('shows failed saving, retains recovery ownership and retries without claiming success early', async () => {
    const stub = installIrmsStub()
    stub.sessions.end.mockRejectedValueOnce(new Error('disk busy'))
    const toast = vi.spyOn(useUiStore.getState(), 'showToast')
    useStore.getState().patchSession({ id: 7, running: true, reps: 3 })
    render(<SessionDock onCalibrate={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: getT().sessionDock.end }))
    expect(await screen.findByRole('alert')).toHaveTextContent(getT().sessionDock.saveFailed)
    expect(toast).not.toHaveBeenCalledWith(getT().sessionDock.ended, 'success')
    let finish!: (value: { success: true }) => void
    stub.sessions.end.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    await userEvent.click(screen.getByRole('button', { name: getT().sessionDock.retrySave }))
    expect(screen.getByRole('button', { name: getT().sessionDock.blocker.finishing })).toBeDisabled()
    expect(useStore.getState().session.id).toBe(7)
    await act(async () => { finish({ success: true }) })
    expect(toast).toHaveBeenCalledWith(getT().sessionDock.ended, 'success')
    expect(stub.sessions.end.mock.calls).toEqual([[7, 3], [7, 3]])
    expect(useStore.getState().session.id).toBeNull()
  })

  it('keeps saving retry reachable beneath a hardware error overlay', async () => {
    const stub = installIrmsStub()
    useStore.getState().patchSession({ id: 7, running: false })
    useStore.getState().setSessionSaveState('failed')
    useStore.setState({ hardwareError: 'ERR:1' })
    render(<ErrorOverlay />)
    await userEvent.click(screen.getByRole('button', { name: getT().sessionDock.retrySave }))
    await waitFor(() => expect(stub.sessions.end).toHaveBeenCalledWith(7, 0))
    expect(screen.queryByRole('button', { name: getT().sessionDock.retrySave })).toBeNull()
  })

  it('updates the crash fallback save control reactively when persistence fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const stub = installIrmsStub()
    stub.sessions.end.mockRejectedValueOnce(new Error('disk busy'))
    useStore.getState().patchSession({ id: 7, running: true })
    const Crash = (): JSX.Element => { throw new Error('view crashed') }
    const { container } = render(<ErrorBoundary name="test"><Crash /></ErrorBoundary>)
    expect(container).toHaveTextContent(getT().errorBoundary.running.trim())
    await userEvent.click(screen.getByRole('button', { name: getT().common.endAndSaveSession }))
    expect(await screen.findByRole('alert')).toHaveTextContent(getT().sessionDock.saveFailed)
    expect(container).not.toHaveTextContent(getT().errorBoundary.running.trim())
    await userEvent.click(screen.getByRole('button', { name: getT().sessionDock.retrySave }))
    await waitFor(() => expect(useStore.getState().session.id).toBeNull())
  })
})
