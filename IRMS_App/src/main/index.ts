// main/index.ts
// --- Electron 主進程進入點 ---
// 職責:初始化資料庫、註冊 IPC、建立視窗、處理 Web Bluetooth 自動配對。

import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { DEVICE_NAME_PREFIX } from '@shared/protocol'
import { initDatabase } from './db'
import { registerIpcHandlers } from './ipc'

// 啟用 Web Bluetooth(Electron 預設關閉)
app.commandLine.appendSwitch('enable-web-bluetooth', 'true')
app.commandLine.appendSwitch('enable-experimental-web-platform-features', 'true')

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: 'IRMS Dashboard',
    backgroundColor: '#0b1020',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // 外部連結改用系統瀏覽器開啟,而非在 app 內導航
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  setupBluetoothAutoPairing(mainWindow)

  // electron-vite:開發模式載入 dev server,正式模式載入打包後的 HTML
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Web Bluetooth 裝置選擇與配對:
 * 自動挑選名稱含 "IRMS" 的裝置,省去手動選擇視窗。
 * 依 Electron 行為,'select-bluetooth-device' 會在掃描到新裝置時重複觸發,
 * 直到呼叫 callback 為止;故只要在目標出現時選取即可,無需手動處理 device-added。
 */
function setupBluetoothAutoPairing(win: BrowserWindow): void {
  const ses = win.webContents.session

  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(true))
  ses.setPermissionCheckHandler(() => true)
  ses.setDevicePermissionHandler(() => true)
  ses.setBluetoothPairingHandler((_details, callback) => callback({ confirmed: true }))

  win.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault()
    const target = deviceList.find((d) => d.deviceName?.includes(DEVICE_NAME_PREFIX))
    if (target) callback(target.deviceId)
    // 尚未發現目標時不呼叫 callback,Electron 會在掃到更多裝置時再次觸發此事件
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.irms.app')

  app.on('browser-window-created', (_e, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDatabase(app.getPath('userData'))
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
