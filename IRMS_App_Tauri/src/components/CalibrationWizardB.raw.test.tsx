import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AccelVector, RawMotion } from '@shared/protocol'
import { CalibrationWizardB } from './CalibrationWizardB'
import { bluetoothService } from '../services/bluetooth'
import { useStore } from '../store/useStore'
import { getT } from '../i18n'
import * as calibration from '../services/calibrationB'

vi.mock('../services/bluetooth', () => ({ bluetoothService: {
  onRawMotion: vi.fn(() => vi.fn()), enableRawStream: vi.fn(async () => undefined)
} }))
let raw!: (motion: RawMotion) => void
const vector = { x: 0, y: 0, z: 1 }
const motion: RawMotion = { thighAcc: vector, shinAcc: vector,
  thighGyro: { x: 1, y: 0, z: 0 }, shinGyro: { x: 1, y: 0, z: 0 } }

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.mocked(bluetoothService.onRawMotion).mockImplementation((callback) => { raw = callback; return vi.fn() })
  useStore.getState().resetSession()
  useStore.setState((s) => ({ hardwareError: null, rawAngles: null,
    settings: { ...s.settings, language: 'en', wearSide: 'left' } }))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

async function advance(ms: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}
async function start(hasRaw = true): Promise<void> {
  render(<CalibrationWizardB onClose={() => {}} />)
  if (hasRaw) act(() => raw(motion))
  await advance(2500)
  fireEvent.click(screen.getByRole('button', { name: getT().common.start }))
}
async function beginCapture(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: getT().calibrationB.capture }))
  await advance(3000)
}
function vectors(count: number, rawEach?: RawMotion): void {
  act(() => {
    for (let index = 0; index < count; index++) {
      if (rawEach) raw(rawEach)
      useStore.setState({ rawAngles: { thigh: 0, shin: 0, thighRoll: 0, shinRoll: 0,
        thighAccel: vector, shinAccel: vector } })
    }
  })
}

it('does not fill a floor capture from a raw receipt predating the capture window', async () => {
  await start()
  const step = screen.getByRole('status').textContent
  await beginCapture()
  vectors(12)
  await advance(2000)
  expect(screen.getByRole('alert')).toHaveTextContent(getT().calibrationB.noData)
  expect(screen.getByRole('status').textContent).toBe(step)
})

it('does not count a single in-window raw notification repeatedly as ten samples', async () => {
  await start()
  await beginCapture()
  act(() => raw(motion))
  vectors(12)
  await advance(2000)
  expect(screen.getByRole('alert')).toHaveTextContent(getT().calibrationB.noData)
})

it('accepts ten distinct receipt callbacks even if their object and values are identical', async () => {
  await start()
  await beginCapture()
  vectors(10, motion)
  await advance(2000)
  expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  expect(screen.getByRole('status')).toHaveTextContent(getT().calibrationB.progress({ n: '2', total: '12' }))
})

it('does not count a raw notification received during the countdown', async () => {
  await start()
  fireEvent.click(screen.getByRole('button', { name: getT().calibrationB.capture }))
  await advance(1000)
  act(() => raw(motion))
  await advance(2000)
  vectors(1)
  vectors(9, motion)
  await advance(2000)
  expect(screen.getByRole('alert')).toHaveTextContent(getT().calibrationB.noData)
})

it('starts retry with a new receipt boundary and clears the previous error', async () => {
  await start()
  await beginCapture()
  vectors(1, motion)
  await advance(2000)
  expect(screen.getByRole('alert')).toHaveTextContent(getT().calibrationB.noData)
  act(() => raw(motion))
  await beginCapture()
  expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  vectors(1)
  vectors(9, motion)
  await advance(2000)
  expect(screen.getByRole('alert')).toHaveTextContent(getT().calibrationB.noData)
})

it('does not consume a raw receipt on a vector frame missing required vectors', async () => {
  await start()
  await beginCapture()
  act(() => {
    raw(motion)
    useStore.setState({ rawAngles: { thigh: 0, shin: 0, thighRoll: 0, shinRoll: 0 } })
  })
  vectors(1)
  vectors(9, motion)
  await advance(2000)
  expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  expect(screen.getByRole('status')).toHaveTextContent(getT().calibrationB.progress({ n: '2', total: '12' }))
})

it('preserves vector-only capture after an explicit floor skip', async () => {
  await start()
  fireEvent.click(screen.getByRole('button', { name: getT().calibrationB.skipFloor }))
  await beginCapture()
  vectors(12)
  await advance(2000)
  expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  expect(screen.getByRole('status')).toHaveTextContent(getT().calibrationB.poses.seated.title)
})

it('does not mix uncorrected vectors into pose capture after valid floor correction', async () => {
  await start()
  const axes: AccelVector[] = [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }]
  for (const axis of axes) {
    await beginCapture()
    vectors(10, { ...motion, thighAcc: axis, shinAcc: axis })
    await advance(2000)
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  }
  expect(screen.getByRole('status')).toHaveTextContent(getT().calibrationB.poses.standing.title)
  await beginCapture()
  vectors(12)
  await advance(2000)
  expect(screen.getByRole('alert')).toHaveTextContent(getT().calibrationB.noData)
  expect(screen.getByRole('status')).toHaveTextContent(getT().calibrationB.poses.standing.title)
})

it.each([1, 10])('counts %i actual raw receipts for optional gyro samples in a vector-only journey', async (receipts) => {
  const solve = vi.spyOn(calibration, 'buildCalibrationPatchB')
  await start(false)
  for (let index = 0; index < 6; index++) {
    await beginCapture()
    if (index < 4) vectors(12)
    else if (receipts === 1) {
      act(() => raw(motion))
      vectors(12)
    } else {
      vectors(10, motion)
      vectors(2)
    }
    await advance(index < 4 ? 2000 : 6000)
  }
  expect(solve).toHaveBeenCalledOnce()
  const sweeps = solve.mock.calls[0][1]
  expect(sweeps).toHaveLength(2)
  for (const sweep of sweeps) {
    expect(sweep.samples).toHaveLength(12)
    if (receipts === 1) expect(sweep.gyro).toBeUndefined()
    else expect(sweep.gyro).toHaveLength(10)
  }
})
