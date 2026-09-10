// platform/irmsApi.ts (Tauri port)
// --- 平台轉接層,Tauri 版 ---
// Phase 2a(IRMS_App)把這個模組的介面(IrmsApi)定出來,call site 全部改成
// import { irms } from '<relative>/platform/irmsApi'。這裡是那個介面在 Tauri 這側
// 唯一的真正實作:sessions/data/actions 是對 src-tauri/src/commands.rs 的機械式
// invoke() 包裝;windowControls 用 @tauri-apps/api/window 做出真正可用的最小實作;
// updates(Phase 4,2026-09-10)對 src-tauri/src/update.rs 的 `update_check` 自訂指令
// (唯一需要客製 Rust 的部分,見該檔案開頭註解——beta/stable 頻道選擇需要
// UpdaterBuilder::endpoints(),JS 版 check() 的 CheckOptions 沒有這個能力),
// 拿到的 metadata 直接餵給 @tauri-apps/plugin-updater 匯出的 Update 類別,下載/安裝
// 走該外掛原生的 resource/事件機制。firmware.pickBinary(檔案選取+MD5)仍刻意留白,
// 對應新增的 firmware-picker 任務,不假裝已經做完。

import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getVersion } from '@tauri-apps/api/app'
import { Update, type DownloadEvent } from '@tauri-apps/plugin-updater'
import type {
  CustomAction,
  CustomActionInput,
  IrmsApi,
  Session,
  SensorReading,
  SessionStartInput,
  StoredReading,
  UpdateStatus
} from '@shared/types'

interface UpdateMetadata {
  rid: number
  currentVersion: string
  version: string
  date?: string
  body?: string
  rawJson: Record<string, unknown>
}

// dev 模式沒有打包後可供比對的 endpoint 內容,checkNow 在這裡仍可手動呼叫,但不自動背景
// 檢查——比照 main/updater.ts 的 ENABLED 閘門(is.dev),避免開發時對外發出無意義的請求。
const AUTO_CHECK_ENABLED = !import.meta.env.DEV
const AUTO_CHECK_DELAY_MS = 5000

let currentUpdate: Update | null = null
let allowBeta = false
const statusListeners = new Set<(status: UpdateStatus) => void>()

function emitStatus(status: UpdateStatus): void {
  statusListeners.forEach((cb) => cb(status))
}

async function performCheck(): Promise<void> {
  emitStatus({ state: 'checking' })
  try {
    const metadata = await invoke<UpdateMetadata | null>('update_check', { allowBeta })
    if (!metadata) {
      emitStatus({ state: 'not-available' })
      return
    }
    currentUpdate = new Update({
      rid: metadata.rid,
      currentVersion: metadata.currentVersion,
      version: metadata.version,
      date: metadata.date,
      body: metadata.body,
      rawJson: metadata.rawJson
    })
    emitStatus({ state: 'available', version: currentUpdate.version })

    // 靜默背景下載,比照 main/updater.ts 的 autoDownload:true——下載完成後由
    // UpdateBanner 顯示「重新啟動套用」,使用者按下才呼叫 restartNow()。
    let downloadedBytes = 0
    let totalBytes: number | undefined
    await currentUpdate.download((event: DownloadEvent) => {
      if (event.event === 'Started') {
        downloadedBytes = 0
        totalBytes = event.data.contentLength
      } else if (event.event === 'Progress') {
        downloadedBytes += event.data.chunkLength
        const percent = totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0
        emitStatus({ state: 'downloading', percent })
      }
    })
    emitStatus({ state: 'downloaded', version: currentUpdate.version })
  } catch (err) {
    console.error('[updater] check/download failed:', err)
    emitStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

if (AUTO_CHECK_ENABLED) {
  setTimeout(() => void performCheck(), AUTO_CHECK_DELAY_MS)
}

export const irms: IrmsApi = {
  sessions: {
    async start(input: SessionStartInput) {
      const sessionId = await invoke<number>('sessions_start', { input })
      return { sessionId }
    },
    async end(sessionId: number, repsCompleted: number) {
      await invoke('sessions_end', { sessionId, repsCompleted })
      return { success: true }
    },
    async progress(sessionId: number, reps: number) {
      await invoke('sessions_update_reps', { sessionId, repsCompleted: reps })
      return { success: true }
    },
    list() {
      return invoke<Session[]>('sessions_list')
    },
    getData(sessionId: number, maxPoints?: number) {
      return invoke<StoredReading[]>('sessions_get_data', { sessionId, maxPoints: maxPoints ?? null })
    },
    async delete(sessionId: number) {
      await invoke('sessions_delete', { sessionId })
      return { success: true }
    },
    async purgeDemo() {
      const deleted = await invoke<number>('sessions_purge_demo')
      return { deleted }
    }
  },
  data: {
    async appendBatch(sessionId: number, readings: SensorReading[]) {
      const count = await invoke<number>('data_append_batch', { sessionId, readings })
      return { count }
    }
  },
  actions: {
    list() {
      return invoke<CustomAction[]>('actions_list')
    },
    create(input: CustomActionInput) {
      return invoke<CustomAction>('actions_create', { input })
    },
    update(id: number, input: CustomActionInput) {
      return invoke<CustomAction>('actions_update', { id, input })
    },
    async delete(id: number) {
      await invoke('actions_delete', { id })
      return { success: true }
    },
    restoreDefaults() {
      return invoke<CustomAction[]>('actions_restore_defaults')
    }
  },
  firmware: {
    // 尚未實作:需要 tauri-plugin-dialog(選檔)+ 讀檔 + MD5,追蹤於新任務
    // 「firmware.pickBinary 的 Tauri 實作(檔案選取器 + MD5)」,與 OTA 硬體驗證
    // (task #55)分開追蹤,因為這一段本身不需要硬體就能做,只是還沒排到。
    // SettingsView 的呼叫端本來就把 null 當成「使用者取消」處理,回傳 null
    // 讓畫面維持在「尚未選擇檔案」的安全狀態,不會拋例外炸畫面。
    async pickBinary() {
      warnFirmwarePickerUnimplemented()
      return null
    }
  },
  windowControls: {
    async minimize() {
      await getCurrentWindow().minimize()
    },
    async toggleMaximize() {
      await getCurrentWindow().toggleMaximize()
    },
    async close() {
      await getCurrentWindow().close()
    },
    isMaximized() {
      return getCurrentWindow().isMaximized()
    },
    // Phase 3(2026-09-10):tauri.conf.json 的主視窗已改 decorations:false,
    // TopHeader 改畫自己的拖曳列/控制鈕,不再疊原生裝飾。
    async hasCustomTitlebar() {
      return true
    },
    onMaximizedChange(cb: (maximized: boolean) => void) {
      let cancelled = false
      let unlisten: (() => void) | null = null
      void getCurrentWindow()
        .onResized(() => {
          void getCurrentWindow()
            .isMaximized()
            .then((maximized) => cb(maximized))
        })
        .then((fn) => {
          if (cancelled) fn()
          else unlisten = fn
        })
      return () => {
        cancelled = true
        unlisten?.()
      }
    }
  },
  updates: {
    getCurrentVersion() {
      return getVersion()
    },
    async checkNow() {
      await performCheck()
    },
    async restartNow() {
      // Windows:install() 成功送出安裝程式後會直接結束 App(見 update.rs 開頭註解),
      // 不需要另外呼叫 relaunch——這點行為跟 electron-updater 的 quitAndInstall() 一致。
      if (!currentUpdate) return
      await currentUpdate.install()
    },
    async setAllowPrerelease(allow: boolean) {
      allowBeta = allow
    },
    onStatusChange(cb: (status: UpdateStatus) => void) {
      statusListeners.add(cb)
      return () => {
        statusListeners.delete(cb)
      }
    }
  }
}

function warnFirmwarePickerUnimplemented(): void {
  console.warn('irms.firmware.pickBinary: not yet implemented in the Tauri build (see task tracker)')
}
