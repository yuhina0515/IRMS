// Short translated trigger-type names used across v3 views (PROPOSAL §4 Actions). The enum values
// are what gets stored; long names for the editor come from `clinical.triggerLong`.
// i18n P0: the text comes from the `clinical.triggerShort` dictionary. TRIGGER_SHORT keeps its
// Record shape (views index it directly) but each entry is a getter, so it follows the current
// UI language at render time instead of freezing the language active at module load.
import type { TriggerType } from '@shared/types'
import { getLocale, t, type Locale } from '../i18n'

export function triggerShortLabel(type: TriggerType, locale: Locale = getLocale()): string {
  return t(locale).clinical.triggerShort[type]
}

export const TRIGGER_SHORT: Readonly<Record<TriggerType, string>> = {
  get joint_angle() {
    return triggerShortLabel('joint_angle')
  },
  get segment_elevation() {
    return triggerShortLabel('segment_elevation')
  },
  get segment_extension() {
    return triggerShortLabel('segment_extension')
  }
}
