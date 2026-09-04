// main/index.ts
// --- Electron 主進程進入點 ---
// 職責:初始化資料庫、註冊 IPC、建立視窗、處理 Web Bluetooth 自動配對。

import { app, shell, screen, ipcMain, BrowserWindow, nativeTheme, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { IpcChannel } from '@shared/ipc'
import { DEVICE_NAME_PREFIX } from '@shared/protocol'
import { closeDatabase, initDatabase } from './db'
import { registerIpcHandlers } from './ipc'
import { setupAutoUpdater } from './updater'

// 啟用 Web Bluetooth(Electron 預設關閉)
app.commandLine.appendSwitch('enable-web-bluetooth', 'true')
app.commandLine.appendSwitch('enable-experimental-web-platform-features', 'true')

// 單例鎖:沒有這一段,每次點桌面捷徑都會開一個全新、互不相干的 process,
// 全部搶著開同一個 better-sqlite3 (WAL) 檔——鎖衝突時 initDatabase() 拋出的例外
// 原本沒有任何地方接住(見下方 whenReady 的 .catch()),後果是視窗開不出來、
// 例外被吞掉、process 卻留在背景不會自己關掉,使用者只會看到「點了沒反應」
// 然後越點越多背景 process(2026-08-28 實測發現,packaged v1.0.2 才第一次被人踩到——
// dev 模式一次只會有一個 electron-vite 進程,從來不會觸發這條路徑)。
// 拿不到鎖的 process 必須立刻自我了斷,不能等 whenReady,否則它已經在跟第一個
// process 搶 DB 檔的路上了。
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

// RDP session:2026-08-28 曾發現這個 session 下 titleBarOverlay 依賴的 DWM 合成會
// 卡死(ready-to-show 永遠不來),當時關掉 Chromium 自己的 GPU 加速當第二道防線。
// 2026-09-04 改用 frame:false 完全自訂標題列(見 createWindow())取代 titleBarOverlay
// 後,已在同一台機器、同一種 RDP session(SESSIONNAME=RDP-Tcp#0)上重新實測三次
// 啟動,frame:false 不卡——不是理論推測,是同一個曾經壞掉的環境重新跑過。
// GPU 加速仍先關著,便宜且無害,沒有理由為了這次改動連帶去驗證它是否還需要。
const IS_RDP_SESSION = process.env['SESSIONNAME']?.startsWith('RDP-Tcp') ?? false
if (IS_RDP_SESSION) {
  app.disableHardwareAcceleration()
}

/** 視窗底色,跟隨系統主題 */
function themeColors(): { bg: string } {
  return nativeTheme.shouldUseDarkColors ? { bg: '#0b0f1f' } : { bg: '#eef2fb' }
}

/**
 * 13" 1366×768 筆電在 Windows 125% 縮放下,邏輯解析度只剩約 1093×614 DIP,扣工作列後
 * 可用高度約 576–590——舊的 minHeight:680 比這個機型的整個螢幕邏輯高度還高,視窗連
 * 自己宣告的最小尺寸都無法在這類硬體上完整顯示(2026-08-07 會議發現)。改為:
 * (1) minHeight 降到這類硬體上留有安全邊際的高度;(2) 初始尺寸夾在主螢幕工作區內,
 * 避免在小螢幕上一開窗就比工作區還大而被系統硬裁。
 */
const MIN_WIDTH = 1024
const MIN_HEIGHT = 600

function initialWindowSize(): { width: number; height: number } {
  const work = screen.getPrimaryDisplay().workAreaSize
  return {
    width: Math.max(MIN_WIDTH, Math.min(1280, work.width)),
    height: Math.max(MIN_HEIGHT, Math.min(820, work.height))
  }
}

function createWindow(): void {
  const initial = themeColors()
  const size = initialWindowSize()
  const mainWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    title: 'IRMS Dashboard',
    // 完全自訂標題列(2026-09-04,取代先前的 titleBarStyle:'hidden' + titleBarOverlay):
    // 連 RDP session 都一併適用(見上方 IS_RDP_SESSION 註解,已重新實測)。renderer
    // 的 TopHeader 自己畫拖曳列與最小化/最大化/關閉鈕(見 window:minimize 等 IPC handler)。
    frame: false,
    // 視窗底色跟隨系統主題,避免載入瞬間閃色
    backgroundColor: initial.bg,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 系統主題切換時,視窗底色跟著換,避免變成唯一沒跟上主題的地方
  nativeTheme.on('updated', () => {
    mainWindow.setBackgroundColor(themeColors().bg)
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // 外部連結改用系統瀏覽器開啟,而非在 app 內導航
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  registerWindowControlHandlers(mainWindow)
  setupAutoUpdater(mainWindow)
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
 * 自訂標題列的視窗控制 IPC——用 `BrowserWindow.fromWebContents(event.sender)` 取得
 * 發送請求的那個視窗,而非閉包捕捉 mainWindow,理由與 registerIpcHandlers() 的其他
 * handler 一致(維持同一種寫法,不為了這幾個 handler 另開一套模式)。
 * maximize/unmaximize 事件則需要視窗參照本身,綁在這裡(建立當下),而非 ipc.ts。
 */
function registerWindowControlHandlers(win: BrowserWindow): void {
  ipcMain.handle(IpcChannel.WINDOW_MINIMIZE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.handle(IpcChannel.WINDOW_TOGGLE_MAXIMIZE, (event) => {
    const w = BrowserWindow.fromWebContents(event.sender)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.handle(IpcChannel.WINDOW_CLOSE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle(IpcChannel.WINDOW_IS_MAXIMIZED, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })
  // 桌面版(frame:false)一律 true。保留這個查詢而非直接刪掉整條路徑,是留給未來
  // 行動/平板/穿戴平台(使用者規劃中的 Android/iOS/iPadOS/watchOS)——那些平台的
  // window chrome 概念完全不同,renderer 屆時需要同一種方式判斷「這個平台要不要
  // 畫自己的拖曳列/控制鈕」。
  ipcMain.handle(IpcChannel.WINDOW_HAS_CUSTOM_TITLEBAR, () => true)

  const notify = (): void => {
    win.webContents.send(IpcChannel.WINDOW_MAXIMIZED_CHANGED, win.isMaximized())
  }
  win.on('maximize', notify)
  win.on('unmaximize', notify)
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

if (gotSingleInstanceLock) {
  // 使用者點了第二次捷徑(或雙擊):不開新視窗,把已存在的那個叫到前景。
  // 沒有這段,單例鎖只會讓第二個 process 悄悄退出,使用者點了還是「沒反應」。
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })

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
  }).catch((err: unknown) => {
    // 啟動失敗(例如 DB 開啟時撞上檔案鎖)原本完全沒人接:視窗開不出來、例外變成
    // 未處理的 rejection 被靜靜吞掉,process 卻留著不退出——使用者只看到「點了
    // 沒反應」。這裡至少跳個對話框、確保失敗的 process 真的會結束而不是變成
    // 隱形殭屍。
    dialog.showErrorBox('IRMS 啟動失敗', String(err))
    app.quit()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // 關閉連線並 checkpoint WAL;不做的話 -wal 檔會跨執行無限增長
  app.on('will-quit', () => closeDatabase())
}
