// i18n/locale.ts
// --- 語系設定值與解析(純函式,不依賴 store)---
// store 需要 LanguageSetting 型別,而 i18n/index.ts 需要讀 store;型別與解析邏輯放在這個
// 不 import 任何東西的檔案,避免 store ↔ i18n 的循環相依。

/** App 實際支援的介面語系。zh-Hant 為主檔(master),其他語系以它的形狀為準。 */
export const LOCALES = ['zh-Hant', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/** 使用者設定值:'system' = 跟隨作業系統/WebView 語系 */
export type LanguageSetting = 'system' | Locale

/** 解析不到任何支援語系時的回退值(本專案的原生語系) */
export const FALLBACK_LOCALE: Locale = 'zh-Hant'

export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return value === 'system' || (LOCALES as readonly unknown[]).includes(value)
}

/**
 * 把單一 BCP 47 標籤對應到支援語系;不支援回傳 null。
 * 所有 zh-* (含 zh-CN)都對應到 zh-Hant——這是目前唯一的中文翻譯,比退回英文更可讀。
 */
export function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null
  const lower = tag.toLowerCase()
  if (lower === 'zh' || lower.startsWith('zh-')) return 'zh-Hant'
  if (lower === 'en' || lower.startsWith('en-')) return 'en'
  return null
}

/** 系統語系清單(依偏好順序);讀不到 navigator 時(非瀏覽器環境)為空陣列 */
export function systemLanguageTags(): readonly string[] {
  const nav = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } }).navigator
  if (!nav) return []
  if (nav.languages && nav.languages.length > 0) return nav.languages
  return nav.language ? [nav.language] : []
}

/** 設定值 → 實際語系。'system' 依偏好順序取第一個支援的語系,都不支援則回退 zh-Hant。 */
export function resolveLocale(setting: LanguageSetting | undefined, tags: readonly string[] = systemLanguageTags()): Locale {
  if (setting && setting !== 'system' && isLanguageSetting(setting)) return setting
  for (const tag of tags) {
    const match = matchLocale(tag)
    if (match) return match
  }
  return FALLBACK_LOCALE
}
