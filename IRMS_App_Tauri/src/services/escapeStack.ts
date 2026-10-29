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

// 一般視窗同優先序維持後進先出；硬體警示可保留最高優先權，避免被後開的背景層搶走 Esc。
const stack: Array<{ handler: EscapeHandler; priority: number }> = []

/**
 * 推入一個 Esc 處理者(先比優先序，同序最後推入者最先被派送到)。
 * @returns 移除函式;重複呼叫安全。
 */
export function pushEscapeHandler(handler: EscapeHandler, priority = 0): () => void {
  const entry = { handler, priority }
  stack.push(entry)
  let removed = false
  return () => {
    if (removed) return
    removed = true
    // 以註冊項目身分移除，重複註冊相同函數也不會誤刪其他租約。
    const i = stack.indexOf(entry)
    if (i >= 0) stack.splice(i, 1)
  }
}

/**
 * 派送一次 Esc 給最上層的處理者。
 * @returns 是否真的有處理者被呼叫(呼叫端據此決定要不要擋掉事件)。
 */
export function dispatchEscape(): boolean {
  const top = stack.reduce<(typeof stack)[number] | undefined>((best, entry) => !best || entry.priority >= best.priority ? entry : best, undefined)
  if (!top) return false
  top.handler()
  return true
}

/** 僅供測試:目前堆疊深度。用來確認 unmount 後沒有殘留 listener。 */
export function escapeStackDepth(): number {
  return stack.length
}
