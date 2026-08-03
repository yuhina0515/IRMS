// main/index.ts
// --- Electron 主進程進入點 ---
// 職責:初始化資料庫、註冊 IPC、建立視窗、處理 Web Bluetooth 自動配對。

import { app, shell, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { DEVICE_NAME_PREFIX } from '@shared/protocol'
import { closeDatabase, initDatabase } from './db'
import { registerIpcHandlers } from './ipc'

// 啟用 Web Bluetooth(Electron 預設關閉)
app.commandLine.appendSwitch('enable-web-bluetooth', 'true')
app.commandLine.appendSwitch('enable-experimental-web-platform-features', 'true')

/** 視窗底色/標題列疊層色,跟隨系統主題(對齊 renderer 的 --bg-0/--text) */
function themeColors(): { bg: string; symbol: string } {
  return nativeTheme.shouldUseDarkColors
    ? { bg: '#0b0f1f', symbol: '#ffffff' }
    : { bg: '#eef2fb', symbol: '#1c1c1e' }
}

function createWindow(): void {
  const initial = themeColors()
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: 'IRMS Dashboard',
    // 隱藏標題列與黑邊,只保留右上角原生最小化/最大化/關閉鈕(疊在網頁內容上),
    // 讓 renderer 的內容一路延伸到視窗頂端(滿版)
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: initial.bg, symbolColor: initial.symbol, height: 40 },
    // 視窗底色跟隨系統主題,避免載入瞬間閃色
    backgroundColor: initial.bg,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 系統主題切換時,標題列疊層與底色一併跟著換,避免變成唯一沒跟上主題的地方
  nativeTheme.on('updated', () => {
    const c = themeColors()
    mainWindow.setBackgroundColor(c.bg)
    mainWindow.setTitleBarOverlay({ color: c.bg, symbolColor: c.symbol, height: 40 })
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

  // 掃描逾時:若一直找不到 IRMS 裝置,15 秒後以空字串取消選擇,
  // 讓 renderer 的 requestDevice 以 NotFoundError 收場,而非永久 pending
  const SCAN_TIMEOUT_MS = 15000
  let scanTimeout: NodeJS.Timeout | null = null

  win.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault()
    console.log(
      `[BLE] scan event: ${deviceList.length} device(s):`,
      deviceList.map((d) => `"${d.deviceName ?? '(no name)'}"`).join(', ') || '(empty)'
    )
    const target = deviceList.find((d) => d.deviceName?.includes(DEVICE_NAME_PREFIX))
    if (target) {
      console.log(`[BLE] target found: "${target.deviceName}" → pairing`)
      if (scanTimeout) {
        clearTimeout(scanTimeout)
        scanTimeout = null
      }
      callback(target.deviceId)
      return
    }
    // 尚未發現目標:掛上一次性逾時後等待 Electron 於掃到更多裝置時再次觸發
    if (!scanTimeout) {
      scanTimeout = setTimeout(() => {
        scanTimeout = null
        console.log('[BLE] scan timeout — IRMS device not seen, cancelling request')
        callback('')
      }, SCAN_TIMEOUT_MS)
    }
  })

  win.on('closed', () => {
    if (scanTimeout) clearTimeout(scanTimeout)
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

// 關閉連線並 checkpoint WAL;不做的話 -wal 檔會跨執行無限增長
app.on('will-quit', () => closeDatabase())
