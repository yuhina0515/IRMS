// renderer/services/escapeStack.ts
// Esc 的「最上層優先」派送堆疊。
//
// 為什麼需要一個堆疊,而不是每個 modal 各自掛一個 window listener:
// 同一個事件目標(window)上的多個 listener,一律依「註冊順序」觸發,與 capture
// / bubble 無關;而 `stopPropagation()` 只擋得住「其他目標」上的 listener,擋不住
// 同一目標上的兄弟 listener(那是 `stopImmediatePropagation()` 的工作)。
// 也就是說,原本「每個 modal 自己掛一個 capture listener + stopPropagation」的寫法,
// 在巢狀情境下會讓一次 Esc 同時關掉兩層——例如在歷史分析視窗中按下刪除,跳出確認
// 對話框,此時一次 Esc 會連確認框帶歷史視窗一起關掉,使用者只按了一次「取消」。
//
// 改由單一 listener 查詢這個堆疊,只呼叫最後被推入(= 最上層)的那一個,語意才與
// 使用者的心智模型一致:Esc 關掉「我現在正在看的那一層」。
type EscapeHandler = () => void

const stack: EscapeHandler[] = []

/**
 * 推入一個 Esc 處理者(最後推入者最先被派送到)。
 * @returns 移除函式;重複呼叫安全。
 */
export function pushEscapeHandler(handler: EscapeHandler): () => void {
  stack.push(handler)
  let removed = false
  return () => {
    if (removed) return
    removed = true
    // 用 lastIndexOf:同一個函式實體理論上只會有一份,但即使呼叫端重複推入,
    // 移除最後一份也才對得上「後進先出」。
    const i = stack.lastIndexOf(handler)
    if (i >= 0) stack.splice(i, 1)
  }
}

/**
 * 派送一次 Esc 給最上層的處理者。
 * @returns 是否真的有處理者被呼叫(呼叫端據此決定要不要擋掉事件)。
 */
export function dispatchEscape(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top()
  return true
}

/** 僅供測試:目前堆疊深度。用來確認 unmount 後沒有殘留 listener。 */
export function escapeStackDepth(): number {
  return stack.length
}
