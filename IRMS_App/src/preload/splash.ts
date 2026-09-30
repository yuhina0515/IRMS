// preload/splash.ts — separate, minimal preload for the splash BrowserWindow. Deliberately not
// the full IrmsApi bridge (preload/index.ts): the splash has no need for DB/BLE/window-control
// access, only the two one-shot signals that drive its stage-1 -> stage-2 handoff.
import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '@shared/ipc'

contextBridge.exposeInMainWorld('irmsSplash', {
  onAdvance: (cb: () => void) => ipcRenderer.once(IpcChannel.SPLASH_ADVANCE, () => cb()),
  onFadeOutFrame: (cb: () => void) => ipcRenderer.once(IpcChannel.SPLASH_FADE_OUT_FRAME, () => cb())
})
