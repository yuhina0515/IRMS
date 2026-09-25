// services/firmwareAutoUpdateInstall.ts
// 把 firmwareAutoUpdate 的純邏輯接上真實的 store / BLE / IPC。分成獨立檔案,是為了讓
// 核心邏輯的測試不必載入 bluetooth.ts(它在 import 時就會向 Tauri 註冊事件監聽)。
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { irms } from '../platform/irmsApi'
import { bluetoothService } from './bluetooth'
import { createFirmwareAutoUpdater, useFirmwareAutoStore } from './firmwareAutoUpdate'

/** 連線剛建立時 GATT 探索、通知訂閱仍在收尾,稍等再讀版本特徵值 */
const SETTLE_MS = 3000

export function installFirmwareAutoUpdate(): () => void {
  const updater = createFirmwareAutoUpdater({
    state: () => {
      const s = useStore.getState()
      return {
        connected: s.isConnected,
        simulated: bluetoothService.isSimulated,
        sessionRunning: s.session.running,
        hardwareError: s.hardwareError != null
      }
    },
    readDeviceVersion: () => bluetoothService.getDeviceFirmwareVersion(),
    checkLatest: () => irms.firmware.checkLatest(),
    isNewer: (device, latest) => irms.firmware.isNewer(device, latest),
    download: (version) => irms.firmware.downloadLatest(version),
    flash: (firmware, onProgress) => bluetoothService.performOtaUpdate(firmware, onProgress),
    report: (status) => {
      useFirmwareAutoStore.getState().set(status)
      const toast = useUiStore.getState().showToast
      if (status.phase === 'updating' && status.percent === 0) {
        toast(`正在自動更新裝置韌體到 ${status.latestVersion},請勿關閉 App 或讓裝置斷電`, 'info')
      } else if (status.phase === 'done' && status.message) toast(status.message, 'success')
      else if ((status.phase === 'error' || status.phase === 'incompatible') && status.message) {
        toast(`韌體自動更新:${status.message}`, 'warning')
      }
    },
    log: (message) => useStore.getState().log(message)
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => void updater.run(), SETTLE_MS)
  }
  const unsubscribe = useStore.subscribe((s, prev) => {
    if (s.isConnected && !prev.isConnected) schedule()
    else if (!s.session.running && prev.session.running) schedule()
  })
  return () => {
    clearTimeout(timer)
    unsubscribe()
  }
}
