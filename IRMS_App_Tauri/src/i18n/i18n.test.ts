// i18n 核心:字典對齊、訊息函式、系統語系解析、Intl 格式化,以及 service 層跟隨語系設定。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store/useStore'
import { en } from './en'
import { zhHant } from './zh-Hant'
import { formatNumber, getLocale, getT, resolveLocale, selectPlural, t } from '.'
import { guidanceText } from '../services/guidance'
import { metricInfo } from '../services/movementMetric'
import { TRIGGER_SHORT } from '../views/actionLabels'
import { SCENARIOS } from '../services/simulation/scenarios'

/** 攤平成 `a.b.c → 'string' | 'function'`,同時比對 key 與訊息種類 */
function shape(obj: object, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') Object.assign(out, shape(value as object, path))
    else out[path] = typeof value
  }
  return out
}

afterEach(() => {
  useStore.getState().setLanguage('system')
  vi.unstubAllGlobals()
})

describe('dictionary parity', () => {
  it('en has exactly the zh-Hant keys, with the same message kinds', () => {
    expect(shape(en)).toEqual(shape(zhHant))
  })

  it('no message is empty in any locale', () => {
    for (const dict of [zhHant, en]) {
      for (const [path, kind] of Object.entries(shape(dict))) {
        if (kind !== 'string') continue
        const value = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], dict)
        expect(value, path).not.toBe('')
      }
    }
  })
})

describe('t() messages', () => {
  it('returns plain strings per locale', () => {
    expect(t('zh-Hant').guidance.noData).toBe('等待感測資料…')
    expect(t('en').guidance.noData).toBe('Waiting for sensor data…')
  })

  it('function messages interpolate and reorder words per locale', () => {
    expect(t('zh-Hant').guidance.raise({ verb: '抬高', deg: '12.0' })).toBe('再抬高 12.0°')
    expect(t('en').guidance.raise({ verb: 'Raise', deg: '12.0' })).toBe('Raise 12.0° more')
    expect(t('en').firmware.incompatible({ version: '1.4.0' })).toContain('1.4.0')
    expect(t('en').connection.reconnecting({ attempt: 2, max: 5 })).toBe('Reconnecting 2/5')
  })
})

describe('resolveLocale', () => {
  it('explicit settings win over the system language', () => {
    expect(resolveLocale('en', ['zh-TW'])).toBe('en')
    expect(resolveLocale('zh-Hant', ['en-US'])).toBe('zh-Hant')
  })

  it("'system' takes the first supported language in preference order", () => {
    expect(resolveLocale('system', ['en-US', 'zh-TW'])).toBe('en')
    expect(resolveLocale('system', ['ja-JP', 'zh-TW'])).toBe('zh-Hant')
    expect(resolveLocale('system', ['zh-CN'])).toBe('zh-Hant')
    expect(resolveLocale('system', ['EN'])).toBe('en')
  })

  it('falls back to zh-Hant when nothing is supported or nothing is known', () => {
    expect(resolveLocale('system', ['ja-JP', 'fr'])).toBe('zh-Hant')
    expect(resolveLocale('system', [])).toBe('zh-Hant')
    expect(resolveLocale(undefined, [])).toBe('zh-Hant')
  })

  it('reads navigator.languages, then navigator.language', () => {
    vi.stubGlobal('navigator', { languages: ['en-GB'], language: 'zh-TW' })
    expect(resolveLocale('system')).toBe('en')
    vi.stubGlobal('navigator', { languages: [], language: 'en-US' })
    expect(resolveLocale('system')).toBe('en')
    vi.stubGlobal('navigator', undefined)
    expect(resolveLocale('system')).toBe('zh-Hant')
  })
})

describe('Intl formatting', () => {
  it('formats fixed fraction digits without grouping', () => {
    expect(formatNumber('en', 12, 1)).toBe('12.0')
    expect(formatNumber('zh-Hant', 1234.56, 1)).toBe('1234.6')
  })

  it('selects plural forms by locale rules', () => {
    const forms = { one: 'rep', other: 'reps' }
    expect(selectPlural('en', 1, forms)).toBe('rep')
    expect(selectPlural('en', 3, forms)).toBe('reps')
    // 中文沒有單複數之分,一律 other
    expect(selectPlural('zh-Hant', 1, { one: 'x', other: '下' })).toBe('下')
  })
})

describe('service layer follows the language setting', () => {
  it('defaults to zh-Hant in the test environment (locale pinned by test/locale.ts)', () => {
    expect(useStore.getState().settings.language).toBe('system')
    expect(getLocale()).toBe('zh-Hant')
  })

  it('switches guidance, metric labels, trigger names and scenario labels without reload', () => {
    const info = metricInfo('segment_elevation')
    expect(guidanceText({ kind: 'raise', deltaDeg: 12 }, info)).toBe('再抬高 12.0°')
    expect(TRIGGER_SHORT.joint_angle).toBe('關節角度')

    useStore.getState().setLanguage('en')
    expect(getT()).toBe(en)
    expect(metricInfo('segment_elevation').label).toBe('Thigh elevation')
    expect(guidanceText({ kind: 'raise', deltaDeg: 12 }, metricInfo('joint_angle'))).toBe('Bend 12.0° more')
    expect(guidanceText({ kind: 'overLimit', excessDeg: 4.26 }, info)).toBe('⚠ 4.3° past your limit range. Lower your leg now')
    expect(TRIGGER_SHORT.segment_extension).toBe('Segment extension')
    expect(SCENARIOS.find((s) => s.id === 'rep-cycle')?.label).toBe('Normal session — three reps in a row')
  })

  it('language is not calibration-frozen: it can change mid-session', () => {
    useStore.getState().patchSession({ running: true })
    try {
      useStore.getState().setLanguage('en')
      expect(useStore.getState().settings.language).toBe('en')
    } finally {
      useStore.getState().patchSession({ running: false })
    }
  })
})
