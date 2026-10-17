import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalibrationWizardB } from './CalibrationWizardB'

vi.mock('../services/bluetooth', () => ({
  bluetoothService: {
    onRawMotion: () => () => {},
    enableRawStream: vi.fn().mockResolvedValue(undefined)
  }
}))

describe('CalibrationWizardB intro', () => {
  it('requires a wear side, falls back to gravity-only without a raw stream, then enters the pose steps', async () => {
    render(<CalibrationWizardB onClose={() => {}} />)
    const start = screen.getByRole('button', { name: '開始' })
    expect(start).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: '左腿' }))
    await waitFor(() => expect(screen.getByText(/僅以重力繼續校準/)).toBeInTheDocument(), { timeout: 4000 })
    expect(start).not.toBeDisabled()

    await userEvent.click(start)
    expect(screen.getByText('姿勢:站立')).toBeInTheDocument()
    expect(screen.getByText('第 1 / 6 步')).toBeInTheDocument()
  })
})
