// renderer/store/useUiStore.ts
// --- UI 暫態:Toast 通知與 Confirm 對話框 ---
// 與主 store 分離,避免 UI 噪音觸發資料相關的重繪。

import { create } from 'zustand'

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
  sidebarCollapsed: boolean

  showToast(message: string, type?: ToastType, duration?: number): void
  dismissToast(id: number): void
  requestConfirm(title: string, message: string): Promise<boolean>
  resolveConfirm(ok: boolean): void
  setView(view: UiState['view']): void
  toggleSidebar(): void
}

let toastSeq = 0

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  confirm: null,
  view: 'dashboard',
  sidebarCollapsed: false,

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
  toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed })
}))
