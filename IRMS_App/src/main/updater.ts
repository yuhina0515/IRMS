// main/updater.ts
// --- GitHub-based 應用程式自動更新(electron-updater)---
// 檢查/背景下載都不需要跳出安裝精靈畫面;下載完成後由 renderer 顯示「重新啟動套用」,
// 使用者按下才呼叫 quitAndInstall(),而不是強制立刻重開,避免打斷正在進行的療程 Session。

import { app, ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { IpcChannel } from '@shared/ipc'
import type { UpdateStatus } from '@shared/types'

// 開發模式沒有打包後的 app-update.yml,autoUpdater 在這裡完全沒有作用對象——
// 跳過整個模組,而不是讓它在 dev 環境噴一堆檢查失敗的雜訊。
const ENABLED = !is.dev

// 開機後延遲檢查,不跟首次載入搶網路/CPU;只在啟動時查一次,不做輪詢——
// 這是療程監測工具,背景定時檢查沒有必要,也不想在使用中途無預警彈更新通知。
const CHECK_DELAY_MS = 5000

let win: BrowserWindow | null = null

function sendStatus(status: UpdateStatus): void {
  win?.webContents.send(IpcChannel.UPDATE_STATUS_CHANGED, status)
}

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  win = mainWindow

  // 版本查詢與手動檢查兩個 handler 一定要註冊,不能跟著 ENABLED 一起跳過——
  // Settings 的版本顯示/檢查更新按鈕在 dev 模式下也會呼叫這兩個 channel,少了
  // handler 會讓 invoke() 直接 reject,而不是「這個功能在 dev 下不能用」這種
  // 可預期的行為。checkNow 在 !ENABLED 時單純 no-op(狀態回報 not-available)。
  ipcMain.handle(IpcChannel.UPDATE_GET_CURRENT_VERSION, () => app.getVersion())
  ipcMain.handle(IpcChannel.UPDATE_CHECK_NOW, () => {
    if (!ENABLED) {
      sendStatus({ state: 'not-available' })
      return
    }
    autoUpdater.checkForUpdates().catch((err: unknown) => console.error('[updater] manual check failed:', err))
  })
  // renderer 送 Settings.allowBetaUpdates 過來,對應到 electron-updater 的 allowPrerelease。
  // 沒收到之前沿用 electron-updater 自己的預設(目前版本本身含 prerelease tag 就是 true)——
  // renderer 在 store 從 localStorage 水合後立刻呼叫一次,通常遠早於下方 CHECK_DELAY_MS。
  ipcMain.handle(IpcChannel.UPDATE_SET_ALLOW_PRERELEASE, (_event, allow: boolean) => {
    autoUpdater.allowPrerelease = allow
  })

  if (!ENABLED) return

  // 靜默背景下載;不用 checkForUpdatesAndNotify()——那個 helper 會自己跳原生系統通知,
  // 這裡改用 renderer 自己畫的 UI(跟 App 其餘部分的視覺語言一致,而不是一則突兀的
  // OS 通知),所以直接掛事件監聽自己控制流程。
  autoUpdater.autoDownload = true
  // 使用者沒有主動點「立即重啟」也沒關係——下次正常關閉 App 時自動套用,而不是
  // 需要記得手動觸發才會更新到新版。想立即套用的人仍可以在 renderer 的提示按鈕上
  // 主動呼叫 UPDATE_RESTART_NOW。
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => sendStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => sendStatus({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => sendStatus({ state: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    sendStatus({ state: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => sendStatus({ state: 'downloaded', version: info.version }))
  autoUpdater.on('error', (err) => {
    // 找不到任何 GitHub release(全新 repo、網路離線等)也會從這裡冒出來——不是使用者
    // 需要看到的錯誤,一律記到 console,只把訊息透過 status 帶給 renderer 自行判斷是否顯示。
    console.error('[updater] error:', err)
    sendStatus({ state: 'error', message: err.message })
  })

  ipcMain.handle(IpcChannel.UPDATE_RESTART_NOW, () => {
    autoUpdater.quitAndInstall()
  })

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err: unknown) => console.error('[updater] startup check failed:', err))
  }, CHECK_DELAY_MS)
}
