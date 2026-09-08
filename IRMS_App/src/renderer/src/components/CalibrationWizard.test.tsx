// 步驟 1(佩戴確認)的配戴側閘門測試。
//
// 換配戴側(左右腿)重跑精靈時,若在第 5 步(外展)略過,roll invert 會沿用
// 上一次配戴側判定出的方向——「外側」在左右腿是互為鏡像,沒有配戴側資訊就無法
// 偵測「這次換邊了」而提醒使用者。修法是要求步驟 1 選定配戴側後才能進入精靈。
// 完整走到第 5 步涉及 capture() 的真實倒數與取樣計時器,這裡只鎖最容易被回歸
// 破壞的閘門本身:忘記加 disabled 條件不會被 TS 抓到。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RawAngles } from '@shared/protocol'
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

/**
 * 2026-09-09:動作幅度驗證從「finish()(步驟 6)才檢查」改成「該步驟擷取完成當下就檢查」。
 * 原本的問題是使用者在步驟 2/3 做的動作幅度不夠,卻要再走過 2、3 個步驟才在步驟 5/6
 * 被送回來重捕,體感上完全對不起來是哪裡出錯,只覺得「怎麼一直跳回前面」。
 *
 * 這裡用假時鐘驅動 capture() 真正的倒數(COUNTDOWN_SECONDS)與取樣視窗,而不是只鎖
 * UI 閘門——這正是舊測試檔案開頭註解說「涉及真實計時器,這裡不測」的那條路徑,但這次
 * 改的就是這條路徑本身的行為,值得把假時鐘的複雜度換成真的回歸鎖。
 */
describe('CalibrationWizard 步驟 2/3:動作幅度即時驗證(2026-09-09)', () => {
  const REST: RawAngles = { thigh: 0, shin: 0, thighRoll: 0, shinRoll: 0 }
  const COUNTDOWN_MS = 4000 // CalibrationWizard.tsx 的 COUNTDOWN_SECONDS

  beforeEach(() => {
    vi.useFakeTimers()
    setConnected(true)
    useStore.setState({ rawAngles: null })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** 連續餵 30 筆新物件參照的 rawAngles,驅動 capture() 的取樣訂閱湊滿 SAMPLE_COUNT。 */
  function feedSamples(pose: RawAngles): void {
    for (let i = 0; i < 30; i++) {
      act(() => {
        // 每筆物件必須是新的參照(capture() 用 !== 判斷是否為新樣本),但角度值不變,
        // 模擬「靜止不動」的姿勢——像素級雜訊留給別的測試處理。
        useStore.setState({ rawAngles: { ...pose } })
      })
    }
  }

  /** 走到指定步驟(0=佩戴確認 … 4=外展)。手動流程,關掉免手擷取避免跟真實計時器搶著擷取。 */
  function enterWizardToStep1(): void {
    render(<CalibrationWizard onClose={() => {}} />)
    // 關掉免手擷取,避免它跟本測試手動驅動的 capture() 搶著訂閱 rawAngles
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '右腿' }))
    fireEvent.click(screen.getByRole('button', { name: '開始' }))
  }

  async function captureAt(pose: RawAngles): Promise<void> {
    fireEvent.click(screen.getByRole('button', { name: /開始捕捉/ }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNTDOWN_MS)
    })
    feedSamples(pose)
    await act(async () => {}) // flush capture() 拿到 30 筆後續的 microtask 鏈
  }

  it('大腿抬起只有 10°(< 20° 門檻)時停在步驟 3/6 並顯示錯誤,不會先跑到步驟 5/6 才被送回來', async () => {
    enterWizardToStep1()
    await captureAt(REST) // 步驟 2/6:站直捕捉零位
    expect(screen.getByText('步驟 3/6 · 向前抬起大腿')).toBeInTheDocument()

    await captureAt({ ...REST, thigh: 10 }) // 幅度不足
    expect(screen.getByText('步驟 3/6 · 向前抬起大腿')).toBeInTheDocument()
    expect(screen.getByText('大腿動作幅度不足(需 ≥ 20°),請加大幅度重新捕捉')).toBeInTheDocument()
  })

  it('大腿抬起 25°(≥ 20° 門檻)時正常進到步驟 4/6', async () => {
    enterWizardToStep1()
    await captureAt(REST)
    expect(screen.getByText('步驟 3/6 · 向前抬起大腿')).toBeInTheDocument()

    await captureAt({ ...REST, thigh: 25 })
    expect(screen.getByText('步驟 4/6 · 站立後勾小腿')).toBeInTheDocument()
  })

  it('小腿後勾只有 8°(< 20° 門檻)時停在步驟 4/6 並顯示錯誤', async () => {
    enterWizardToStep1()
    await captureAt(REST)
    await captureAt({ ...REST, thigh: 25 })
    expect(screen.getByText('步驟 4/6 · 站立後勾小腿')).toBeInTheDocument()

    await captureAt({ ...REST, thigh: 25, shin: 8 })
    expect(screen.getByText('步驟 4/6 · 站立後勾小腿')).toBeInTheDocument()
    expect(screen.getByText('小腿動作幅度不足(需 ≥ 20°),請加大幅度重新捕捉')).toBeInTheDocument()
  })
})
