// renderer/styles/applyStyleProfile.ts
// Applies a chosen style profile by setting inline custom properties on <html> — inline
// style wins over any stylesheet rule (incl. the `@media prefers-color-scheme` block in
// global.css) at equal specificity, so picking a real profile pins the appearance
// regardless of OS theme. 'system' clears every known token instead, letting global.css's
// :root/media-query rules take back over — i.e. today's original OS-driven behavior.
import { getStyleProfile, allProfileTokenNames } from './profiles/registry'
import { notifyThemeChanged } from '../services/theme'

export const SYSTEM_STYLE_PROFILE_ID = 'system'

export function applyStyleProfile(profileId: string): void {
  const root = document.documentElement

  if (profileId === SYSTEM_STYLE_PROFILE_ID) {
    for (const name of allProfileTokenNames()) root.style.removeProperty(name)
    notifyThemeChanged()
    return
  }

  const profile = getStyleProfile(profileId)
  if (!profile) {
    // 未知 id(例如舊版資料或設定檔被移除):退回跟隨系統,而不是靜默維持上一個
    // 套用結果——設定畫面顯示的下拉值與實際外觀必須一致。
    applyStyleProfile(SYSTEM_STYLE_PROFILE_ID)
    return
  }

  for (const [name, value] of Object.entries(profile.tokens)) root.style.setProperty(name, value)
  notifyThemeChanged()
}
