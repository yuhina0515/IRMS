// shared/ipc.ts
// --- IPC 頻道名稱常數 ---
// main(ipcMain.handle)、preload(ipcRenderer.invoke)、renderer 三端共用,
// 集中管理避免字串拼錯造成的隱性失聯。

export const IpcChannel = {
  SESSION_START: 'session:start',
  SESSION_END: 'session:end',
  SESSION_PROGRESS: 'session:progress',
  SESSION_LIST: 'session:list',
  SESSION_GET_DATA: 'session:getData',
  SESSION_DELETE: 'session:delete',

  DATA_APPEND_BATCH: 'data:appendBatch',

  ACTION_LIST: 'action:list',
  ACTION_CREATE: 'action:create',
  ACTION_UPDATE: 'action:update',
  ACTION_DELETE: 'action:delete',
  ACTION_RESTORE_DEFAULTS: 'action:restoreDefaults'
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]
