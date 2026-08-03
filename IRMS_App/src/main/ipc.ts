// main/ipc.ts
// --- IPC 處理器註冊 ---
// 將 renderer 透過 window.irms 發起的請求,路由到資料層 repo。
// 全部為同步 better-sqlite3 呼叫,但以 async handler 包裝以符合 ipcMain.handle 介面。

import { ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type { CustomActionInput, SensorReading, SessionStartInput } from '@shared/types'
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
}
