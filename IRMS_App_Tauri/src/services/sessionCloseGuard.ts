// 應用程式生命週期的單一關窗協調器，不依賴頁面或錯誤邊界掛載。
import { getCurrentWindow } from '@tauri-apps/api/window'
import { sessionController } from './sessionController'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { getT } from '../i18n'

let installation: Promise<boolean> | null = null

export function installSessionCloseGuard(): Promise<boolean> {
  if (installation) return installation
  sessionController.setCloseProtectionAvailable(false)
  installation = (async () => {
    try {
      const window = getCurrentWindow()
      // 一律先攔截，由同步保留權與 destroy 完成之間禁止新療程。
      await window.onCloseRequested(async (event) => {
        event.preventDefault()
        if (!sessionController.reserveWindowClose()) {
          useUiStore.getState().showToast(getT().common.saveBeforeClose, 'error', 10000)
          return
        }
        try {
          await window.destroy()
        } catch (error) {
          sessionController.releaseWindowClose()
          useStore.getState().log(`Window close failed: ${String(error)}`)
          useUiStore.getState().showToast(getT().common.closeProtectionFailed, 'error', 10000)
        }
      })
      sessionController.setCloseProtectionAvailable(true)
      return true
    } catch (error) {
      useStore.getState().log(`Window close protection failed: ${String(error)}`)
      useUiStore.getState().showToast(getT().common.closeProtectionFailed, 'error', 10000)
      return false
    }
  })()
  return installation
}
