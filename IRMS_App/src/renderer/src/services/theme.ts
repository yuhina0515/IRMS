// --- 主題 token 解析(供 canvas 類元件使用)---
// Chart.js / Three.js 不能直接吃 CSS 變數,這裡把 global.css 的語意 token
// 以 getComputedStyle 解析為實際色值,並提供系統主題切換的訂閱。
// DOM/SVG 元件請直接用 var(--token),不要經過這層。

/** 解析單一 CSS 變數的目前值(隨淺/深主題自動變化) */
export function themeToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** 系統主題變化時回呼(回傳解除訂閱函式) */
export function onSystemThemeChange(callback: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (): void => callback()
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
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
