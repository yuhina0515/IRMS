---
tags: [coding-log, architecture, security, tauri, ota, ci]
summary: "接手 09-15 架構稽核的第一階段修復：完成 Tauri 韌體選檔/驗證/MD5 鏈、最小 CSP、遠端 CI，並將 Vite/Vitest 工具鏈升級至無已知 npm 漏洞的相容世代。"
date: 2026-09-15
---

# 2026-09-15 變更日誌 — 架構修復 Phase 1

> **起點**：[[log_20260915_architecture_technical_audit|架構與技術稽核]] ·
> [[log_20260915_full_app_test_pass|完整 App 測試]]

## 目的

優先關閉不需要實體裝置就能修好的 release 缺口：Tauri OTA 選檔固定回傳 `null`、沒有遠端
CI gate、renderer 沒有 CSP，以及 Vite 5 已有 Windows path traversal 公告且與 Vitest 的 Vite
世代不一致。硬體 OTA、GPIO 與斷線復原仍保留為實機 release gate，不在沒有裝置時假裝完成。

## 已完成

### 1. Tauri 韌體選檔鏈閉合

- 新增 `@tauri-apps/plugin-dialog` / `tauri-plugin-dialog`，main window 僅授予
  `dialog:allow-open`，沒有加入通用 filesystem capability。
- `platform/irmsApi.ts` 以原生 dialog 選取單一 `.bin`，取消是正常的 `null`。
- 新增 Rust `firmware_read_binary` command：canonicalize 路徑、檢查副檔名、拒絕目錄、空檔與
  大於整顆 ESP32 flash 的 4 MB 檔案，讀檔並計算 MD5。
- 檔案 I/O 與 hash 放在 `spawn_blocking`，不阻塞 async executor。
- Tauri JSON IPC 回來的 `number[]` 在 adapter 邊界轉回 `Uint8Array`，維持既有 domain contract。
- Settings 捕捉讀檔錯誤並以 toast 告知，不再產生未處理 Promise rejection。
- 新增 3 個 Rust 邊界測試與 2 個 TypeScript adapter tests。

### 2. Renderer 安全基線

- 依 [Tauri v2 CSP 指引](https://v2.tauri.app/security/csp/)設定 production CSP：預設只允許
  self；IPC 只允許 `ipc:` / `http://ipc.localhost`；圖片額外允許 asset/data/blob；inline style
  因現有 React style props 暫時保留。
- dev CSP 只額外開放固定 HMR websocket `ws://localhost:1421`。
- `tauri build --no-bundle` 成功，證實設定、plugin、capability 與 assets 可產出 release exe。

### 3. CI 與工具鏈

- 新增 `.github/workflows/ci.yml`：Windows runner、Node 24、stable Rust + rustfmt/clippy、
  `npm ci` 後直接執行統一的 `npm run ci`。
- Vite 5 → 8.3、`@vitejs/plugin-react` → 6.1、Vitest 4 → 5.0，工具鏈世代對齊。
- 升級前 `npm audit` 為 1 moderate + 1 high；升級後為 **0 vulnerabilities**。
- 原本 React plugin 的 esbuild/oxc 淘汰警告已消失。

## 驗證

- `npm run ci`：
  - 27 個 Vitest files / **285 tests** 全過；
  - TypeScript typecheck、Vite production build 全過；
  - Rustfmt、Clippy warnings-as-errors 全過；
  - **60 Rust tests** 全過。
- `npm audit`：0 vulnerabilities。
- `npm run tauri build -- --no-bundle`：成功產出
  `src-tauri/target/release/irms_app_tauri.exe`。

## 尚未關閉

- 真實 native dialog 點選 `.bin` 的人工煙霧測試；編譯、Rust 讀檔與 TS adapter 已驗證。
- OTA 真實 BLE 傳輸、更新後重連/GATT cache、途中斷電與斷連復原。
- 達標 GPIO、超限警報、斷線 session 收尾及 abandoned recovery 的硬體 E2E。
- App/Dashboard/Settings 的完整跨層旅程測試；本次只補最靠近新邊界的 5 項測試。
- Three.js `Leg3D` lazy chunk 約 548 kB，仍是唯一 build warning；它不是本批正確性阻斷項。
