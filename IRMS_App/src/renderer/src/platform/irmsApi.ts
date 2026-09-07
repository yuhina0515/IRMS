// renderer/platform/irmsApi.ts
// --- Named seam for the backend API, in place of the implicit `window.irms` global ---
//
// This is the entire point of Phase 2a of the Tauri migration (see doc/TAURI_MIGRATION_PLAN.md):
// after this refactor, swapping Electron's contextBridge-injected window.irms for a Tauri
// invoke/listen-backed implementation is "replace this one file," not N call sites scattered
// across components/services. Zero behavior change today — this still just talks to
// window.irms.
//
// Uses getters, NOT `export const irms = window.irms`: test/irmsStub.ts's installIrmsStub()
// reassigns `window.irms` to a brand-new stub object mid-test (see SettingsView/HistoryView
// tests that call installIrmsStub(overrides) to override return values for one test). A plain
// snapshot-at-import-time re-export would capture the first stub and silently ignore later
// overrides — these getters re-read the current window.irms on every property access instead.
import type { IrmsApi } from '@shared/types'

export const irms: IrmsApi = {
  get sessions() {
    return window.irms.sessions
  },
  get data() {
    return window.irms.data
  },
  get actions() {
    return window.irms.actions
  },
  get firmware() {
    return window.irms.firmware
  },
  get windowControls() {
    return window.irms.windowControls
  },
  get updates() {
    return window.irms.updates
  }
}
