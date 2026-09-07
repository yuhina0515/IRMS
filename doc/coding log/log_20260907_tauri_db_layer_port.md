---
tags: [coding-log, tauri, migration, database]
summary: Phase 1 完成——DB 層完整移植到 rusqlite,51/51 測試通過（含 migrations.test.ts 全部案例）
date: 2026-09-07
---

# 2026-09-07 變更日誌 — Tauri 遷移 Phase 1(DB 層)

> **相關文件**:[[HOME|導覽首頁]] · [[TAURI_MIGRATION_PLAN|完整轉移計畫]] ·
> [[log_20260907_tauri_migration_kickoff|Phase 0 日誌]]

## 🎯 目的

使用者裁示「P1 直接做,P2 重構後再搬移」——這篇記錄 Phase 1(`better-sqlite3` →
`rusqlite`)的完整移植與測試。

## 🔧 動作

- **`migrations.rs`**:7 個版本的 migration 逐一移植(base schema、CHECK 約束重建、
  abandoned 旗標、triggerType 快照、safetyLimit 獨立欄位、calibration 快照、
  source 欄位),`apply_migrations`/`get_schema_version`/`finalize_orphaned_sessions`
  三個函式簽名與交易/回滾邏輯逐字對照 TS 版本。`migrations.test.ts` 的 15 個測試
  案例(全新安裝、v1.0.1 升級路徑、CHECK 約束、migration 7 的 device/demo 語意、
  失敗回滾、孤兒 session 收尾)全部搬成 Rust 測試,**15/15 通過**。
- **`downsample.rs`**:LTTB 演算法逐行對照移植,`downsample.test.ts` 的 8 個案例
  (門檻邊界、首尾點保留、x 遞增、孤立峰值保留、對照均勻取樣的漏抓案例、多峰值)
  全部搬成 Rust 測試,**8/8 通過**。
- **`types.rs`**:`CustomAction`/`CustomActionInput`/`Session`/`SessionStartInput`/
  `SensorReading`/`StoredReading` 六個結構,`serde(rename_all = "camelCase")` 讓
  JSON 序列化欄位名稱與現有前端契約一致。
- **`defaults.rs`**:5 個預設動作範本逐字翻譯。
- **`db.rs`**:`actions_repo`/`sessions_repo`/`data_repo` 三個 module,函式簽名對照
  TS 版本(`list`/`create`/`update`/`delete`/`restoreDefaults`、`start`/`updateReps`/
  `end`/`purgeDemo`/`getData`/`delete`、`appendBatch`)。額外寫了 9 個 repo 層測試
  (CRUD 往返、restoreDefaults 不重複、purgeDemo 只刪 demo 列且 CASCADE 生效、
  批次寫入 + LTTB 抽樣觸發條件)。

**測試總計:51/51 通過**(18 protocol + 15 migrations + 8 downsample + 9 db + 1 fresh-install
seed 測試沒重複算)。

## 📐 決策

- **這次沒有加 `#[tauri::command]` 包裝**——DB 層目前是純 Rust 函式,操作
  `&Connection`,完全不依賴 Tauri runtime。IPC 介面要等 Phase 2a(platform-adapter
  重構)定案之後,在 Phase 2b 才會決定怎麼包(commands 的參數/回傳形狀要跟前端
  adapter 的介面對齊,現在包一次、Phase 2b 可能又要改一次沒有意義)。
- **`get_data` 的 LTTB 抽樣結果比對用 (x, y) 值反查原始列**,而不是像 TS 版本
  那樣直接讓抽樣點與原始物件共享參照——Rust 沒有物件恆等性這回事,`lttb()`
  回傳的是 `Point` 值(只有 x/y),不是原始 `StoredReading`。用 timestamp 解析出的
  x 值加上 kneeAngle 的 y 值配對回原始列,語意上與 TS 版本等價(抽樣選中「這個
  時間點的這個數值」,回傳「那個時間點的完整讀數列」)。
- **`kneeAngle` 等六個角度欄位讀取時用 `Option<f64>` 接住後 `.unwrap_or(0.0)`**,
  即使 struct 欄位本身宣告成不可為 null 的 `f64`——schema 本身這幾欄沒有
  `NOT NULL`,跟 TS 型別宣告的 `number`(隱含不可為 null)其實有落差,原本
  db.ts 直接把資料庫列轉型丟出去、沒有防禦。這裡選擇比原版更防禦一點(顯式
  coalesce 而非放任 null 穿透),因為 Rust 的靜態型別系統會在別的地方直接炸掉
  (`f64` 欄位收到 SQL NULL 是執行期錯誤,不是像 JS 那樣悄悄變成 `null`)。

## ✅ 驗證

- `cargo check` / `cargo build`:全部乾淨編譯,只有預期中的「unused」警告(DB
  層還沒被任何呼叫端使用,等 Phase 2b 才會消失)。
- `cargo test --lib`:**51/51 全過**,執行時間 0.08 秒(記憶體內 SQLite,沒有
  任何硬體或檔案系統依賴)。

## Self-review

檢查情境:「`restore_defaults` 用手動 `BEGIN`/`COMMIT`/`ROLLBACK` 包 DELETE +
insert_default_actions 兩個步驟,如果 `insert_default_actions` 中途失敗(例如
某個預設動作的資料違反了 migration 2 加的 CHECK 約束),會不會留下『動作表已經
被清空但新的還沒插完』的半殘狀態?」——寫了 `restore_defaults_clears_and_reloads_
without_duplicates` 測試驗證正常路徑,但沒有專門測失敗路徑;手動檢查
`db.rs` 的實作:失敗時明確呼叫 `ROLLBACK` 並回傳 `Err`,不會提前 return 導致
交易懸空——邏輯上正確,但這個特定失敗分支目前只靠程式碼審閱確認,沒有額外寫
測試去真的觸發一次插入失敗來驗證回滾生效(五個預設動作本身合法,無法自然觸發
這條路徑,需要故意塞一個違規的假動作才測得到)。記錄下來,不是這次的阻塞項,
但如果之後改動 `restore_defaults` 的交易邏輯,這是一個容易被忽略的回歸點。
