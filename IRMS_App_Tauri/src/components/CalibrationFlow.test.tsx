import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalibrationFlow } from './CalibrationFlow'
import { useStore } from '../store/useStore'

vi.mock('../services/bluetooth', () => ({
  bluetoothService: {
    onRawMotion: () => () => {},
    enableRawStream: vi.fn().mockResolvedValue(undefined)
  }
}))

const add = vi.fn().mockResolvedValue({})
const mobilityAdd = vi.fn().mockResolvedValue({})
vi.mock('../platform/irmsApi', () => ({
  irms: {
    calibrationProfiles: { list: vi.fn().mockResolvedValue([]), add: (...a: unknown[]) => add(...a), remove: vi.fn() },
    mobility: { add: (...a: unknown[]) => mobilityAdd(...a), list: vi.fn().mockResolvedValue([]) }
  }
}))
vi.mock('../services/voice', () => ({ speak: vi.fn() }))

const still = { x: 0, y: 0, z: 1 }
const feed = async (ms: number): Promise<void> => {
  for (let t = 0; t < ms; t += 100) {
    await act(async () => {
      useStore.setState({ rawAngles: { thighAccel: { ...still }, shinAccel: { ...still } } as never })
      await vi.advanceTimersByTimeAsync(100)
    })
  }
}

beforeEach(() => {
  add.mockClear()
  mobilityAdd.mockClear()
  useStore.setState({ isConnected: true, linkTruncated: false, rawAngles: null })
  useStore.setState((s) => ({ session: { ...s.session, running: false }, settings: { ...s.settings, firmwareProtocol: null, calibrationId: null } }))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('CalibrationFlow prepare step', () => {
  it('needs a leg before it can start, and offers the three presets', async () => {
    render(<CalibrationFlow onClose={() => {}} />)
    expect(screen.getByTestId('flow-start')).toBeDisabled()
    for (const p of ['calibrate', 'mobility', 'quickRezero']) expect(screen.getByTestId(`flow-preset-${p}`)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '左腿' }))
    expect(screen.getByTestId('flow-start')).not.toBeDisabled()
  })

  it('quick re-zero without a stored profile cannot start and says why', async () => {
    render(<CalibrationFlow preset="quickRezero" onClose={() => {}} />)
    expect(await screen.findByText(/找不到先前的校準檔案/)).toBeInTheDocument()
    expect(screen.getByTestId('flow-start')).toBeDisabled()
  })

  it('Euler firmware takes the legacy branch instead of the new reference step', async () => {
    useStore.setState((s) => ({ settings: { ...s.settings, firmwareProtocol: 'euler' } }))
    render(<CalibrationFlow onClose={() => {}} />)
    expect(screen.getByText(/此韌體或連線需使用舊版校準/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '左腿' }))
    await userEvent.click(screen.getByTestId('flow-start'))
    expect(screen.queryByTestId('flow-capture')).not.toBeInTheDocument()
    expect(screen.queryByText('量測零位')).not.toBeInTheDocument()
  })
})

describe('CalibrationFlow cancellation writes nothing', () => {
  it('a session starting closes the flow and shows no write', async () => {
    const onClose = vi.fn()
    const setSettings = vi.spyOn(useStore.getState(), 'setSettings')
    render(<CalibrationFlow onClose={onClose} />)
    await act(async () => {
      useStore.setState((s) => ({ session: { ...s.session, running: true } }))
    })
    expect(onClose).toHaveBeenCalled()
    expect(setSettings).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
  })

  it('a disconnect closes the flow and writes nothing', async () => {
    const onClose = vi.fn()
    render(<CalibrationFlow onClose={onClose} />)
    await act(async () => {
      useStore.setState({ isConnected: false })
    })
    expect(onClose).toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
  })
})

describe('CalibrationFlow reference and movement steps', () => {
  it('captures a still reference, moves to the knee step, and re-capture returns without a confirm when nothing was recorded', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    render(<CalibrationFlow onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '左腿' }))
    fireEvent.click(screen.getByTestId('flow-start'))
    expect(screen.getByText('量測零位')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('flow-capture'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    await feed(2200)
    expect(screen.getByText(/動作:膝蓋彎曲/)).toBeInTheDocument()
    // the knee sweep is mandatory: no skip button
    expect(screen.queryByTestId('flow-skip')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('flow-recapture'))
    expect(screen.getByText('量測零位')).toBeInTheDocument()
    expect(add).not.toHaveBeenCalled()
  })
})
