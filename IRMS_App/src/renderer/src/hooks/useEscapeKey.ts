// renderer/hooks/useEscapeKey.ts
// Esc 關閉 modal。
//
// 2026-08-01 意見清單 #33:三個 modal(校準精靈、動作編輯、歷史分析)與確認對話框
// 都只能用滑鼠點右上角的 ×。Esc 沒有作用,也沒有 focus trap。對鍵盤使用者而言
// 那是一個沒有出口的畫面——而復健情境下「手不方便用滑鼠」正是常態。
//
// 派送順序交給 escapeStack(見該檔的說明:同目標的 listener 依註冊順序觸發,
// stopPropagation 擋不住兄弟 listener,故不能靠「各自掛一個」來達成最上層優先)。
import { useEffect, useRef } from 'react'
import { dispatchEscape, pushEscapeHandler } from '../services/escapeStack'

let listenerInstalled = false

function ensureListener(): void {
  if (listenerInstalled) return
  listenerInstalled = true
  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 沒有任何 modal 開著時不吞事件,讓 Esc 保持原生語意(例如取消輸入法組字)
      if (dispatchEscape()) e.stopPropagation()
    },
    true
  )
}

/**
 * 綁定 Esc。只有「最後被綁定且仍生效」的那一個會被呼叫。
 *
 * @param onEscape Esc 時呼叫;傳 null 表示暫時停用(例如擷取進行中不可中斷)
 */
export function useEscapeKey(onEscape: (() => void) | null): void {
  // 呼叫端幾乎都是 inline arrow(`() => setForm(null)`),每次 render 都是新的函式
  // 實體。若直接當成 effect 相依,listener 會隨著每次 render 反覆拆掉重掛——
  // CalibrationWizard 在 25Hz 資料流下等於每秒重掛 25 次,而且會讓堆疊順序取決於
  // 誰剛好重新 render,不再是誰在上層。改成用 ref 讀最新值,只在「有沒有啟用」
  // 真的改變時才動堆疊。
  const handlerRef = useRef(onEscape)
  handlerRef.current = onEscape

  const armed = onEscape != null

  useEffect(() => {
    if (!armed) return
    ensureListener()
    return pushEscapeHandler(() => handlerRef.current?.())
  }, [armed])
}
