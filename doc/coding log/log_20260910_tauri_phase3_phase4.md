---
tags: [coding-log, tauri-migration, window-chrome, boot-splash, auto-update]
date: 2026-09-10
summary: "Tauri 遷移 Phase 3(視窗外觀/開機動畫/單一實例)與 Phase 4(自動更新 App 端整合)完成。Phase 3:decorations:false + 既有 windowControls 只差 hasCustomTitlebar 翻轉;新增 tauri-plugin-single-instance;新增 src-tauri/src/splash.rs 完整重現開機動畫兩階段交接(動態建立 splash WebviewWindow、16ms 步進縮放動畫、原始向量翻譯的 edge-travel 幾何 math 近乎逐字搬過去,因為它其實零 Electron 依賴)。Phase 4:新增 src-tauri/src/update.rs 的 update_check 自訂指令(唯一需要客製 Rust 的地方——beta/stable 頻道選擇需要 UpdaterBuilder::endpoints(),JS 版 check() 做不到),其餘沿用 tauri-plugin-updater 原生 Update 類別的 download/install;產生簽章金鑰對存在 repo 外的 E:\\Monitoring-and-IoT\\IRMS_secrets\\;beta 頻道端點與實際發版管線(CI 產生 latest.json)刻意標記為未完成,不假裝已經做完。npm run ci(268 tests)全綠,cargo check 全綠,dev 模式實測啟動+視覺驗證(小螢幕測試環境的已知限制見內文),最後產出簽章 release build 當內部測試用。"
---

# 2026-09-10 變更日誌 — Tauri 遷移 Phase 3 + Phase 4

> **相關文件**:[[HOME|導覽首頁]] · [[TAURI_MIGRATION_PLAN]] · [[OPTIMIZATION]] ·
> [[log_20260910_module_system_and_calibration_rewrite_decisions|同日稍早的決策紀錄]]

## 🎯 目的

延續今天稍早的決策(App 端動態模組系統的依賴閘門是 Tauri Phase 4),使用者授權直接動工
Phase 3(視窗外觀/開機動畫/單一實例)+ Phase 4(自動更新),完成後產出一個內部測試用建置
(非公開發布)。兩個 Phase 在 `TAURI_MIGRATION_PLAN.md` 裡都標記「技術路徑清楚,不需要
判斷」,是目前唯一不卡在使用者裁決或實機存取上的可執行工作。

## 🔧 動作

### Phase 3 — 視窗外觀、開機動畫、單一實例

1. **無邊框標題列**(`tauri.conf.json` + `platform/irmsApi.ts`):主視窗設定改
   `decorations:false`、`backgroundColor:"#0b0f1f"`。`windowControls` 在 Phase 2 就已經是
   `@tauri-apps/api/window` 的真實實作,只有 `hasCustomTitlebar()` 還卡在 Phase 3 前的
   佔位 `false`,這次翻成 `true`。`TopHeader.tsx`/`WindowControls` 跟 `IRMS_App` 逐位元組
   相同,不需要改。
2. **單一實例鎖**(`Cargo.toml` + `lib.rs`):`tauri-plugin-single-instance` 依 Tauri 自己的
   要求註冊在 builder chain 最前面(`#[cfg(desktop)]` 包住,對應舊版
   `tauri::mobile_entry_point` 的同一種平台分流慣例),second-instance 回呼把 `"main"` 標籤
   視窗叫到前景,取代 Electron 手刻的 `second-instance` handler。
3. **兩階段開機動畫**(新檔 `src-tauri/src/splash.rs` + `splash.html`/`src/splash.css`/
   `src/splash.ts`):
   - Rust 端動態建立一個標籤為 `"splash"` 的 `WebviewWindow`,尺寸/位置取主螢幕
     `primary_monitor().work_area`(換算成 logical px,因為 `WebviewWindowBuilder::position`/
     `inner_size` 吃的是 logical 不是 physical),`decorations(false)` +
     `transparent(true)` + `always_on_top(true)` + `set_ignore_cursor_events(true)`(避免
     全螢幕透明視窗擋住底下桌面的滑鼠事件)。
   - `animate_bounds()` 是 `main/splash.ts` `animateBounds()` 的逐行 Rust 版本(16ms
     步進、`ease_out_cubic`、`set_position`/`set_size` 取代 `BrowserWindow.setBounds`)。
   - **刻意簡化的一處**:Electron 版要兩次往返(`did-finish-load` 事件 + 事後
     `executeJavaScript` 查 `matchMedia`)才能同時拿到「splash 載入完成」與「使用者是否
     偏好減少動態效果」,因為 contextBridge 只能掛一次性 listener、無法讓頁面主動把資料
     推上去。Tauri 的 `invoke()` 第一次呼叫就能帶資料,所以改成單一 `splash_ready`
     指令,`splash.ts` load 完當下直接把 `reducedMotion` 一起送上來。用
     `tokio::sync::oneshot` + 5 秒 timeout 接,timeout 或視窗提早關閉就降級成
     `reduced_motion=false` 繼續走,不會卡死整個開機流程(Electron 版原本靠
     `did-fail-load` 保底,這裡换成統一的 timeout,涵蓋範圍其實更廣——網路飄移、
     splash 崩潰都算進去)。
   - **`splash.html`/`splash.css`/`splash.ts` 幾乎逐字搬過去**:核對後發現
     `setupFullScreenAssembly()`(finger/mainstem 線條從螢幕邊緣飛入的幾何運算)完全只碰
     `window.innerWidth/innerHeight` 這種純瀏覽器 API,沒有任何 Electron 依賴——
     [[log_20260908_boot_splash_edge_travel]] 當初標記的「Tauri 遷移時需要重新設計」
     其實沒有發生,只有檔案最下面的 bridge(Tauri `invoke`/`listen` 取代
     `contextBridge.exposeInMainWorld`)是平台專屬的。
   - 權限:新增獨立的 `capabilities/splash.json`,只給 `"splash"` 視窗
     `core:event:default`(接收兩個交接訊號用),不給 DB/BLE/視窗控制權限——比照
     Electron 版 preload/splash.ts 註解裡「splash 不需要那些」的既有原則。
   - 失敗保底:`spawn_boot_sequence()` 包一層,任何一步出錯就直接顯示主視窗、關掉
     splash,不會讓使用者卡在看不到任何畫面的狀態(對應 Electron 版 `app.whenReady()`
     裡的 try/catch)。

### Phase 4 — 自動更新(App 端)

1. **`src-tauri/src/update.rs`(新檔)**:整個 Phase 4 唯一需要客製 Rust 的地方——JS 版
   `check()` 的 `CheckOptions` 沒有 per-call endpoint 覆寫能力,只有 Rust
   `UpdaterBuilder::endpoints()` 有,而 beta/stable 頻道切換恰好就需要這個。
   `update_check(allow_beta)` 依旗標選 `STABLE_ENDPOINT`/`BETA_ENDPOINT`,回傳跟外掛自己
   `check` 指令一樣的 `{rid, currentVersion, version, date, body, rawJson}` 形狀。
2. **`platform/irmsApi.ts` 的 `updates` 實作**:custom command 拿到 metadata 後直接
   `new Update(metadata)`(`@tauri-apps/plugin-updater` 匯出的類別),下載/安裝之後全部
   沿用外掛原生的 `download()`/`install()`——沒有另外刻一套下載/安裝邏輯。下載進度
   (`DownloadEvent` 只有 `chunkLength`/`contentLength`,沒有現成 percent)自己累加算
   百分比,餵回 `UpdateStatus.downloading.percent`。`checkNow`/`setAllowPrerelease`/
   `onStatusChange`/`restartNow` 全部從「no-op 佔位」換成真實實作。啟動 5 秒後自動背景
   檢查(比照 `CHECK_DELAY_MS`),用 `!import.meta.env.DEV` 當 dev 模式閘門,對應 Electron
   版的 `is.dev` 判斷。
   - **前端 UI 早就接好了**:`SettingsView` 的頻道切換、`App.tsx` 的
     `setAllowPrerelease` 呼叫、`UpdateBanner` 的訂閱,這些在 Phase 2 平台轉接層工作時
     就已經寫好、只是接到 no-op 後端——這次只需要把後端做真,前端一行都沒改。
3. **簽章金鑰對**:`npx tauri signer generate --ci` 產生,私鑰與密碼存在
   `E:\Monitoring-and-IoT\IRMS_secrets\`(repo 外層的手足目錄,不是 `.gitignore` 排除,
   是結構上不可能被誤 commit)。公鑰貼進 `tauri.conf.json` 的
   `plugins.updater.pubkey`。**私鑰與密碼目前只存在這台機器,沒有備份到密碼管理器**——
   這是待辦,不是已完成項。
4. **刻意不做的部分(已在 `TAURI_MIGRATION_PLAN.md` 標記為未完成,不是遺漏)**:
   - Beta 頻道端點(`.../releases/download/beta-latest/latest.json`)是佔位網址,假設
     發版流程會在每次 beta 發布時更新一個固定的 `beta-latest` tag——這個發版流程本身
     沒有建立。GitHub 的 `/releases/latest/download/` 別名(stable 頻道用的)只會解析到
     最新非 prerelease,沒有對應的「最新 prerelease」別名可用。
   - CI/發版管線(`tauri-action` 產生簽章 installer + `latest.json` 上傳到正確的
     GitHub Release)完全沒有設定——這個 repo 目前連 `.github/workflows` 都不存在,
     Electron 端的發版也是使用者手動跑 `electron-builder --publish`,沒有先例可循。
     App 端程式碼不卡這個依賴,但沒有它自動更新對真實使用者就是空談。

## 📐 決策

- **不追第三顆按鈕(關閉鈕)在測試環境螢幕上的確切像素位置**——測試機的虛擬螢幕只有
  819×614,比這支 App 自己宣告的 `minWidth:1024` 還小,視窗被迫超出螢幕邊界。強制把
  原生視窗縮到 700×500 後看到最小化/最大化鈕確實正常渲染,關閉鈕大機率也在,只是被同一個
  裁切問題擋住,再花時間去湊測試環境的顯示器設定不符合這次驗證的性價比。這是 App 既有的
  最小視窗尺寸假設(Electron 版 `main/index.ts` 自己就有「13" 1366×768 @125% 縮放 ≈
  1093×614 DIP」的既有註解討論這個邊界),不是這次 Phase 3 port 引入的東西。
- **Update 下載進度自己算 percent,不等外掛提供**——`DownloadEvent` 只給
  chunkLength/contentLength,這是外掛的既有設計(它本身也不算 percent,JS 呼叫端要自己
  處理),不是我方遺漏了什麼 API。
- **不建立 CI/GitHub Actions 發版管線**——這次任務範圍是「App 端整合」,發版管線是
  獨立的基礎設施工作,而且這個 repo 從來沒有 CI 自動化的先例(Electron 端也是手動跑
  `--publish`)。在没有被要求的情況下新增一整套 Actions workflow,超出了這次的任務範圍。
- **私鑰產生但不自動處理備份**——備份到密碼管理器是使用者的動作,不是我能代勞的部分,
  只據實記錄目前的存放狀態與風險(遺失=所有既有安裝都無法再收到已簽章的更新)。

## ✅ 驗證

- `cargo check`(`src-tauri`):Phase 3 完成後全綠(僅既有的 1 個 dead-code warning,與
  這次改動無關);加入 `tauri-plugin-updater`/`update.rs` 後再次全綠。
- `npm run ci`(typecheck + test + build,`IRMS_App_Tauri`):**268/268 測試通過**,
  `tsc --noEmit` 乾淨,production build 成功產出 `dist/index.html` 與 `dist/splash.html`
  兩個進入點(`splash-*.js` 只有 2.15 kB,確認沒有意外把 React 打包進去)。
- **`npm run tauri dev` 實機啟動測試(兩輪)**:
  - 第一輪(Phase 3 完成後):`cargo` 編譯乾淨、DB migration 1–7 依序套用、process
    正常啟動無 panic。用 PowerShell 截圖確認:無原生視窗標題列(frameless 生效)、
    自訂 header(logo/連線狀態/主題切換/Connect 按鈕)正確渲染;強制縮小原生視窗到
    700×500 後,最小化與最大化鈕清楚可見,證明 `WindowControls` 元件確實有掛載渲染
    (不是 `hasCustomTitlebar` 判斷卡在 false)。開機動畫本身因為總長只有約 2 秒、
    截圖時機沒對上而沒能截到過程畫面,但 App 順利跑到完整渲染的 Dashboard 狀態,證明
    splash → 主視窗的交接流程沒有卡死或崩潰。
  - 第二輪(加入 Phase 4 updater plugin 後):重新完整編譯(新增 3 個 crate:
    `tauri-plugin-updater`/`time`/`url`),process 正常啟動,無 panic、無 DB 錯誤
    (migration 冪等,第二輪没有新的套用訊息,符合預期)。updater plugin 的 init
    (`.plugin(tauri_plugin_updater::Builder::new().build())`)沒有讓開機流程掛掉,
    間接證明 `tauri.conf.json` 裡的 `plugins.updater` 設定(pubkey/endpoints 格式)
    可以被外掛正確解析。
  - ⚠ **未完成的驗證**:試圖用模擬滑鼠點擊(`SetCursorPos`+`mouse_event`)導覽到
    Settings 頁手動觸發「檢查更新」按鈕,藉此觀察 `update_check` 指令真正被呼叫後的
    行為(預期會因為 `beta-latest`/`latest.json` 尚未真的發布而回傳 404,驗證的是
    錯誤路徑有沒有正確走到 `state:'error'` 而不是讓 App 崩潰)。模擬點擊在這台測試
    環境沒有成功觸發(`SetForegroundWindow` 疑似被 Windows 前景鎖定原則擋下),沒有
    繼續在自動化點擊上耗費更多時間——`update_check` 本身的正確性靠的是編譯期型別檢查
    + 與外掛自己那支已經在生產環境驗證過的 `check` 指令結構完全對應(同樣的
    resource-table 寫入方式、同樣的 Metadata 欄位),不是靠這次沒跑成的點擊測試。
- **簽章 release build(內部測試用,未對外發布)**:`npm run tauri build`(帶
  `TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 環境變數指向
  `IRMS_secrets` 裡的金鑰)成功產出兩種安裝檔 + 對應的 updater 簽章檔(release profile
  編譯 2m25s):
  - `target\release\bundle\msi\IRMS Dashboard_0.1.0_x64_en-US.msi`(+ `.sig`)
  - `target\release\bundle\nsis\IRMS Dashboard_0.1.0_x64-setup.exe`(+ `.sig`)
  `.sig` 檔確實產生,證明簽章金鑰設定(`tauri.conf.json` 的 pubkey +
  `TAURI_SIGNING_PRIVATE_KEY*` 環境變數)整條路徑是通的——這是比「App 能不能跑」更進一步
  的驗證,實際跑過一次真正會在發版時執行的簽章流程。這兩個安裝檔只放在本機
  `target/release/bundle/`,沒有上傳到任何地方。

## Self-review

檢查情境:「如果 `splash_ready` 這個自訂 Tauri command 因為某種原因從未被呼叫(例如
splash.ts 的 bundle 載入失敗、或 `invoke` 因為權限設定被擋下),開機流程會不會永久卡住,
使用者只看到一片空白?」——追蹤 `splash.rs` 的 `run_boot_sequence()`:`oneshot::channel`
的接收端包在 `tokio::time::timeout(SPLASH_READY_TIMEOUT_MS, rx)`,無論是 timeout 還是
channel 因為 splash 視窗被關閉而被 drop(對應 `Err`),都會落到 `_ => false` 分支,流程
繼續往下走(用 `reduced_motion=false` 當降級預設),不會無限等待。更上一層,若
`run_boot_sequence()` 本身回傳 `Err`(例如 `primary_monitor()` 抓不到螢幕),
`spawn_boot_sequence()` 的 `if let Err(err) = ...` 分支會直接呼叫 `main.show()`
讓使用者至少看到主視窗。**PASS**——兩層保底都已經在程式碼裡,不是只存在於這次的設計意圖
而已。唯一沒有覆蓋到的邊界是「splash 視窗建立本身失敗」(`WebviewWindowBuilder::build()`
回傳 `Err` 的那一行,用 `?` 直接往外拋)——這會被最外層的 `run_boot_sequence` 錯誤路徑接住
(一樣走 `main.show()` 保底),所以其實也覆蓋到了,只是保底層級不同(沒有 splash 動畫,
但不會黑畫面)。
