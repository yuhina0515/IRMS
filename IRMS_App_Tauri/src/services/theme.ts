// --- 主題 token 解析(供 canvas 類元件使用)---
// Chart.js / Three.js 不能直接吃 CSS 變數,這裡把 styles/tokens.css 的 `--color-*` token
// 以 getComputedStyle 解析為實際色值,並提供主題變化的訂閱(見 applyThemeMode())。
// DOM/SVG 元件請直接用 CSS 變數,不要經過這層。

const THEME_CHANGE_EVENT = 'irms:theme-changed'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export type ThemeMode = 'system' | 'dark' | 'light'

/** 解析單一 CSS 變數的目前值(隨主題即時變化)。回傳 tokens.css 裡儲存的原始格式
 *  ——空白分隔的 RGB triplet(如 "34 211 238"),不是完整的 CSS 顏色字串。 */
export function themeToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** 跟 themeToken() 一樣,但包成 `rgb(...)`。刻意用逗號分隔(`rgb(15,23,42)`)而非 CSS4 的
 *  空白分隔——Three.js 的 `Color.setStyle()` 只認舊式逗號語法,餵空白語法會靜默退回白色。 */
export function themeColor(name: string): string {
  return `rgb(${themeToken(name).split(/\s+/).join(',')})`
}

/** 主題切換時回呼,回傳解除訂閱函式。 */
export function onThemeChange(callback: () => void): () => void {
  const handler = (): void => callback()
  window.addEventListener(THEME_CHANGE_EVENT, handler)
  return () => window.removeEventListener(THEME_CHANGE_EVENT, handler)
}

/** 'system' 依作業系統目前偏好解析成實際的 dark/light */
export function resolveThemeMode(mode: ThemeMode): 'dark' | 'light' {
  if (mode !== 'system') return mode
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

let unsubscribeSystem: (() => void) | null = null

/** 套用 `settings.themeMode`:在 `<html>` 設 `data-theme`,並通知 Chart.js/Three.js 重新解析。
 *  'system' 另外訂閱作業系統的深淺切換,切換時即時跟著變。 */
export function applyThemeMode(mode: ThemeMode): void {
  unsubscribeSystem?.()
  unsubscribeSystem = null
  const apply = (): void => {
    document.documentElement.dataset.theme = resolveThemeMode(mode)
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }
  apply()
  if (mode === 'system' && typeof window.matchMedia === 'function') {
    const mq = window.matchMedia(DARK_QUERY)
    mq.addEventListener('change', apply)
    unsubscribeSystem = () => mq.removeEventListener('change', apply)
  }
}

/** Chart.js 共用主題色(每次呼叫即時解析,主題切換後重呼叫再套用)。
 *  系列色與狀態色分開(設計語言 v2 §3.1):主指標畫成墨色,大腿/小腿/Roll 用系列色,
 *  只有安全上限線使用 danger。 */
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
  /** 目標帶邊界線 */
  target: string
  /** 安全上限等警示線 */
  danger: string
} {
  return {
    grid: themeColor('--chart-grid'),
    tick: themeColor('--chart-tick'),
    text: themeColor('--chart-text'),
    knee: themeColor('--color-knee'),
    kneeFill: `rgb(${themeToken('--color-knee').split(/\s+/).join(',')},0.08)`.replace('rgb(', 'rgba('),
    thigh: themeColor('--color-thigh'),
    shin: themeColor('--color-shin'),
    roll: themeColor('--color-roll'),
    target: themeColor('--color-success'),
    danger: themeColor('--color-danger')
  }
}
