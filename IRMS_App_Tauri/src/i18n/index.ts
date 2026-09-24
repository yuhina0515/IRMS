// 介面語言入口。語言選擇存在 settings.language(持久化);元件以 useT() 取得目前語言的
// 語言檔物件,非 React 的呼叫端(class component、服務層回呼)用 getT()。
import { useStore } from '../store/useStore'
import type { Guidance } from '../services/guidance'
import type { MetricInfo } from '../services/movementMetric'
import { en } from './en'
import { zhTW, type Messages } from './zh-TW'

export type Locale = 'zh-TW' | 'en'
export type { Messages }

export const LOCALES: Record<Locale, Messages> = { 'zh-TW': zhTW, en }
export const LOCALE_OPTIONS: Locale[] = ['zh-TW', 'en']

export function messagesFor(locale: Locale | undefined): Messages {
  return LOCALES[locale ?? 'zh-TW'] ?? zhTW
}

/** 目前語言的語言檔(React hook,切換語言時自動重繪) */
export function useT(): Messages {
  return messagesFor(useStore((s) => s.settings.language))
}

/** 非 React 呼叫端使用 */
export function getT(): Messages {
  return messagesFor(useStore.getState().settings.language)
}

const fmt1 = (n: number): string => (Math.round(n * 10) / 10).toFixed(1)

/** Guidance(結構化的「現在該做什麼」)→ 目前語言的提示句 */
export function guidanceText(t: Messages, g: Guidance, info: MetricInfo): string {
  switch (g.kind) {
    case 'noData':
      return t.guidance.noData
    case 'overLimit':
      return t.guidance.overLimit(fmt1(g.excessDeg))
    case 'straightenKnee':
      return t.guidance.straightenKnee(fmt1(g.excessDeg))
    case 'raise':
      return t.guidance.raise(info.key, fmt1(g.deltaDeg))
    case 'lower':
      return t.guidance.lower(fmt1(g.deltaDeg))
    case 'hold':
      return t.guidance.hold(g.heldSec.toFixed(1), g.totalSec.toFixed(1))
    case 'returnToRest':
      return g.deltaDeg > 0 ? t.guidance.returnToRest(fmt1(g.deltaDeg)) : t.guidance.atRest
  }
}

/** 主指標名稱(movementMetric 的 key → 目前語言) */
export function metricLabel(t: Messages, info: MetricInfo): string {
  return t.metrics[info.key]
}
