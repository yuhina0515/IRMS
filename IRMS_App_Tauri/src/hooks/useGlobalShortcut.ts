// renderer/hooks/useGlobalShortcut.ts
// --- 全域鍵盤快捷鍵 ---
//
// 比照 useEscapeKey 的紀律:單一 window listener,呼叫端傳進來的 inline arrow
// 用 ref 讀最新值,不讓每次 render 都拆掉重掛 listener。
//
// 這個 hook 只負責「該不該觸發」;**做什麼、能不能做,一律由呼叫端沿用按鈕
// 完全相同的守衛**。快捷鍵繞過 UI 守衛是這類功能最典型的缺陷:按鈕因為協定
// 未支援而停用,快捷鍵卻照樣開得了 Session,於是產生一場資料與標籤對不上的紀錄。

import { useEffect, useRef } from 'react'
import { escapeStackDepth } from '../services/escapeStack'

export interface Shortcut {
  /** KeyboardEvent.key,比對時不分大小寫 */
  key: string
  /** 是否需要 Ctrl(Windows)/ Cmd(macOS) */
  meta?: boolean
}

/** 焦點在可輸入元素上時,快捷鍵一律讓路 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true

  // isContentEditable 在真實瀏覽器可用,但 **jsdom 沒有實作它**——只靠它的話,
  // 這道守衛在測試環境永遠是 false,測試會綠而守衛其實沒被驗證過。
  // 改成同時查最近的 contenteditable 祖先:兩個環境都可靠,而且順帶涵蓋
  // 「焦點在 contenteditable 內層元素」與明確寫 contenteditable="false" 的情況。
  if (target.isContentEditable) return true
  const host = target.closest<HTMLElement>('[contenteditable]')
  return host != null && host.getAttribute('contenteditable') !== 'false'
}

/**
 * 綁定一個全域快捷鍵。
 *
 * 三道硬性條件,少任何一道都會製造出比功能本身更嚴重的問題:
 *   1. 焦點在 input/textarea/contenteditable 時忽略——否則在動作名稱欄位裡
 *      打字會觸發連線切換。
 *   2. 有 modal 開著時忽略(重用 escapeStack 的深度)——modal 是一個明確的
 *      模態情境,背後的全域動作在那當下不該可達。
 *   3. 需要 Ctrl/Cmd——單鍵快捷鍵在這個 app 裡不安全:畫面上永遠有數值輸入框,
 *      而且患者可能正在進行療程,誤觸的代價是中斷一場正在錄的 session。
 *
 * @param shortcut 要監聽的按鍵
 * @param handler 觸發時呼叫;傳 null 表示停用(呼叫端據此表達「現在不可用」)
 */
export function useGlobalShortcut(shortcut: Shortcut, handler: (() => void) | null): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  const armed = handler != null
  const { key, meta = true } = shortcut

  useEffect(() => {
    if (!armed) return

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() !== key.toLowerCase()) return
      if (meta && !(e.ctrlKey || e.metaKey)) return
      if (isTypingTarget(e.target)) return
      if (escapeStackDepth() > 0) return

      // 只在真的要處理時才吞掉事件:否則會把瀏覽器/Electron 的原生快捷鍵
      // 一併吃掉,而使用者不會知道是誰吃的
      e.preventDefault()
      handlerRef.current?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [armed, key, meta])
}
