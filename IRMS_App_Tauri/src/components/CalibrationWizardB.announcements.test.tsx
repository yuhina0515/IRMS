import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CalibrationWizardB } from './CalibrationWizardB'
import { bluetoothService } from '../services/bluetooth'
import { useStore } from '../store/useStore'
import { getT } from '../i18n'

vi.mock('../services/bluetooth', () => ({ bluetoothService: {
  onRawMotion: vi.fn(() => vi.fn()), enableRawStream: vi.fn(async () => undefined)
} }))
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks()
  useStore.setState((s) => ({ hardwareError: null, settings: { ...s.settings, language: 'zh-Hant', wearSide: 'left' } }))
})

it('keeps countdown ticks/raw frames silent, announces capture failure/retry and actual solver failure', async () => {
  render(<CalibrationWizardB onClose={() => {}} />)
  const c = getT().calibrationB
  const status = screen.getByRole('status')
  const alert = screen.getByRole('alert')
  await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
  fireEvent.click(screen.getByRole('button', { name: getT().common.start }))
  fireEvent.click(screen.getByRole('button', { name: c.capture }))
  expect(status).toHaveTextContent(c.capture)
  const before = status.textContent
  const changed = vi.fn()
  const observer = new MutationObserver(changed)
  observer.observe(status, { childList: true, characterData: true, subtree: true })
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(screen.getByRole('button', { name: /2…/ })).toBeDisabled()
  expect(status.textContent).toBe(before)
  expect(changed).not.toHaveBeenCalled()
  observer.disconnect()
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(status).toHaveTextContent(c.recording)
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(alert).toHaveTextContent(c.noData)

  // 真實 record/solver 路徑：相同重力向量刻意欠定，不能產生可套用校準。
  for (let index = 0; index < 6; index++) {
    fireEvent.click(screen.getByRole('button', { name: c.capture }))
    expect(alert).toBeEmptyDOMElement()
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    const text = status.textContent
    act(() => {
      for (let sample = 0; sample < 10; sample++) useStore.setState({ rawAngles: { thigh: 0, shin: 0, thighRoll: 0, shinRoll: 0, thighAccel: { x: 0, y: 0, z: 1 }, shinAccel: { x: 0, y: 0, z: 1 } } })
    })
    expect(status.textContent).toBe(text)
    await act(async () => { await vi.advanceTimersByTimeAsync(index < 4 ? 2000 : 6000) })
  }
  expect(status).toHaveTextContent(c.resultTitle)
  expect(alert).toHaveTextContent(c.failed({ limb: getT().clinical.terms.thigh, reason: c.errors.underdetermined }))
  expect(screen.queryByRole('button', { name: getT().calibration.apply })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: getT().calibration.recalibrate }))
  expect(alert).toBeEmptyDOMElement()
  expect(status).toHaveTextContent(c.poses.standing.title)
})

it('distinguishes raw-enabled floor faces and progress without announcing raw values', async () => {
  render(<CalibrationWizardB onClose={() => {}} />)
  // 只模擬 raw 偵測/地面擷取來源，保留實際倒數、擷取、換面流程。
  const onRaw = vi.mocked(bluetoothService.onRawMotion).mock.calls[0][0]
  const vector = { x: 0, y: 0, z: 1 }
  onRaw({ thighAcc: vector, shinAcc: vector, thighGyro: vector, shinGyro: vector })
  await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
  const c = getT().calibrationB
  const status = screen.getByRole('status')
  expect(status).toHaveTextContent(c.rawOn)
  fireEvent.click(screen.getByRole('button', { name: getT().common.start }))
  expect(status).toHaveTextContent(c.faces['+x'])
  expect(status).toHaveTextContent(c.progress({ n: '1', total: '12' }))
  fireEvent.click(screen.getByRole('button', { name: c.capture }))
  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  act(() => {
    for (let sample = 0; sample < 10; sample++) {
      onRaw({ thighAcc: vector, shinAcc: vector, thighGyro: vector, shinGyro: vector })
      useStore.setState({ rawAngles: { thigh: 0, shin: 0, thighRoll: 0, shinRoll: 0, thighAccel: vector, shinAccel: vector } })
    }
  })
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(status).toHaveTextContent(c.faces['-x'])
  expect(status).toHaveTextContent(c.progress({ n: '2', total: '12' }))
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it.each(['zh-Hant', 'en'] as const)('announces %s raw detection then pose with persistent regions', async (language) => {
  useStore.setState((s) => ({ settings: { ...s.settings, language } }))
  render(<CalibrationWizardB onClose={() => {}} />)
  const c = getT().calibrationB
  const status = screen.getByRole('status')
  const alert = screen.getByRole('alert')
  expect(status).toHaveAttribute('aria-live', 'polite')
  expect(status).toHaveAttribute('aria-atomic', 'true')
  expect(status).toHaveTextContent(c.rawChecking)
  expect(alert).toBeEmptyDOMElement()
  await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
  expect(status).toHaveTextContent(c.rawOff)
  fireEvent.click(screen.getByRole('button', { name: getT().common.start }))
  expect(screen.getByRole('status')).toBe(status)
  expect(screen.getByRole('alert')).toBe(alert)
  expect(status).toHaveTextContent(c.poses.standing.title)
  expect(status).toHaveTextContent(c.progress({ n: '1', total: '6' }))
})
