// 步驟 1(佩戴確認)的配戴側閘門測試。
//
// 換配戴側(左右腿)重跑精靈時,若在第 5 步(外展)略過,roll invert 會沿用
// 上一次配戴側判定出的方向——「外側」在左右腿是互為鏡像,沒有配戴側資訊就無法
// 偵測「這次換邊了」而提醒使用者。修法是要求步驟 1 選定配戴側後才能進入精靈。
// 完整走到第 5 步涉及 capture() 的真實倒數與取樣計時器,這裡只鎖最容易被回歸
// 破壞的閘門本身:忘記加 disabled 條件不會被 TS 抓到。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useStore } from '../store/useStore'
import { CalibrationWizard } from './CalibrationWizard'
import { t } from '../i18n'

const setConnected = (connected: boolean): void => {
  useStore.setState({ isConnected: connected })
}

describe('CalibrationWizard 步驟 1:配戴側閘門', () => {
  beforeEach(() => {
    useStore.setState((s) => ({ settings: { ...s.settings, wearSide: null, language: 'zh-Hant' } }))
  })

  it.each(['zh-Hant', 'en'] as const)('以 %s 公開鍵盤選擇狀態且關閉不儲存', async (language) => {
    useStore.setState((s) => ({ isConnected: true, settings: { ...s.settings, language } }))
    const originalSettings = useStore.getState().settings
    const onClose = vi.fn()
    const user = userEvent.setup()
    const m = t(language)
    render(<CalibrationWizard onClose={onClose} />)
    const left = screen.getByRole('button', { name: m.clinical.terms.leftLeg, pressed: false })
    const right = screen.getByRole('button', { name: m.clinical.terms.rightLeg, pressed: false })
    left.focus()
    await user.keyboard(' ')
    expect(left).toHaveAttribute('aria-pressed', 'true')
    expect(right).toHaveAttribute('aria-pressed', 'false')
    await user.tab()
    expect(right).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(right).toHaveAttribute('aria-pressed', 'true')
    expect(left).toHaveAttribute('aria-pressed', 'false')
    const close = screen.getByRole('button', { name: m.common.close })
    close.focus()
    await user.keyboard('{Enter}')
    expect(onClose).toHaveBeenCalledOnce()
    expect(useStore.getState().settings).toBe(originalSettings)
  })

  it.each(['left', 'right'] as const)('將既有配戴側 %s 公開為已選擇', (wearSide) => {
    useStore.setState((s) => ({ settings: { ...s.settings, wearSide } }))
    render(<CalibrationWizard onClose={() => {}} />)
    expect(screen.getByRole('button', { name: '右腿', pressed: wearSide === 'right' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '左腿', pressed: wearSide === 'left' })).toBeInTheDocument()
  })

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
    expect(screen.getByRole('heading', { name: '步驟 2/6 · 站直捕捉零位' })).toBeInTheDocument()
  })
})
