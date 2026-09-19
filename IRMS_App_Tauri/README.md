# IRMS Dashboard — Tauri App

智慧復健監測系統的 Windows 桌面監測端。React/TypeScript 負責操作介面與療程協調，
Tauri/Rust 負責 SQLite、BLE、裝置韌體 OTA、App 更新與原生視窗生命週期。

## 開發環境

- Node.js 24
- stable Rust，含 `rustfmt`、`clippy`
- Windows WebView2

```powershell
npm ci
npm run tauri dev
```

## 驗證

```powershell
# TypeScript、Vitest、production frontend build、Rustfmt、Rust tests、Clippy
npm run ci

# 建立 release executable，不產生安裝包
npm run tauri build -- --no-bundle
```

GitHub push/PR 會在 Windows runner 執行同一套 `npm ci` + `npm run ci`。

## 架構邊界

- `src/views`、`src/components`：React presentation layer。
- `src/services`、`src/store`：判定、校準、Session 與 UI/application state。
- `src/platform/irmsApi.ts`：主要的 Tauri IPC adapter，**但非唯一**——`src/services/bluetooth.ts`
  （BLE 相關指令）與 `src/splash.ts`（`splash_ready`）直接呼叫 `invoke()`，未經過此層（見
  [`doc/PROJECT_STATUS.md`](../doc/PROJECT_STATUS.md) 與 2026-09-17 CON-01 稽核紀錄）。
- `src-tauri/src`：SQLite、BLE、OTA、更新器與原生應用生命週期。

不需要硬體的檢查應全部由 `npm run ci` 完成。BLE OTA、GPIO 回饋、真實感測資料與斷線復原
仍必須在實體 ESP32 上執行 release gate；模擬模式不能替代硬體驗證。

專案決策與目前限制見 [`../doc/HOME.md`](../doc/HOME.md) 與
[`../doc/OPTIMIZATION.md`](../doc/OPTIMIZATION.md)。
