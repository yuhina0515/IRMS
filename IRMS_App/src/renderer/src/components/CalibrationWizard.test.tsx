// 步驟 1(佩戴確認)的配戴側閘門測試。
//
// 2026-08-28 實測發現:換配戴側(左右腿)重跑精靈時,若在第 5 步(外展)略過,
// roll invert 會沿用上一次配戴側判定出的方向——「外側」在左右腿是互為鏡像,
// 沒有配戴側資訊就無法偵測「這次換邊了」而提醒使用者。修法是要求步驟 1 選定
// 配戴側後才能進入精靈。完整走到第 5 步涉及 capture() 的真實倒數與取樣計時器,
// 這裡只鎖最容易被回歸破壞的閘門本身:忘記加 disabled 條件不會被 TS 抓到。
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useStore } from '../store/useStore'
import { CalibrationWizard } from './CalibrationWizard'

const setConnected = (connected: boolean): void => {
  useStore.setState({ isConnected: connected })
}

describe('CalibrationWizard 步驟 1:配戴側閘門', () => {
  it('未連線時「開始」停用,且不因選了配戴側而解除', async () => {
    setConnected(false)
    render(<CalibrationWizard onClose={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: '左腿' }))
    expect(screen.getByRole('button', { name: '開始' })).toBeDisabled()
  })

  it('已連線但尚未選配戴側時「開始」停用', () => {
    setConnected(true)
    render(<CalibrationWizard onClose={() => {}} />)

    expect(screen.getByRole('button', { name: '開始' })).toBeDisabled()
    expect(screen.getByText('請先選擇配戴側。')).toBeInTheDocument()
  })

  it('已連線且選了配戴側後「開始」才能按下,並進入步驟 2', async () => {
    setConnected(true)
    render(<CalibrationWizard onClose={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: '右腿' }))
    const startBtn = screen.getByRole('button', { name: '開始' })
    expect(startBtn).not.toBeDisabled()

    await userEvent.click(startBtn)
    expect(screen.getByText('步驟 2/6 · 站直捕捉零位')).toBeInTheDocument()
  })
})
