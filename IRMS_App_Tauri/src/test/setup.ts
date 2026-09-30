// test/setup.ts (Tauri port of IRMS_App's renderer/src/test/setup.ts)
// --- dom project 專用的測試前置(node project 刻意不掛,環境保持與純函式測試逐字相同)---

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { installIrmsStub, mockIrmsApiModule } from './irmsApiStub'

// platform/irmsApi 整個模組換成可斷言的 stub——見 irmsApiStub.ts 檔頭註解,這是
// Electron 版「monkeypatch globalThis.window.irms」在 Tauri 沒有這個 global 時的
// 對應做法:call site 一律 `import { irms } from '.../platform/irmsApi'`,換掉的
// 是整個模組的具名匯出,而不是某個全域屬性。
vi.mock('@renderer/platform/irmsApi', () => mockIrmsApiModule)

// 元件測試幾乎必然需要 irms(即使元件本身不碰,它 import 的 sessionController /
// actionQuery 在模組載入時就會拉進整條鏈)。預設裝上;需要斷言特定回傳值的測試
// 自行再呼叫一次 installIrmsStub(overrides) 覆蓋(見 irmsApiStub.ts 對 mid-test
// 二次安裝為何不會撞上 stale-reference 的說明)。
installIrmsStub()

// jsdom 沒有 matchMedia,而 theme.ts 的 onThemeChange 會直接呼叫它。
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
