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
  SessionStartInput
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
  }
}

// 本專案恆以 contextIsolation: true 運行,直接暴露至 window.irms
contextBridge.exposeInMainWorld('irms', api)
