// platform/irmsApi.ts (Tauri port)
// --- 平台轉接層,Tauri 版 ---
// Phase 2a(IRMS_App)把這個模組的介面(IrmsApi)定出來,call site 全部改成
// import { irms } from '<relative>/platform/irmsApi'。這裡是那個介面在 Tauri 這側
// 唯一的真正實作:sessions/data/actions 是對 src-tauri/src/commands.rs 的機械式
// invoke() 包裝;windowControls/updates 依 TAURI_MIGRATION_PLAN.md 的既定判斷,
// 不是機械式代換——前者用 @tauri-apps/api/window 做出真正可用的最小實作,
// 後者(auto-update)與 firmware.pickBinary(檔案選取+MD5)刻意留白,分別對應
// task #54(Phase 4 自動更新)與新增的 firmware-picker 任務,而不是假裝已經做完。

import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getVersion } from '@tauri-apps/api/app'
import type {
  CustomAction,
  CustomActionInput,
  IrmsApi,
  Session,
  SensorReading,
  SessionStartInput,
  StoredReading
} from '@shared/types'

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
    // Phase 3(task #53)才會把視窗換成 decorations:false 的無邊框自繪標題列;
    // 在那之前視窗仍是原生裝飾,TopHeader 必須知道「不要疊自己畫的一份」。
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
    // task #54(Phase 4:electron-updater -> tauri-plugin-updater)之前,更新生命週期
    // 不存在——no-op 而非拋例外,讓 Settings 的「檢查更新」按鈕維持可點但無效果,
    // UpdateBanner 也不會因為訂閱不到事件而出錯,只是永遠不會顯示。
    async checkNow() {},
    async restartNow() {},
    async setAllowPrerelease() {},
    onStatusChange() {
      return () => {}
    }
  }
}

function warnFirmwarePickerUnimplemented(): void {
  console.warn('irms.firmware.pickBinary: not yet implemented in the Tauri build (see task tracker)')
}
