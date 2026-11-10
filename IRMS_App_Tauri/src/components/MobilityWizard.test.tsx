import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installIrmsStub } from '../test/irmsApiStub'
import { MobilityWizard } from './MobilityWizard'
import { MobilityTrend } from './MobilityTrend'

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
