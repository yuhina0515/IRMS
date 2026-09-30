// main/ipc.ts
// --- IPC 處理器註冊 ---
// 將 renderer 透過 window.irms 發起的請求,路由到資料層 repo。
// 全部為同步 better-sqlite3 呼叫,但以 async handler 包裝以符合 ipcMain.handle 介面。

import { ipcMain, BrowserWindow, dialog } from 'electron'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { IpcChannel } from '@shared/ipc'
import type { CustomActionInput, FirmwareBinary, SensorReading, SessionStartInput } from '@shared/types'
import { actionsRepo, dataRepo, sessionsRepo } from './db'

export function registerIpcHandlers(): void {
  // Sessions
  ipcMain.handle(IpcChannel.SESSION_START, (_e, input: SessionStartInput) => sessionsRepo.start(input))
  ipcMain.handle(IpcChannel.SESSION_END, (_e, sessionId: number, reps: number) =>
    sessionsRepo.end(sessionId, reps)
  )
  ipcMain.handle(IpcChannel.SESSION_PROGRESS, (_e, sessionId: number, reps: number) =>
    sessionsRepo.updateReps(sessionId, reps)
  )
  ipcMain.handle(IpcChannel.SESSION_LIST, () => sessionsRepo.list())
  ipcMain.handle(IpcChannel.SESSION_GET_DATA, (_e, sessionId: number, maxPoints?: number) =>
    sessionsRepo.getData(sessionId, maxPoints)
  )
  ipcMain.handle(IpcChannel.SESSION_DELETE, (_e, sessionId: number) => sessionsRepo.delete(sessionId))
  ipcMain.handle(IpcChannel.SESSION_PURGE_DEMO, () => sessionsRepo.purgeDemo())

  // Sensor data
  ipcMain.handle(IpcChannel.DATA_APPEND_BATCH, (_e, sessionId: number, readings: SensorReading[]) =>
    dataRepo.appendBatch(sessionId, readings)
  )

  // Custom actions
  ipcMain.handle(IpcChannel.ACTION_LIST, () => actionsRepo.list())
  ipcMain.handle(IpcChannel.ACTION_CREATE, (_e, input: CustomActionInput) => actionsRepo.create(input))
  ipcMain.handle(IpcChannel.ACTION_UPDATE, (_e, id: number, input: CustomActionInput) =>
    actionsRepo.update(id, input)
  )
  ipcMain.handle(IpcChannel.ACTION_DELETE, (_e, id: number) => actionsRepo.delete(id))
  ipcMain.handle(IpcChannel.ACTION_RESTORE_DEFAULTS, () => actionsRepo.restoreDefaults())

  // Firmware OTA:讀檔 + 算 MD5 得留在主行程(Node fs/crypto),renderer 的 Web Bluetooth
  // 頁面環境沒有檔案系統存取權——這正是 preload/contextBridge 這層存在的理由。
  ipcMain.handle(IpcChannel.FIRMWARE_PICK_BINARY, async (): Promise<FirmwareBinary | null> => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: '選擇 IRMS 裝置韌體 (.bin)',
      filters: [{ name: 'Firmware Binary', extensions: ['bin'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const path = result.filePaths[0]
    const buffer = await readFile(path)
    const md5 = createHash('md5').update(buffer).digest('hex')
    return { path, size: buffer.length, md5, data: new Uint8Array(buffer) }
  })
}
