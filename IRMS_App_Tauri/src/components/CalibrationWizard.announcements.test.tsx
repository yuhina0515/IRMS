import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CalibrationWizard } from './CalibrationWizard'
import { useStore } from '../store/useStore'
import { getT } from '../i18n'

beforeEach(() => {
  useStore.setState((s) => ({ isConnected: true, hardwareError: null, settings: { ...s.settings, language: 'zh-Hant', wearSide: 'left' } }))
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it.each(['zh-Hant', 'en'] as const)('retains a polite %s region through step changes', (language) => {
  useStore.setState((s) => ({ settings: { ...s.settings, language } }))
  render(<CalibrationWizard onClose={() => {}} />)
  const status = screen.getByRole('status')
  expect(status).toHaveAttribute('aria-live', 'polite')
  expect(status).toHaveAttribute('aria-atomic', 'true')
  expect(status).toHaveTextContent(getT().calibration.step1Title)
  fireEvent.click(screen.getByRole('button', { name: getT().common.start }))
  expect(screen.getByRole('status')).toBe(status)
  expect(status).toHaveTextContent(getT().clinical.calibration.step2Title)
  expect(screen.getByRole('alert')).toBeEmptyDOMElement()
})

it('announces capture phase/errors without countdown or raw-data chatter, and clears for retry', async () => {
  vi.useFakeTimers()
  render(<CalibrationWizard onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: getT().common.start }))
  const status = screen.getByRole('status')
  const alert = screen.getByRole('alert')
  expect(alert).toHaveAttribute('aria-atomic', 'true')
  fireEvent.click(screen.getByRole('button', { name: getT().calibration.captureButton }))
  expect(status).toHaveTextContent(getT().calibration.capturing)
  const captureText = status.textContent
  const changed = vi.fn()
  const observer = new MutationObserver(changed)
  observer.observe(status, { childList: true, characterData: true, subtree: true })
  try {
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    act(() => useStore.setState({ rawAngles: { thigh: 1, shin: 1, thighRoll: 0, shinRoll: 0 } }))
    expect(screen.getByRole('button', { name: /2…/ })).toBeDisabled()
    expect(status.textContent).toBe(captureText)
    expect(changed).not.toHaveBeenCalled()
    observer.disconnect()
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getByRole('alert')).toBe(alert)
    expect(alert).toHaveTextContent(getT().calibration.insufficientData)
    expect(status).not.toHaveTextContent(getT().calibration.capturing)
    fireEvent.click(screen.getByRole('button', { name: getT().calibration.captureButton }))
    expect(alert).toBeEmptyDOMElement()
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(alert).toHaveTextContent(getT().calibration.insufficientData)
  } finally { observer.disconnect() }
})
