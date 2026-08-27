// renderer/store/useUiStore.ts
// --- UI 暫態:Toast 通知與 Confirm 對話框 ---
// 與主 store 分離,避免 UI 噪音觸發資料相關的重繪。

import { create } from 'zustand'
import { useStore } from './useStore'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ConfirmRequest {
  title: string
  message: string
  resolve: (ok: boolean) => void
}

interface UiState {
  toasts: Toast[]
  confirm: ConfirmRequest | null
  view: 'dashboard' | 'actions' | 'history' | 'settings'
  /**
   * 示範模式:資料由模擬器產生,不是真實量測。
   *
   * 刻意放在這個 store 而不是 useStore.settings——後者走 zustand persist,
   * 存進 localStorage 就會跨行程存活。一個「讓假資料寫進資料庫」的模式如果
   * 能被記住,使用者幾週後打開 app 會落在示範模式裡而毫無所覺,然後把示範資料
   * 當成療程紀錄。這個旗標必須隨行程死亡:每次啟動一律是真實模式。
   */
  demoMode: boolean

  showToast(message: string, type?: ToastType, duration?: number): void
  dismissToast(id: number): void
  requestConfirm(title: string, message: string): Promise<boolean>
  resolveConfirm(ok: boolean): void
  setView(view: UiState['view']): void
  /**
   * 切換示範模式。
   * @returns 是否真的切換了;false = 被拒絕(Session 進行中)
   */
  setDemoMode(on: boolean): boolean
}

let toastSeq = 0

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  confirm: null,
  view: 'dashboard',
  demoMode: false,

  showToast: (message, type = 'info', duration = 3000) => {
    const id = ++toastSeq
    set({ toasts: [...get().toasts, { id, message, type }] })
    setTimeout(() => get().dismissToast(id), duration)
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  requestConfirm: (title, message) =>
    new Promise<boolean>((resolve) => set({ confirm: { title, message, resolve } })),

  resolveConfirm: (ok) => {
    get().confirm?.resolve(ok)
    set({ confirm: null })
  },

  setView: (view) => set({ view }),

  setDemoMode: (on) => {
    // Session 進行中不得進出示範模式。sessions.source 在 sessions.start() 當下
    // 戳定一次,若中途可以切換,一場 session 的前半是真實量測、後半是模擬資料,
    // 而它在資料庫裡只會有一個標記——半真半假的紀錄比純粹的假資料更難察覺。
    // 真正的防線在 UI(按鈕在進行中就不可按),這裡是最後一道,擋掉繞過 UI 的路徑,
    // 並且刻意「拒絕且留下日誌」而非靜默忽略。
    if (useStore.getState().session.running) {
      useStore.getState().log('Demo mode cannot be toggled while a session is running.')
      return false
    }
    set({ demoMode: on })
    useStore.getState().log(on ? 'Demo mode ON — data is simulated.' : 'Demo mode OFF.')
    return true
  }
}))
