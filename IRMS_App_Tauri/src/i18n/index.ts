// i18n/index.ts
// --- 介面語系入口 ---
// 刻意不引入 i18n 套件:訊息量小、只有兩個語系,型別安全的物件字典 + Intl 原生格式化就夠用,
// 且 `satisfies` 讓缺漏翻譯在 typecheck 階段就失敗,而不是執行時才顯示 key。
//
// 兩種取用方式:
// - React 元件:useT() / useLocale(),訂閱 settings.language,切換語系會重繪。
// - service 層(guidance、firmwareAutoUpdate…):getT() / getLocale(),呼叫當下非反應式地
//   讀 store。這些字串在每次呼叫時才產生,所以語系可以在 Session 進行中切換。
import { useStore, type ConnectionStatus } from '../store/useStore'
import { en } from './en'
import { resolveLocale, type Locale } from './locale'
import { zhHant, type Messages } from './zh-Hant'

export type { Messages } from './zh-Hant'
export { LOCALES, FALLBACK_LOCALE, isLanguageSetting, resolveLocale, type LanguageSetting, type Locale } from './locale'
export { DATE_TIME, TIME_MINUTES, TIME_SECONDS, formatDateTime, formatNumber, selectPlural } from './format'
export { rich } from './rich'

const DICTIONARIES: Record<Locale, Messages> = { 'zh-Hant': zhHant, en }

/**
 * Display text for a connection state that is not "connected". The store keeps `statusText` as a
 * raw English log string; views translate the machine-readable status instead. `reconnecting`
 * without attempt counters falls back to the generic connecting text.
 */
export function connectionStatusText(m: Messages, status: ConnectionStatus): string {
  switch (status) {
    case 'connecting':
    case 'reconnecting':
      return m.connection.connecting
    case 'deviceNotFound':
      return m.connection.deviceNotFound
    case 'connectionFailed':
      return m.connection.connectionFailed
    default:
      return m.connection.disconnected
  }
}

/** 指定語系的訊息字典 */
export function t(locale: Locale): Messages {
  return DICTIONARIES[locale]
}

/** 目前生效的語系(非反應式,供 service 層使用) */
export function getLocale(): Locale {
  return resolveLocale(useStore.getState().settings.language)
}

/** 目前生效語系的訊息字典(非反應式,供 service 層使用) */
export function getT(): Messages {
  return t(getLocale())
}

/** React:目前生效的語系,語系設定改變時重繪 */
export function useLocale(): Locale {
  const language = useStore((s) => s.settings.language)
  return resolveLocale(language)
}

/** React:目前生效語系的訊息字典,語系設定改變時重繪 */
export function useT(): Messages {
  return t(useLocale())
}

/**
 * 讓 <html lang> 跟著生效語系走(螢幕報讀器發音、瀏覽器斷字與字型選擇都依賴它)。
 * 回傳取消訂閱函式。
 */
export function installDocumentLang(): () => void {
  const apply = (): void => {
    if (typeof document !== 'undefined') document.documentElement.lang = getLocale()
  }
  apply()
  return useStore.subscribe((s, prev) => {
    if (s.settings.language !== prev.settings.language) apply()
  })
}
