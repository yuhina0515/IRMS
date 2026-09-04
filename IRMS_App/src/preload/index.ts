// preload/index.ts
// --- 安全橋接層 ---
// 在 contextIsolation 開啟下,透過 contextBridge 將型別安全的 IRMS API
// 注入 renderer 的 window.irms。renderer 無法直接存取 Node/ipcRenderer。

import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type {
  CustomActionInput,
  FirmwareBinary,
  IrmsApi,
  SensorReading,
  SessionStartInput,
  UpdateStatus
} from '@shared/types'

const api: IrmsApi = {
  sessions: {
    start: (input: SessionStartInput) => ipcRenderer.invoke(IpcChannel.SESSION_START, input),
    end: (sessionId: number, repsCompleted: number) =>
      ipcRenderer.invoke(IpcChannel.SESSION_END, sessionId, repsCompleted),
    progress: (sessionId: number, reps: number) =>
      ipcRenderer.invoke(IpcChannel.SESSION_PROGRESS, sessionId, reps),
    list: () => ipcRenderer.invoke(IpcChannel.SESSION_LIST),
    getData: (sessionId: number, maxPoints?: number) =>
      ipcRenderer.invoke(IpcChannel.SESSION_GET_DATA, sessionId, maxPoints),
    delete: (sessionId: number) => ipcRenderer.invoke(IpcChannel.SESSION_DELETE, sessionId),
    purgeDemo: () => ipcRenderer.invoke(IpcChannel.SESSION_PURGE_DEMO)
  },
  data: {
    appendBatch: (sessionId: number, readings: SensorReading[]) =>
      ipcRenderer.invoke(IpcChannel.DATA_APPEND_BATCH, sessionId, readings)
  },
  actions: {
    list: () => ipcRenderer.invoke(IpcChannel.ACTION_LIST),
    create: (input: CustomActionInput) => ipcRenderer.invoke(IpcChannel.ACTION_CREATE, input),
    update: (id: number, input: CustomActionInput) =>
      ipcRenderer.invoke(IpcChannel.ACTION_UPDATE, id, input),
    delete: (id: number) => ipcRenderer.invoke(IpcChannel.ACTION_DELETE, id),
    restoreDefaults: () => ipcRenderer.invoke(IpcChannel.ACTION_RESTORE_DEFAULTS)
  },
  firmware: {
    pickBinary: (): Promise<FirmwareBinary | null> => ipcRenderer.invoke(IpcChannel.FIRMWARE_PICK_BINARY)
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke(IpcChannel.WINDOW_MINIMIZE),
    toggleMaximize: () => ipcRenderer.invoke(IpcChannel.WINDOW_TOGGLE_MAXIMIZE),
    close: () => ipcRenderer.invoke(IpcChannel.WINDOW_CLOSE),
    isMaximized: () => ipcRenderer.invoke(IpcChannel.WINDOW_IS_MAXIMIZED),
    hasCustomTitlebar: () => ipcRenderer.invoke(IpcChannel.WINDOW_HAS_CUSTOM_TITLEBAR),
    onMaximizedChange: (cb: (maximized: boolean) => void) => {
      const handler = (_event: unknown, maximized: boolean): void => cb(maximized)
      ipcRenderer.on(IpcChannel.WINDOW_MAXIMIZED_CHANGED, handler)
      return () => ipcRenderer.removeListener(IpcChannel.WINDOW_MAXIMIZED_CHANGED, handler)
    }
  },
  updates: {
    getCurrentVersion: () => ipcRenderer.invoke(IpcChannel.UPDATE_GET_CURRENT_VERSION),
    checkNow: () => ipcRenderer.invoke(IpcChannel.UPDATE_CHECK_NOW),
    restartNow: () => ipcRenderer.invoke(IpcChannel.UPDATE_RESTART_NOW),
    onStatusChange: (cb: (status: UpdateStatus) => void) => {
      const handler = (_event: unknown, status: UpdateStatus): void => cb(status)
      ipcRenderer.on(IpcChannel.UPDATE_STATUS_CHANGED, handler)
      return () => ipcRenderer.removeListener(IpcChannel.UPDATE_STATUS_CHANGED, handler)
    }
  }
}

// 本專案恆以 contextIsolation: true 運行,直接暴露至 window.irms
contextBridge.exposeInMainWorld('irms', api)
