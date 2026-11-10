import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installIrmsStub } from '../test/irmsApiStub'
import { MobilityWizard } from './MobilityWizard'
import { MobilityTrend } from './MobilityTrend'
import { useStore } from '../store/useStore'
import type { RawAngles } from '@shared/protocol'
import { getT } from '../i18n'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

// 經實際 store 串流推入已知姿勢，驗證擷取與非同步儲存的完整元件流程。
const rawPose = (deg: number): RawAngles => ({
  thigh: 0, shin: deg, thighRoll: 0, shinRoll: 0,
  thighAccel: { x: 0, y: 1, z: 0 },
  shinAccel: { x: 0, y: Math.cos(deg * Math.PI / 180), z: Math.sin(deg * Math.PI / 180) }
})

async function capture(angles: number[], duration: number): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: getT().mobility.capture }))
  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  for (const angle of angles) {
    act(() => useStore.getState().setRawAngles(rawPose(angle)))
    await act(async () => { await vi.advanceTimersByTimeAsync(40) })
  }
  await act(async () => { await vi.advanceTimersByTimeAsync(duration - angles.length * 40) })
}

describe('MobilityWizard intro', () => {
  it('needs a side, then starts; deselecting every movement blocks start', async () => {
    render(<MobilityWizard onClose={() => {}} />)
    const start = screen.getByRole('button', { name: '開始' })
    expect(start).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '左腿' }))
    expect(start).not.toBeDisabled()
    for (const box of screen.getAllByRole('checkbox')) await userEvent.click(box)
    expect(start).toBeDisabled()
  })
})

describe('MobilityTrend', () => {
  it('separates opposite legs and legacy records in the rendered best and history', async () => {
    const stub = installIrmsStub()
    stub.mobility.list.mockResolvedValue([
      { id: 3, measuredAt: '2026-10-20T00:00:00Z', movementSet: 'kneeFlexion', totalDeg: 70, detail: '{"side":"right"}' },
      { id: 2, measuredAt: '2026-10-19T00:00:00Z', movementSet: 'kneeFlexion', totalDeg: 120, detail: '{"side":"left"}' },
      { id: 1, measuredAt: '2026-10-18T00:00:00Z', movementSet: 'kneeFlexion', totalDeg: 140, detail: '{}' }
    ])
    render(<MobilityTrend />)
    await screen.findByText('右腿')
    expect(screen.queryByText(/120|140/)).toBeNull()
    expect(screen.queryByTestId('mobility-history')).toBeNull()
    expect(screen.getByText(/70.*70/)).toBeInTheDocument()
  })

  it('reports a failed load and permits retry instead of showing an empty database', async () => {
    const stub = installIrmsStub()
    stub.mobility.list.mockRejectedValueOnce(new Error('DB unavailable'))
    render(<MobilityTrend />)
    expect(await screen.findByRole('alert')).toHaveTextContent(getT().history.loadFailed)
    expect(screen.queryByText(getT().mobility.noRecords)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: getT().common.retry }))
    expect(await screen.findByText(getT().mobility.noRecords)).toBeInTheDocument()
  })

  it('discards a measurement on disconnect and keeps it closed after reconnect', async () => {
    installIrmsStub()
    const { rerender } = render(<MobilityTrend />)
    await userEvent.click(screen.getByTestId('mobility-open'))
    expect(screen.getByText(getT().mobility.title)).toBeInTheDocument()
    rerender(<MobilityTrend disabled />)
    expect(screen.queryByText(getT().mobility.title)).toBeNull()
    rerender(<MobilityTrend />)
    expect(screen.queryByText(getT().mobility.title)).toBeNull()
  })

  it('does not let a delayed save from a closed wizard dismiss its replacement', async () => {
    vi.useFakeTimers()
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    useStore.setState({ settings: { ...useStore.getState().settings, wearSide: 'left' } })
    const stub = installIrmsStub()
    let finishSave!: () => void
    stub.mobility.add.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSave = resolve }))
    render(<MobilityTrend />)
    fireEvent.click(screen.getByTestId('mobility-open'))
    for (const box of screen.getAllByRole('checkbox').slice(1)) fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: getT().common.start }))
    await capture(Array(45).fill(0), 2000)
    const angles = [...Array.from({ length: 30 }, (_, i) => i * 3), ...Array(60).fill(90), ...Array(160).fill(0)]
    await capture(angles, 10000)
    fireEvent.click(screen.getByRole('button', { name: getT().mobility.save }))
    expect(stub.mobility.add).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '×' }))
    fireEvent.click(screen.getByTestId('mobility-open'))
    const loadsBeforeSave = stub.mobility.list.mock.calls.length
    await act(async () => { finishSave(); await Promise.resolve() })
    expect(screen.getByText(getT().mobility.title)).toBeInTheDocument()
    expect(stub.mobility.list).toHaveBeenCalledTimes(loadsBeforeSave + 1)
  })

  it('unsubscribes an active capture immediately on unmount', async () => {
    vi.useFakeTimers()
    useStore.setState({ settings: { ...useStore.getState().settings, wearSide: 'left' } })
    const { unmount } = render(<MobilityWizard onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: getT().common.start }))
    fireEvent.click(screen.getByRole('button', { name: getT().mobility.capture }))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows the empty state, then the latest record from the DB', async () => {
    const stub = installIrmsStub()
    render(<MobilityTrend />)
    await waitFor(() => expect(stub.mobility.list).toHaveBeenCalled())
    stub.mobility.list.mockResolvedValue([
      { id: 1, measuredAt: '2026-10-03T00:00:00.000Z', movementSet: 'kneeFlexion', totalDeg: 120, detail: '{"peaks":{"kneeFlexion":120}}' }
    ])
    render(<MobilityTrend />)
    await waitFor(() => expect(screen.getAllByTestId('mobility-row').length).toBe(2))
    await waitFor(() => expect(screen.getAllByText(/120/).length).toBeGreaterThan(0))
  })
})
