// useGlobalShortcut 的守衛測試。
//
// 快捷鍵最典型的缺陷是**繞過 UI 守衛**:按鈕因為某個條件停用,快捷鍵卻照樣做得到。
// 在這個 app 裡那代表未支援協定的封鎖被繞過,產生一場資料與標籤對不上的紀錄。
// 所以這裡測的幾乎全是「什麼時候**不該**觸發」。

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useGlobalShortcut, type Shortcut } from './useGlobalShortcut'
import { pushEscapeHandler } from '../services/escapeStack'

function Harness({
  onFire,
  enabled = true,
  shortcut = { key: 'k' }
}: {
  onFire: () => void
  enabled?: boolean
  shortcut?: Shortcut
}): JSX.Element {
  useGlobalShortcut(shortcut, enabled ? onFire : null)
  return (
    <div>
      <input placeholder="名稱" />
      <textarea placeholder="說明" />
      <div contentEditable data-testid="rich" suppressContentEditableWarning />
      <button>elsewhere</button>
    </div>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('觸發條件', () => {
  it('Ctrl+鍵 觸發', async () => {
    const onFire = vi.fn()
    render(<Harness onFire={onFire} />)
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('Cmd+鍵(macOS)同樣觸發', async () => {
    const onFire = vi.fn()
    render(<Harness onFire={onFire} />)
    await userEvent.keyboard('{Meta>}k{/Meta}')
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('大小寫不敏感', async () => {
    const onFire = vi.fn()
    render(<Harness onFire={onFire} />)
    await userEvent.keyboard('{Control>}K{/Control}')
    expect(onFire).toHaveBeenCalled()
  })

  // 單鍵快捷鍵在這個 app 裡不安全:畫面上永遠有數值輸入框,而且患者可能正在
  // 進行療程,誤觸的代價是中斷一場正在錄的 session
  it('沒有 Ctrl/Cmd 時不觸發', async () => {
    const onFire = vi.fn()
    render(<Harness onFire={onFire} />)
    await userEvent.keyboard('k')
    expect(onFire).not.toHaveBeenCalled()
  })

  it('handler 為 null(呼叫端表達「現在不可用」)時完全不掛 listener', async () => {
    const onFire = vi.fn()
    render(<Harness onFire={onFire} enabled={false} />)
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(onFire).not.toHaveBeenCalled()
  })
})

describe('讓路條件', () => {
  it('焦點在 input 時不觸發', async () => {
    const onFire = vi.fn()
    render(<Harness onFire={onFire} />)
    await userEvent.click(screen.getByPlaceholderText('名稱'))
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(onFire).not.toHaveBeenCalled()
  })

  it('焦點在 textarea 時不觸發', async () => {
    const onFire = vi.fn()
    render(<Harness onFire={onFire} />)
    await userEvent.click(screen.getByPlaceholderText('說明'))
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(onFire).not.toHaveBeenCalled()
  })

  it('焦點在 contenteditable 時不觸發', async () => {
    const onFire = vi.fn()
    render(<Harness onFire={onFire} />)
    screen.getByTestId('rich').focus()
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(onFire).not.toHaveBeenCalled()
  })

  // modal 是明確的模態情境;背後的全域動作在那當下不該可達。
  // 重用 escapeStack 的深度,而不是另外維護一份「有沒有 modal」的狀態——
  // 兩份狀態遲早會分歧。
  it('有 modal 開著時不觸發,關掉後恢復', async () => {
    const onFire = vi.fn()
    render(<Harness onFire={onFire} />)

    const closeModal = pushEscapeHandler(() => {})
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(onFire).not.toHaveBeenCalled()

    closeModal()
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(onFire).toHaveBeenCalledTimes(1)
  })
})

describe('事件處理', () => {
  it('不處理的按鍵不吞事件(否則會吃掉原生快捷鍵而沒人知道是誰吃的)', async () => {
    const onFire = vi.fn()
    const seen: boolean[] = []
    const spy = (e: KeyboardEvent): void => void seen.push(e.defaultPrevented)
    window.addEventListener('keydown', spy)
    render(<Harness onFire={onFire} />)

    await userEvent.keyboard('{Control>}j{/Control}') // 非目標鍵
    expect(seen.some((prevented) => prevented)).toBe(false)

    window.removeEventListener('keydown', spy)
  })
})
