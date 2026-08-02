// renderer/hooks/useEscapeKey.ts
// Esc 關閉 modal。
//
// 2026-08-01 意見清單 #33:三個 modal(校準精靈、動作編輯、歷史分析)與確認對話框
// 都只能用滑鼠點右上角的 ×。Esc 沒有作用,也沒有 focus trap。對鍵盤使用者而言
// 那是一個沒有出口的畫面——而復健情境下「手不方便用滑鼠」正是常態。
import { useEffect } from 'react'

/**
 * 綁定 Esc。以 capture 階段監聽,確保巢狀 modal 只有最上層那個會關閉
 * (最後掛載的 listener 先收到 → stopPropagation 擋住底下的)。
 *
 * @param onEscape Esc 時呼叫;傳 null 表示暫時停用(例如擷取進行中不可中斷)
 */
export function useEscapeKey(onEscape: (() => void) | null): void {
  useEffect(() => {
    if (!onEscape) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onEscape()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onEscape])
}
