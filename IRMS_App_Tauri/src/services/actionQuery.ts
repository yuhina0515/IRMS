// renderer/services/actionQuery.ts
// --- 動作清單的篩選 / 排序 / 分組(純函式)---
//
// 抽出來而不是寫進 ActionsView 的理由:那個檔案已經 306 行,裡面同時裝著
// 新增/編輯 Modal、Record Pose 的即時角度取樣、還原預設與刪除確認。再往裡面塞
// 一個查詢狀態機,唯一能驗證它的方式就只剩「把 app 開起來一個一個點」。
// 純函式版本可以在 node project 直接窮舉邊界。
//
// ⚠ 這裡的東西全部是**呈現層**:它改變的是使用者在畫面上看到哪些卡片、以什麼順序,
// 不改變任何判定。依專案規則 #1,它改變的是「人的決定」(挑哪個動作來做),
// 不是引擎的決定——所以它不需要、也不應該碰任何角度數學。

import type { CustomAction, TriggerType } from '@shared/types'

export type ActionSortBy = 'name' | 'target' | 'created'
export type ActionGroupBy = 'none' | 'triggerType'

export interface ActionQuery {
  /** 自由文字;比對名稱與說明,大小寫不敏感 */
  query?: string
  sortBy?: ActionSortBy
  groupBy?: ActionGroupBy
}

export interface ActionGroup {
  /** groupBy='none' 時為 null */
  key: TriggerType | null
  actions: CustomAction[]
}

/**
 * 名稱排序用 localeCompare 而非 `<`:動作名稱是中文的
 * (「膝關節屈曲」「直腿抬高」),用碼位排序會得到一個看起來像隨機的順序。
 * 指定 'zh-Hant' 讓排序穩定且與使用者的語言一致,不隨系統 locale 漂移。
 */
const byName = (a: CustomAction, b: CustomAction): number =>
  a.name.localeCompare(b.name, 'zh-Hant')

const COMPARATORS: Record<ActionSortBy, (a: CustomAction, b: CustomAction) => number> = {
  name: byName,
  // 目標角度相同時退回名稱排序:否則兩個 90° 的動作每次重繪順序都可能不同,
  // 而「清單自己在跳」會讓人以為資料變了
  target: (a, b) => a.targetAngle - b.targetAngle || byName(a, b),
  created: (a, b) => a.id - b.id
}

function matches(action: CustomAction, needle: string): boolean {
  if (needle === '') return true
  const haystack = `${action.name} ${action.description ?? ''}`.toLowerCase()
  return haystack.includes(needle)
}

/**
 * 篩選 → 排序 → 分組。永遠回傳分組陣列(groupBy='none' 時為單一組),
 * 讓呼叫端只需要一條渲染路徑,不必為兩種形狀各寫一次 JSX。
 */
export function filterSortGroupActions(
  actions: CustomAction[],
  { query = '', sortBy = 'name', groupBy = 'none' }: ActionQuery = {}
): ActionGroup[] {
  const needle = query.trim().toLowerCase()
  const filtered = actions.filter((a) => matches(a, needle))
  // 不就地排序:呼叫端傳進來的通常是 store 裡的陣列,sort() 會原地改動它
  const sorted = [...filtered].sort(COMPARATORS[sortBy])

  if (groupBy === 'none') {
    // 空清單也回傳一個空組,呼叫端的 groups.length 才不會與「有沒有結果」混淆
    return [{ key: null, actions: sorted }]
  }

  // 分組順序跟著該組第一個出現的元素,所以組的順序由 sortBy 決定而不是雜湊順序——
  // 同一組輸入永遠得到同一個畫面
  const groups: ActionGroup[] = []
  for (const action of sorted) {
    const existing = groups.find((g) => g.key === action.triggerType)
    if (existing) existing.actions.push(action)
    else groups.push({ key: action.triggerType, actions: [action] })
  }
  return groups
}

/** 分組後的總數(空狀態判斷用;呼叫端不必自己攤平) */
export function countActions(groups: ActionGroup[]): number {
  return groups.reduce((sum, g) => sum + g.actions.length, 0)
}
