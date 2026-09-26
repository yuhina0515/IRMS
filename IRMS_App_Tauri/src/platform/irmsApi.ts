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
import { open } from '@tauri-apps/plugin-dialog'
import { Update, type DownloadEvent } from '@tauri-apps/plugin-updater'
import type {
  CustomAction,
  CustomActionInput,
  FirmwareBinary,
  FirmwareRelease,
  ModuleSyncResult,
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

interface RustFirmwareBinary extends Omit<FirmwareBinary, 'data'> {
  /** Tauri command 經 JSON IPC 傳回 byte array；在 adapter 邊界轉回領域型別 Uint8Array。 */
  data: number[]
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
    async pickBinary() {
      const path = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'ESP32 firmware', extensions: ['bin'] }]
      })
      if (path == null) return null

      const firmware = await invoke<RustFirmwareBinary>('firmware_read_binary', { path })
      return { ...firmware, data: Uint8Array.from(firmware.data) }
    },
    checkLatest: (beta) => invoke<FirmwareRelease>('firmware_check_latest', { beta }),
    async downloadLatest(version, beta) {
      const firmware = await invoke<RustFirmwareBinary>('firmware_download_latest', { expectedVersion: version, beta })
      return { ...firmware, data: Uint8Array.from(firmware.data) }
    },
    isNewer: (device, latest) => invoke<boolean>('firmware_is_newer', { device, latest })
  },
  modules: {
    sync: () => invoke<ModuleSyncResult>('modules_sync')
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
    // 2026-09-14:暫時改回原生視窗框(tauri.conf.json 的 decorations:true)。09-11 起一直
    // 抓不到的視窗控制鈕點擊偏移,經真實硬體滑鼠事件(非 UI Automation)在像素級量測過的座標
    // 上實測仍然命中不了元素——連 hover 都不觸發——證實不是本專案的座標計算錯誤,而是這台
    // 175% DPI 縮放環境下 tao/wry 本身的座標轉換問題(見對應 coding log)。在根因查清楚、或
    // 有非 100% 縮放的環境可交叉驗證之前,先退回原生框避免這整類 bug——原生控制鈕的 hit-test
    // 是 OS 自己處理,不會有這個問題。Phase 3(2026-09-10)的自訂標題列/開機動畫程式碼刻意
    // 保留未刪,回頭切換只需要把這裡跟 tauri.conf.json 的 decorations 一起改回去。
    async hasCustomTitlebar() {
      return false
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
