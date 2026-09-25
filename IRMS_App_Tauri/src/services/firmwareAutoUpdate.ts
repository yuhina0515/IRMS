// services/firmwareAutoUpdate.ts
// 閒置時自動更新裝置韌體(2026-09-25 使用者裁定,見 doc/AUTO_PUSH_PLAN.md)。
//
// 觸發點:裝置連上後、每場 Session 結束後。只在「真實裝置已連線、沒有 Session、沒有
// 硬體錯誤」時動手;Session 進行中一律延後——flash 寫入會讓取樣與回饋卡頓,患者還戴著
// 裝置時不能冒這個險(與 Settings 手動 OTA 的既有守則相同)。
//
// 同一版本在同一次 App 執行中只自動嘗試一次:失敗後不重試,避免裝置在「下載→傳輸→
// 失敗→重連→再傳」之間無限循環;使用者仍可到 Settings 手動更新。
import { create } from 'zustand'
import type { FirmwareBinary, FirmwareRelease } from '@shared/types'
import type { OtaProgress } from './bluetooth'

export type AutoUpdatePhase =
  | 'idle'
  | 'checking'
  | 'up_to_date'
  | 'deferred'
  | 'incompatible'
  | 'downloading'
  | 'updating'
  | 'done'
  | 'error'

export interface AutoUpdateStatus {
  phase: AutoUpdatePhase
  deviceVersion?: string | null
  latestVersion?: string
  percent?: number
  message?: string
}

export const useFirmwareAutoStore = create<{ status: AutoUpdateStatus; set(s: AutoUpdateStatus): void }>((set) => ({
  status: { phase: 'idle' },
  set: (status) => set({ status })
}))

/** OTA 進行中(下載或傳輸):Start Session 必須停用 */
export function firmwareUpdateBusy(status: AutoUpdateStatus): boolean {
  return status.phase === 'downloading' || status.phase === 'updating'
}

export interface AutoUpdateDeps {
  state(): { connected: boolean; simulated: boolean; sessionRunning: boolean; hardwareError: boolean }
  readDeviceVersion(): Promise<string | null>
  checkLatest(): Promise<FirmwareRelease>
  isNewer(device: string | null, latest: string): Promise<boolean>
  download(version: string): Promise<FirmwareBinary>
  flash(firmware: FirmwareBinary, onProgress: (p: OtaProgress) => void): Promise<{ ok: boolean; message: string }>
  report(status: AutoUpdateStatus): void
  log(message: string): void
}

export function createFirmwareAutoUpdater(deps: AutoUpdateDeps): { run(): Promise<void> } {
  let running = false
  const attempted = new Set<string>()

  const eligible = (): 'ok' | 'skip' | 'deferred' => {
    const s = deps.state()
    if (!s.connected || s.simulated || s.hardwareError) return 'skip'
    return s.sessionRunning ? 'deferred' : 'ok'
  }

  return {
    async run() {
      if (running) return
      const gate = eligible()
      if (gate === 'skip') return
      if (gate === 'deferred') {
        deps.report({ phase: 'deferred', message: 'Session 進行中,韌體檢查延後到結束後' })
        return
      }
      running = true
      let deviceVersion: string | null = null
      let latest: string | undefined
      try {
        deps.report({ phase: 'checking' })
        const release = await deps.checkLatest()
        latest = release.version
        deviceVersion = await deps.readDeviceVersion()
        if (!(await deps.isNewer(deviceVersion, release.version))) {
          deps.report({ phase: 'up_to_date', deviceVersion, latestVersion: latest })
          return
        }
        if (!release.appCompatible) {
          deps.report({
            phase: 'incompatible',
            deviceVersion,
            latestVersion: latest,
            message: `韌體 ${latest} 需要較新的 App,請先更新 App`
          })
          return
        }
        if (attempted.has(latest)) {
          deps.report({
            phase: 'error',
            deviceVersion,
            latestVersion: latest,
            message: `自動更新到 ${latest} 已失敗過一次,請到設定頁手動更新`
          })
          return
        }
        attempted.add(latest)

        deps.report({ phase: 'downloading', deviceVersion, latestVersion: latest })
        const firmware = await deps.download(latest)
        // 下載需要時間:這段期間使用者可能已經開始 Session
        if (eligible() !== 'ok') {
          attempted.delete(latest)
          deps.report({ phase: 'deferred', deviceVersion, latestVersion: latest, message: '狀態改變,韌體更新延後' })
          return
        }
        deps.log(`Auto firmware update ${deviceVersion ?? 'unknown'} → ${latest}`)
        deps.report({ phase: 'updating', deviceVersion, latestVersion: latest, percent: 0 })
        const result = await deps.flash(firmware, (p) => {
          const percent = p.totalBytes > 0 ? Math.round((p.bytesSent / p.totalBytes) * 100) : 0
          deps.report({ phase: 'updating', deviceVersion, latestVersion: latest, percent })
        })
        deps.report(
          result.ok
            ? { phase: 'done', deviceVersion, latestVersion: latest, message: `裝置韌體已更新到 ${latest},裝置重新啟動中` }
            : { phase: 'error', deviceVersion, latestVersion: latest, message: result.message }
        )
      } catch (err) {
        deps.report({
          phase: 'error',
          deviceVersion,
          latestVersion: latest,
          message: err instanceof Error ? err.message : String(err)
        })
      } finally {
        running = false
      }
    }
  }
}
