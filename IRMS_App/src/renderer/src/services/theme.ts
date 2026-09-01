// --- 主題 token 解析(供 canvas 類元件使用)---
// Chart.js / Three.js 不能直接吃 CSS 變數,這裡把 global.css 的語意 token
// 以 getComputedStyle 解析為實際色值,並提供主題變化的訂閱(OS 深淺色切換,
// 或使用者在 Settings 手動切換風格設定檔——見 styles/applyStyleProfile.ts)。
// DOM/SVG 元件請直接用 var(--token),不要經過這層。

const THEME_CHANGE_EVENT = 'irms:theme-changed'

/** 解析單一 CSS 變數的目前值(隨主題/風格設定檔即時變化) */
export function themeToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** 主題變化時回呼(OS 深淺色切換,或風格設定檔被套用),回傳解除訂閱函式。
 *  兩種來源合併成同一個回呼,呼叫端不需要分別處理。 */
export function onThemeChange(callback: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (): void => callback()
  mq.addEventListener('change', handler)
  window.addEventListener(THEME_CHANGE_EVENT, handler)
  return () => {
    mq.removeEventListener('change', handler)
    window.removeEventListener(THEME_CHANGE_EVENT, handler)
  }
}

/** applyStyleProfile() 套用完 token 後呼叫,通知所有 onThemeChange 訂閱者重新解析。
 *  matchMedia 只會在 OS 主題真的變化時觸發,手動切換風格設定檔不會經過它,
 *  Chart.js/Three.js 這類無法直接吃 var(--token) 的消費者因此需要這個額外訊號。 */
export function notifyThemeChanged(): void {
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
}

/** Chart.js 共用主題色(每次呼叫即時解析,主題切換後重呼叫再套用) */
export function chartTheme(): {
  grid: string
  tick: string
  text: string
  knee: string
  kneeFill: string
  thigh: string
  shin: string
  /** 內外翻(kneeRoll)曲線 */
  roll: string
  /** 安全上限等警示線 */
  danger: string
} {
  const knee = themeToken('--accent')
  return {
    grid: themeToken('--chart-grid'),
    tick: themeToken('--chart-tick'),
    text: themeToken('--chart-text'),
    knee,
    kneeFill: `${knee}1f`, // ~12% alpha(8 位 hex)
    thigh: themeToken('--thigh'),
    shin: themeToken('--shin'),
    roll: themeToken('--roll'),
    danger: themeToken('--danger')
  }
}
