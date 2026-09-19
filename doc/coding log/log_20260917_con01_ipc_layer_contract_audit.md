---
tags: [coding-log, protocol, con-01]
summary: Audited the Tauri IPC command layer for TS/Rust contract drift, found and fixed a real nullability mismatch in Session's targetAngle/tolerance/holdTimeMs, and added wire-shape regression tests for every IPC-returned struct that lacked one.
date: 2026-09-17
---

# CON-01 continuation: Tauri IPC command-layer contract audit

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260917_meeting_offline_batch_scope_sequencing|今晚排程會議]] ·
> [[log_20260916_con01_shared_angle_packet_fixture|09-16 BLE 層批次]]

## 🎯 目的

會議裁定今晚先做完 CON-01(任務定義本來就是 BLE + IPC 兩層一起),再做 CAL-02。
稽核 `src-tauri/src/commands.rs`(+ `ble.rs`/`firmware.rs`/`update.rs`/`splash.rs`)的完整
IPC 指令集(20 個 `#[tauri::command]`,`lib.rs` 的 `generate_handler!` 清單)對 `src/platform/
irmsApi.ts` 與 `src/services/bluetooth.ts` 的呼叫端。

## 🔍 稽核發現

- 20 個指令全部有呼叫端使用,無孤兒指令。參數名稱經 Tauri 內建的 snake_case↔camelCase 轉換
  一致(`sessions_get_data(session_id, max_points)` ↔ `invoke('sessions_get_data', { sessionId,
  maxPoints })`)。
- 錯誤契約:Rust 端一律 `Result<T, String>`(`to_err`/`format!` 產生人類可讀訊息),前端全部
  當作不透明字串顯示,沒有任何地方對錯誤訊息內容做字串比對分支——這類契約沒有漂移風險。
- **README.md 的「`src/platform/irmsApi.ts`:唯一的 Tauri IPC adapter」這句話不準確**:
  `services/bluetooth.ts`(6 個 `ble_*` 指令)與 `splash.ts`(`splash_ready`)也直接呼叫
  `invoke()`,不經過 `irmsApi.ts`。這是既有架構邊界描述與實際程式碼的落差,留在此記錄,
  不在今晚範圍內修正 README(那是 DOC-01 的範圍,且改動風險是文件本身,不是程式碼)。
- **真的抓到一個型別契約漏洞**:`Session.target_angle`/`tolerance`/`hold_time_ms` 在 Rust
  是 `Option<f64>`/`Option<i64>`(對應 `migrations.rs` 的 `sessions` schema——這三欄
  **沒有** `NOT NULL` 約束,舊版/遷移資料列可能是 NULL),但 `shared/types.ts` 的 `Session`
  介面把它們標成不可為 null 的 `number`。`HistoryView.tsx` 早就用 `!= null` 防禦性檢查、
  `?? ''`/`?? 2000` 處理這三個欄位——App 的實際執行邏輯本來就正確假設它們可能是 null,
  只有型別宣告在說謊。修正型別為 `number | null` 後 `npm run typecheck` 全過,證明沒有任何
  呼叫端曾經違規假設非 null(修正純粹是讓型別誠實反映契約,不是修行為)。

## 🔧 變更內容

- `shared/types.ts`:`Session.targetAngle`/`tolerance`/`holdTimeMs` 改為 `number | null`,
  加註解說明依據(`migrations.rs` schema 無 NOT NULL + `HistoryView.tsx` 既有防禦性讀取)。
- `types.rs`:新增三個 wire-shape regression test(`custom_action_wire_shape_matches_shared_
  types_ts`、`session_wire_shape_matches_shared_types_ts`——順帶鎖住上面那三個欄位確實序列化
  成 JSON `null` 而非被丟掉或預設 0、`stored_reading_wire_shape_matches_shared_types_ts`),
  跟既有的 `SensorReading` 兩個測試同一套模式:序列化後列出全部 JSON key、排序後與寫死清單比對。
- `firmware.rs`:新增 `firmware_binary_wire_shape_matches_irms_api_ts`。
- `update.rs`:新增 `update_metadata_wire_shape_matches_irms_api_ts`(`UpdateMetadata` 衍生
  `Default`,不需要真的跑 Tauri webview 就能建構測試實例)。
- 這五個測試共同解決的問題:這個專案沒有 ts-rs/specta 這類型別產生工具,Rust struct 與
  TS 介面是兩份手動維護、彼此不知道對方存在的定義。過去只有 `SensorReading`(2026-09-11
  proximal/distal 改名時)有這種鎖定測試;現在 IPC 層目前用到的每一個回傳結構都有了。

## ✅ 驗證方式

- [x] `npm run typecheck`:通過(確認型別放寬後沒有任何呼叫端隱性依賴非 null)。
- [x] `npm run ci` 全綠:317 前端測試、**50 Rust 測試**(較稽核前 45 個多 5 個新增契約鎖定測試)、
  build、rustfmt、Clippy(`-D warnings`)皆通過。

## 📝 後續待辦

- `services/bluetooth.ts`/`splash.ts` 繞過 `irmsApi.ts` 直接呼叫 `invoke()`,與 README 架構
  描述不符——留給 DOC-01 或下次架構文件核對時一併處理(是否要真的把 BLE/splash 指令收進
  `irmsApi.ts`,或只是更新文件描述反映現況,是一個設計選擇,不在今晚範圍內擅自決定)。
- 這批測試是「鎖定現況」,不是「產生型別」——往後任何一邊的欄位改名/新增,還是得記得手動同步
  另一邊,只是現在改錯會在 `cargo test` 就炸掉而不是留到執行期。若之後想徹底消除這個人工
  同步負擔,可以評估 ts-rs/specta,但那是新增建置工具鏈的決定,超出本次稽核範圍。
