// QA fixes BUG1 + RISK5: the advanced manual fold must not downgrade a unified profile (which drops the signed
// knee / hyperextension alarm) and the legacy quick zero must not run on one (no off-plane check, stale profile).
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined) }))
vi.mock('../services/bluetooth', async (orig) => {
  const actual = await orig<typeof import('../services/bluetooth')>()
  return { ...actual, bluetoothService: { ...actual.bluetoothService, on: vi.fn(() => () => {}) } }
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_SETTINGS, useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { SettingsView } from './SettingsView'

async function openAdvanced(method: 'unified' | 'legacyAEuler'): Promise<void> {
  useStore.setState({
    isConnected: true,
    rawAngles: { thigh: 1, thighRoll: 0, shin: 2, shinRoll: 0 } as never,
    settings: { ...DEFAULT_SETTINGS, calibrationMethod: method, calibrationId: 'p1' }
  })
  useUiStore.setState({ requestConfirm: async () => true, confirm: null })
  render(<SettingsView />)
  await userEvent.click(screen.getByRole('button', { name: /^校準/ }))
  await userEvent.click(screen.getByText(/進階手動校準|Advanced manual/))
}

function firstField(): HTMLInputElement {
  return document.querySelector('details.adv-fold input[type=number]') as HTMLInputElement
}

beforeEach(() => {
  useStore.setState({ session: { ...useStore.getState().session, running: false } })
})

describe('advanced fold on a unified profile', () => {
  it('cannot edit a field, so the method and the signed-knee path survive', async () => {
    await openAdvanced('unified')
    const field = firstField()
    expect(field).toBeDisabled()
    await userEvent.type(field, '5')
    expect(useStore.getState().settings.calibrationMethod).toBe('unified')
    expect(useStore.getState().settings.calibrationId).toBe('p1')
  })

  it('disables the legacy quick zero', async () => {
    await openAdvanced('unified')
    expect(screen.getByRole('button', { name: '快速歸零' })).toBeDisabled()
  })

  it('keeps the legacy behaviour on legacy profiles', async () => {
    await openAdvanced('legacyAEuler')
    await userEvent.type(firstField(), '5')
    expect(useStore.getState().settings.calibrationMethod).toBe('manual')
    expect(screen.getByRole('button', { name: '快速歸零' })).toBeEnabled()
  })
})
