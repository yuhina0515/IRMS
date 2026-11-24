// 同步取得應用程式轉換保留權；不匯入平台或控制器，避免初始化循環。
// 資料生命週期條件由各呼叫端另行確認，這裡只保證單一 owner。
let owner: symbol | null = null

export function acquireAppTransition(): (() => void) | null {
  if (owner !== null) return null
  const token = Symbol('application transition')
  owner = token
  return () => {
    // 舊 owner 重複釋放不可解除較新 owner 的保留權。
    if (owner === token) owner = null
  }
}
