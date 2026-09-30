// i18n/format.ts
// --- 依語系格式化數字、日期與複數(Intl 原生 API,不引入第三方套件)---
// Intl 物件建立成本不低,而教練提示每幀都會格式化數字,所以依 (locale, options) 快取。
import type { Locale } from './locale'

const numberCache = new Map<string, Intl.NumberFormat>()
const dateCache = new Map<string, Intl.DateTimeFormat>()
const pluralCache = new Map<string, Intl.PluralRules>()

/** 固定小數位數的數字(例如角度 12.0、秒數 1.8)。 */
export function formatNumber(locale: Locale, value: number, fractionDigits = 1): string {
  const key = `${locale}|${fractionDigits}`
  let nf = numberCache.get(key)
  if (!nf) {
    nf = new Intl.NumberFormat(locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      useGrouping: false
    })
    numberCache.set(key, nf)
  }
  return nf.format(value)
}

/** 日期時間;options 相同者共用同一個 formatter。 */
export function formatDateTime(locale: Locale, value: Date | number, options: Intl.DateTimeFormatOptions = {}): string {
  const key = `${locale}|${JSON.stringify(options)}`
  let df = dateCache.get(key)
  if (!df) {
    df = new Intl.DateTimeFormat(locale, options)
    dateCache.set(key, df)
  }
  return df.format(value)
}

/**
 * Shared date/time presets for the views, so the same kind of timestamp looks the same on every
 * screen and follows the UI language instead of the WebView default (bare toLocaleString did).
 */
export const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }
/** Clock time with seconds, 24 h (chart axes, "checked at"). */
export const TIME_SECONDS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
/** Clock time without seconds, 24 h (status chips). */
export const TIME_MINUTES: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false }

/** 依語系的複數規則選字:forms 至少要有 other(zh 只會用到 other)。 */
export function selectPlural(
  locale: Locale,
  count: number,
  forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }
): string {
  let pr = pluralCache.get(locale)
  if (!pr) {
    pr = new Intl.PluralRules(locale)
    pluralCache.set(locale, pr)
  }
  return forms[pr.select(count)] ?? forms.other
}
