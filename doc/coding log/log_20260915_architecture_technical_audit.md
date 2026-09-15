---
tags: [coding-log, architecture, testing, tauri]
summary: "依 09-15 完整 App 測試結果進行架構與技術稽核；統一前端/Rust CI、修正 Rust 嚴格檢查與 DB mutex panic 路徑，並排定硬體 E2E、OTA 選檔、CSP、IPC 契約及測試分層等後續優先序。"
date: 2026-09-15
---

# 2026-09-15 變更日誌 — 架構與技術稽核

> **依據**：[[log_20260915_full_app_test_pass|完整 App 測試]] ·
> [[OPTIMIZATION|優化待辦]] · [[TAURI_MIGRATION_PLAN|Tauri 遷移計畫]]

## 結論

目前 Tauri 版已具備清楚的「React UI → application services/store → platform adapter →
Tauri commands → SQLite/BLE/updater」分層，純邏輯層與資料遷移的測試也相當扎實；這次重新執行
前端 283 項與 Rust 57 項測試全部通過。現階段不需要重寫架構，應優先補齊**真實硬體證據、
發布管線與邊界契約**，再對大型模組做漸進式拆分。

## 本次已落地

1. `npm run ci` 現在同時執行：
   - TypeScript typecheck、Vitest、production build；
   - `cargo fmt --check`、`cargo test`、`cargo clippy -- -D warnings`。
2. 修正 Rust LTTB 實作的兩項 `needless_range_loop`，不改變取樣算法。
3. `latest_version()` 僅供 migration 測試使用，改為 `#[cfg(test)]`，移除正式建置 dead code。
4. DB command 不再對 poisoned mutex 直接 `unwrap()`；改回傳可診斷的 IPC error，避免某一次
   command panic 後讓所有後續 DB 操作持續 panic。
5. 建立 Rust formatter baseline，使後續 CI 能可靠阻擋格式漂移。

## 驗證結果

| 檢查 | 結果 |
|---|---|
| TypeScript | 通過 |
| Vitest | 26 files / 283 tests 通過 |
| Vite production build | 通過 |
| Rust unit + doc tests | 57 tests 通過 |
| Rustfmt | 通過 |
| Clippy（warnings as errors） | 通過 |
| production npm audit | 0 vulnerabilities |

仍有兩個非阻斷警告：Vitest 4 內含 Vite 8，但 App build 仍使用 Vite 5，React plugin 在測試
啟動時因此回報已淘汰的 esbuild 選項；`Leg3D` lazy chunk 為 537.83 kB，超過 Vite 的 500 kB
提示線。兩者不影響這次功能正確性，但應在下一次工具鏈升級與效能量測中處理。

## 架構評估

### 已做對的部分

- 判定、角度、校準、模擬與 downsample 多數是純函式/純服務，可獨立測試。
- `platform/irmsApi.ts` 隔開 UI 與 Tauri IPC，保留更換宿主的接縫。
- SQLite schema 只經 migration 演進，並測試升級、回滾、FK cascade 與 demo/device 隔離。
- Tauri capability 對 splash 視窗採最小權限，更新包也有簽章公鑰驗證。
- 高頻感測流在判定/DB 與 UI 更新間分流，UI 節流不犧牲臨床資料頻率。

### 主要風險與優先序

| 優先序 | 問題 | 影響與建議 |
|---|---|---|
| P0 | 硬體 E2E 證據仍不完整 | 09-15 未驗 OTA、真實資料串流、達標 GPIO、超限警報、斷線收尾與 abandoned recovery；原生最大化按鈕也沒有被精準命中。現有綠燈不能替代這些實測，release gate 應直接引用 issue #3 與 OTA 硬體任務。 |
| P0 | Tauri `firmware.pickBinary()` 仍固定回傳 `null` | OTA 傳輸層存在，但使用者在 Tauri UI 無法選取 `.bin`，因此功能鏈實際未閉合。應先完成 dialog + 檔案讀取 + MD5，再做斷電/斷連復原實測。 |
| P1 | 沒有遠端 CI gate | 這次建立的是本機單一入口；repo 仍無 workflow。應讓 PR 必跑 `npm ci` + `npm run ci`，否則統一腳本仍仰賴開發者手動執行。 |
| P1 | IPC/協定型別在 TS 與 Rust 雙份維護 | `shared/types.ts`、`shared/protocol.ts` 與 Rust `types.rs`、`protocol.rs` 有漂移風險。短期加 serialization/command contract parity tests；中期評估由 schema 或 type generator 產生邊界型別。 |
| P1 | 元件與整合測試分布不均 | 283 項中只有 5 個 `.test.tsx`；`App`、`DashboardView`、`SettingsView`、`UpdateBanner` 沒有元件級覆蓋。優先測「連線→開始→ERR/斷線→收尾」與「選檔→OTA→進度/失敗」使用者旅程。 |
| P1 | CSP 為 `null` | 當前 renderer 沒有動態 HTML 或外部 fetch，實際暴露面有限；但在任何遠端模組/內容能力落地前，必須建立最小 CSP 並以打包版煙霧測試驗證。 |
| P2 | application state 耦合偏高 | `useStore.ts` 637 行，`sessionController` 與 `bluetoothService` 是直接依賴全域 store 的 singleton。暫不重寫；新增旅程測試後，再把 connection/session/settings slice 與 clock/BLE/DB ports 逐步注入。 |
| P2 | 前端工具鏈跨世代 | App Vite 5 與 Vitest 內含 Vite 8 造成淘汰警告。用單一升級批次對齊 Vite/React plugin/Vitest，不能只隱藏 warning。 |
| P3 | 3D chunk 體積 | Three.js 已 lazy-load，初始主畫面不被 538 kB 全數阻塞；只有量測顯示載入延遲影響使用者時，才考慮 tree-shaking、按需載入或替代 renderer。 |

## 建議執行順序

1. 完成 `firmware.pickBinary()`，建立 OTA 無硬體的 adapter/component tests。
2. 在有裝置的時間窗執行硬體 E2E matrix，將結果寫入 issue/release gate。
3. 新增 PR workflow，直接呼叫本次建立的 `npm run ci`。
4. 補兩條跨層旅程測試，再開始 store/service 漸進拆分。
5. 設定 CSP 並對打包版做 updater、字型、圖片、事件 IPC 煙霧測試。
6. 最後才處理工具鏈升級與 3D bundle；它們目前不是臨床正確性的瓶頸。

## 本次刻意不做

- 不修改 UI 或視覺設計；這不屬於本次工程稽核，也受設計權責規則約束。
- 不因檔案較大就全面重寫 store/service；先以使用者旅程測試建立安全網。
- 不把 09-15 的 UI Automation 結果誤稱為完整 E2E；硬體 GPIO、BLE OTA 與斷線復原仍需實機。
