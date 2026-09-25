// services/modulesInstall.ts
// 接上真實的 IPC / asset 協定。獨立於 modules.ts,讓核心載入邏輯的測試不需要 Tauri 環境。
import { convertFileSrc } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { irms } from '../platform/irmsApi'
import { useStore } from '../store/useStore'
import { loadModules } from './modules'

export async function installModules(): Promise<void> {
  await loadModules({
    sync: () => irms.modules.sync(),
    // asset: 只服務 <app data>/modules/*.js(tauri.conf.json assetProtocol.scope),
    // 且 script-src 只多開 asset:,不開 'unsafe-eval' 或 blob:。
    importModule: (path) => import(/* @vite-ignore */ convertFileSrc(path)),
    appVersion: await getVersion().catch(() => '0.0.0'),
    log: (message) => useStore.getState().log(message)
  })
}
