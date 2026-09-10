---
tags: [coding-log, tauri-migration, data-migration]
date: 2026-09-10
summary: "新增 src-tauri/src/migrate_electron.rs:Tauri 版第一次啟動時,若自己的資料庫還不存在、而 Electron 版的 %APPDATA%\\irms-app\\irms.sqlite 存在,就把它複製過來、讓既有的 migration runner 跑到最新 schema、驗證複製結果真的是可讀的 IRMS 資料庫,驗證通過才刪除來源資料夾——這是使用者明確要求、針對這一個資料夾的「封存改刪除」例外,不影響 Electron 程式本體仍保留封存的既有決定。校準/主題設定(存在 Electron 的 Local Storage,WebView2 讀不到)確定不會遷移,是已知且知情的取捨。3 個單元測試涵蓋成功路徑、無來源時的 no-op、以及最關鍵的安全性質——複製結果損毀時來源不能被刪除。"
---

# 2026-09-10 變更日誌 — Electron → Tauri 資料一次性遷移

> **相關文件**:[[HOME|導覽首頁]] · [[TAURI_MIGRATION_PLAN]] ·
> [[log_20260910_tauri_phase3_phase4|同日稍早的 Phase 3+4 日誌]]

## 🎯 目的

使用者原本想讓 Electron 版的自動更新機制直接偵測到 Tauri 版、當成「下一版」推播,方便在
別台電腦上測試。追蹤 electron-updater 與 Tauri updater 的實際運作方式後,確認這條路會有
三個真實問題(manifest 格式不相容、版本號比較方向錯誤、更嚴重的是兩邊 userData 資料夾完全
不同,「更新」完會讓使用者以為資料消失),說明後使用者改為手動安裝測試,並提出真正想要的是
資料延續:新版本裝好時把舊版資料轉移過來,轉移完成後把舊資料夾刪掉。

## 🔧 動作

1. **確認實際路徑**(不是憑猜測):查 `IRMS_App/electron-builder.yml` 的 `productName` 是
   「IRMS Dashboard」,但 Electron 的 `app.getPath('userData')` 實際上是依
   `package.json` 的 `"name"` 欄位(`irms-app`)決定,不是 `productName`——實地查看這台機器的
   `%APPDATA%` 確認真正存在的資料夾是 `irms-app`,`IRMS Dashboard` 資料夾根本不存在。這個
   落差如果沒查證直接假設用 productName,遷移模組會永遠找不到來源資料夾,安靜地失敗。
2. **新增 `src-tauri/src/migrate_electron.rs`**:
   - `migrate_if_needed(tauri_db_path)`:Tauri 自己的 DB 已存在就直接 no-op(只在第一次啟動
     觸發,之後每次啟動都跳過)。
   - 複製 `irms.sqlite` 連同 `-wal`/`-shm`(以防 Electron 上次沒正常關閉、WAL 還沒
     checkpoint)到 Tauri 的資料夾。
   - **不自己刻一套 schema 遷移邏輯**——複製完直接讓既有的 `db::init_database()`(原本就會
     跑的 migration runner)接手,不管來源是哪個 schema 版本都能跑到最新,重用整套已經測過
     的邏輯。
   - 複製完先驗證(開啟複製後的檔案、查 `sessions` 資料表)確實是可讀的 IRMS 資料庫,
     **驗證通過才刪除來源資料夾**——這是整個模組安全性的核心,寧可留著沒刪乾淨的舊資料夾,
     也不能刪掉唯一一份還沒真正搬過去的資料。
   - 失敗不擋 App 啟動:`lib.rs` 的 `setup()` 裡這段是 `match` 而非 `?`,任何一步出錯只記
     log、繼續讓 App 用空資料庫啟動,不會讓遷移失敗變成整個 App 開不起來。
3. **`lib.rs`**:在 `db::init_database()` 之前插入這段遷移呼叫。

## 📐 決策

- **設定值(校準/主題/beta 開關)刻意不遷移**——這些存在 Electron 的 Local Storage,底層是
  Chromium 的 leveldb 格式,Tauri 用 WebView2、讀不懂這個格式。就算共用資料夾也不會自動接上
  (曾經考慮過「Tauri 直接讀寫 Electron 同一個活資料夾」這個做法,但兩種瀏覽器引擎的運行期
  快取檔案疊在同一層有真實的衝突風險,改成「複製後兩邊完全獨立」更安全)。校準本來就是
  每次穿戴都要重測,影響有限;主題只是偏好,一併重置是可接受的代價,不是遺漏。
- **只刪這一個資料夾,不代表推翻「Electron 封存不刪除」的既有決定**——那個決定講的是
  Electron **程式本體/原始碼**(`TAURI_MIGRATION_PLAN.md` Phase 5 既有條目),這次刪除的是
  使用者資料夾(`%APPDATA%\irms-app`),範圍窄很多,而且是使用者這次明確要求的例外,已經在
  文件裡把兩者的界線寫清楚,避免未來讀者誤會成互相矛盾。
- **驗證邏輯只檢查 `sessions` 資料表存在且可查詢,不比對資料筆數/內容**——`sessions` 從
  schema v1 就存在,不論來源是哪個舊版本都會有,用它當「這確實是一個真的 IRMS 資料庫」的
  最小可靠信號;不做更嚴格的比對(例如逐筆比對 Session 數量)是因為那會需要在複製前後各開
  一次資料庫連線比對,複雜度換不到實質的安全收益——真正危險的情境(複製中斷、磁碟寫入失敗)
  会讓檔案整個打不開或連 `sessions` 都查不到,這個檢查已經能抓到。

## ✅ 驗證

- **沒有對真實資料做任何實驗**——這台機器上 `%APPDATA%\irms-app\irms.sqlite` 是使用者
  2026-08-29 留下的真實資料,整個開發過程中一次都沒有直接跑過 `migrate_if_needed()` 指向這個
  真實資料夾。所有測試都改用 `#[cfg(test)]` 單元測試,把核心邏輯(`migrate_from`)拆成可以
  傳入任意來源/目的地路徑的參數化版本,測試用的是 OS temp 目錄下的假資料庫,不是真實路徑。
- `cargo test migrate_electron`:**3/3 通過**——
  1. `migrates_and_deletes_source_on_success`:正常路徑,複製成功後來源資料夾真的被刪除,
     且複製過去的資料庫查得到跟來源一樣的內容(不是空的新檔案)。
  2. `no_source_db_is_a_clean_noop`:來源資料夾存在但沒有 `irms.sqlite`,回報「沒有遷移」,
     不建立目的地檔案,也不動來源資料夾。
  3. `corrupt_copy_is_not_deleted`:**整個模組存在的理由**——複製一個假的、非 SQLite 格式的
     檔案當「來源」,驗證步驟應該失敗,而且**失敗後來源資料夾必須還在**。這條測試通過確認
     安全機制不是紙上談兵。
- `cargo test`(整個 `src-tauri`):**54/54 全部通過**,確認新模組沒有影響既有的 DB/
  migration/BLE 測試。
- `cargo check`:全綠。

## Self-review

檢查情境:「如果 Tauri 版第一次啟動時,Electron 正好還開著、正在寫入 `irms.sqlite`(WAL
模式下有未 checkpoint 的變更),這時候複製資料庫檔案會不會複製到一半、拿到不一致的資料?」
——目前的實作**沒有**偵測「Electron 是否正在執行」這件事,單純假設遷移發生在 Electron
已經關閉的情況下(這也是合理的使用情境:使用者手動裝 Tauri 版通常不會同時開著 Electron
版)。`fs::copy` 本身不是交易性的,若來源檔案正被寫入,複製結果理論上可能不一致——但這個
風險已經被下游的驗證步驟(`verify_migrated_database`)部分擋住:不一致的複製結果如果導致
SQLite 檔案結構损毀,`rusqlite::Connection::open` 或後續查詢會直接報錯,一样會被判定為失敗
而不刪除來源。**沒有完全覆蓋到的情境**:複製到一半但恰好仍是「語法上合法、但邏輯上不完整」
的 SQLite 檔案(例如漏了最後幾筆還沒 flush 的資料,但檔案結構本身沒壞)——這種情況驗證會
誤判成功,刪除來源後遺漏最後幾筆資料。**緩解但未完全解決**:文件與 release notes 都沒有
明講「安裝 Tauri 版前請先關閉 Electron 版」這個前提,這是留下的已知落差,不是宣稱已經
處理過。
