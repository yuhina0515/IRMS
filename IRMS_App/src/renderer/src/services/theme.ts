// --- 主題 token 解析(供 canvas 類元件使用)---
// Chart.js / Three.js 不能直接吃 CSS 變數,這裡把 tailwind.css 的 `--color-*` token
// 以 getComputedStyle 解析為實際色值,並提供主題變化的訂閱(見 applyThemeMode())。
// DOM/SVG 元件請直接用 Tailwind class(如 text-accent),不要經過這層。

const THEME_CHANGE_EVENT = 'irms:theme-changed'
const LIGHT_THEME_CLASS = 'theme-light'

/** 解析單一 CSS 變數的目前值(隨主題即時變化)。回傳的是 tailwind.css 裡儲存的原始格式
 *  ——空白分隔的 RGB triplet(如 "34 211 238"),不是完整的 CSS 顏色字串。 */
export function themeToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** 跟 themeToken() 一樣,但包成 `rgb(...)`——可以直接餵給任何吃得下標準 CSS 顏色字串的
 *  地方(Three.js 的 `THREE.Color()`、Chart.js 的顏色欄位、行內 SVG 屬性)。
 *  刻意用逗號分隔(`rgb(15,23,42)`)而非 CSS4 的空白分隔(`rgb(15 23 42)`)——
 *  Three.js 的 `Color.setStyle()` 正規表示式只認舊式逗號語法,餵空白語法會解析失敗、
 *  靜默退回預設白色(3D 視圖背景變白就是這樣 debug 出來的,不是用猜的)。逗號語法
 *  兩邊都吃,Chart.js/SVG 也不受影響。 */
export function themeColor(name: string): string {
  return `rgb(${themeToken(name).split(/\s+/).join(',')})`
}

/** 主題切換時回呼,回傳解除訂閱函式。目前唯一來源是 applyThemeMode(),
 *  matchMedia 訂閱保留是因為 chartTheme() 之類消費者仍可能想知道 OS 層級變化,
 *  但兩套固定主題(dark/light)本身不再跟隨 OS——見 applyThemeMode()。 */
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

/** 套用 `settings.themeMode`:切換 `<html>` 的 theme-light class(tailwind.css 的
 *  `:root`/`.theme-light` 定義兩套 `--color-*` token),並通知 Chart.js/Three.js
 *  這類無法直接吃 CSS 變數的消費者重新解析。取代舊版 applyStyleProfile()。 */
export function applyThemeMode(mode: 'dark' | 'light'): void {
  document.documentElement.classList.toggle(LIGHT_THEME_CLASS, mode === 'light')
  notifyThemeChanged()
}

function notifyThemeChanged(): void {
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
  const knee = themeColor('--color-accent')
  return {
    grid: themeColor('--chart-grid'),
    tick: themeColor('--chart-tick'),
    text: themeColor('--chart-text'),
    knee,
    kneeFill: `rgb(${themeToken('--color-accent')} / 0.12)`,
    thigh: themeColor('--color-thigh'),
    shin: themeColor('--color-shin'),
    roll: themeColor('--color-roll'),
    danger: themeColor('--color-danger')
  }
}
