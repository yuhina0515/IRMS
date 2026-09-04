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
  SESSION_PURGE_DEMO: 'session:purgeDemo',

  DATA_APPEND_BATCH: 'data:appendBatch',

  ACTION_LIST: 'action:list',
  ACTION_CREATE: 'action:create',
  ACTION_UPDATE: 'action:update',
  ACTION_DELETE: 'action:delete',
  ACTION_RESTORE_DEFAULTS: 'action:restoreDefaults',

  FIRMWARE_PICK_BINARY: 'firmware:pickBinary',

  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggleMaximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',
  WINDOW_HAS_CUSTOM_TITLEBAR: 'window:hasCustomTitlebar',
  /** main → renderer 推播頻道(非 invoke/handle 的請求-回應模式),視窗最大化狀態改變時觸發 */
  WINDOW_MAXIMIZED_CHANGED: 'window:maximizedChanged'
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]
