// renderer/test/setup.ts
// --- dom project 專用的測試前置(node project 刻意不掛,環境保持與過去逐字相同)---

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { installIrmsStub } from './irmsStub'

// 元件測試幾乎必然需要 window.irms(即使元件本身不碰,它 import 的
// sessionController 在模組載入時就會拉進整條鏈)。預設裝上;
// 需要斷言特定回傳值的測試自行再呼叫一次 installIrmsStub(overrides) 覆蓋。
installIrmsStub()

// jsdom 沒有 matchMedia,而 theme.ts 的 onSystemThemeChange 會直接呼叫它。
// 不補的話,任何 import 到 theme 的元件在測試裡會炸在載入階段而非斷言階段,
// 錯誤訊息會指向完全無關的地方。
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia
}

afterEach(() => {
  cleanup()
})
