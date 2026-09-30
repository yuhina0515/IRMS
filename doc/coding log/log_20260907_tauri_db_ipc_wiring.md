---
tags: [coding-log, tauri, migration]
summary: DB 層接上真正的 Tauri IPC——13 個 command，實機驗證資料庫在真實啟動流程下正確建立
date: 2026-09-07
---

# 2026-09-07 變更日誌 — Tauri 遷移 Phase 2b 起步(DB 層 IPC 接線)

> **相關文件**:[[HOME|導覽首頁]] · [[TAURI_MIGRATION_PLAN|完整轉移計畫]]

## 🎯 目的

Phase 2a(platform-adapter 重構)已經完成,`IRMS_App_Tauri` 這邊接著把 Phase 1
寫好但故意沒接 IPC 的 DB 層(`db.rs`)真正接上 Tauri command,讓它從「編譯得過、
測試得過的純函式庫」變成「App 真的啟動時會被呼叫的東西」。

## 🔧 動作

- **`commands.rs`**:13 個 `#[tauri::command]`——`actions_list/create/update/delete/
  restore_defaults`、`sessions_start/update_reps/end/list/get_data/delete/purge_demo`、
  `data_append_batch`。統一用 `DbState(Mutex<Connection>)` 做 Tauri 狀態管理,
  錯誤一律轉成 `String`(`rusqlite::Error` 沒有內建 serde 支援,command 回傳型別
  必須可序列化)。
- **`lib.rs`**:新增 `.setup()` hook——用 `app.path().app_data_dir()` 取得真正的
  Tauri 應用資料目錄、建目錄、開啟/初始化 `irms.sqlite`、把連線裝進
  `DbState` 交給 Tauri 管理。13 個新 command 全部註冊進
  `tauri::generate_handler!`。

## 📐 決策

- 沒有把這 13 個 command 標成 `async`——`rusqlite` 是同步 API,SQLite 檔案操作
  本身就快,直接寫成同步 command 讓每次呼叫的 IPC thread 短暫阻塞,比起額外包
  `spawn_blocking` 換取「看起來 async」但沒有實質效益,更符合這個規模的資料庫
  操作。之後如果真的出現 UI 卡頓的實測證據,再回頭改。

## ✅ 驗證

- `cargo check`/`cargo test --lib`:乾淨編譯,**51/51 測試依然全過**
  (DB 層本身的邏輯完全沒改,只是加了一層 command 包裝)。
- `npm run tauri build -- --debug`:完整打包成功(MSI + NSIS)。
- **實機啟動驗證,不只是編譯過**:直接執行打包出的 `.exe`,3 秒後確認 process
  仍存活;檢查 `%APPDATA%\com.irms.app.tauri\irms.sqlite` 確實被建立——代表
  `.setup()` hook 真的跑了、`db::init_database` 真的對著一個全新目錄跑完整條
  migration chain,不是紙上談兵的「應該會動」。驗證完後清掉這個煙霧測試留下的
  AppData 目錄,不留垃圾在使用者機器上。

## Self-review

檢查情境:「`DbState(Mutex<Connection>)` 用單一全域 Mutex 包住唯一一條連線,如果
前端同時發出多個 DB 相關的 command(例如一邊在寫 `data_append_batch` 高頻感測
資料、一邊使用者點了 `sessions_list`),會不會因為鎖爭用讓某個操作卡住很久,
甚至以某種方式互相干擾資料?」——`std::sync::Mutex` 保證同一時間只有一個 command
真正在跑 SQL,不會有資料互相污染的問題(這正是要的效果,SQLite 單一連線本來就
不支援真正並行寫入);卡住的風險是真實存在但目前判斷可接受:WAL 模式下讀取
不會被寫入阻塞太久,且原本 Electron 版的 `better-sqlite3` 本來就是同步、單執行緒
呼叫,這裡的鎖爭用模型並沒有比原本更差,只是把「單執行緒天然序列化」換成
「Mutex 顯式序列化」,語意上等價——PASS(邏輯推導,尚未在高頻寫入 + 頻繁查詢
同時發生的真實負載下實測,若之後 Phase 0 的硬體驗證顯示這是瓶頸,才需要重新
評估連線池或更細粒度的鎖)。
