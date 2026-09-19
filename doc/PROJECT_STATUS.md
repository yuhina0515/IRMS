# IRMS (智慧復健監測系統) — 專案開發進度與整合報告

> **相關文件**:[專案總覽](../README.md) · [系統規格 README](README.md) · [導覽首頁 HOME](HOME.md) · [架構與代碼計畫 ROADMAP](ROADMAP.md) · [優化待辦 OPTIMIZATION](OPTIMIZATION.md) · [編碼規範 AI_CODING_RULES](AI_CODING_RULES.md) · [變更日誌 coding log](coding%20log/)

## 📅 更新日期

**2026-09-19**(DOC-01 逐節重寫,對齊 `IRMS_App_Tauri` 現況——上一版寫於 Tauri 遷移前,
描述的是已退場的 Electron v2 世代)。每個數字皆回頭核對當日 `npm run ci` 實際輸出或對應
coding log,不憑印象轉述。

> 本檔提供**階段性總覽**。逐次變更的細節在 [[HOME|doc/HOME.md]] 的「目前狀態速記」與
> [`doc/coding log/`](coding%20log/);待辦與階段順序在 [[ROADMAP]] 與 [[OPTIMIZATION]]。
> 三者衝突時,以 coding log 的實際紀錄為準;文件與程式衝突時,**以程式為準**(決策 D2)。

---

## 🎯 一句話現況

桌面端現役實作是 **`IRMS_App_Tauri`**(Tauri 2 + Rust + React/TypeScript,`v1.2.0-beta.10`),
取代已退場的 Electron v2(`IRMS_App`,保留於 repo 供歷史參考,未正式除役但不再開發)。
`npm run ci`(typecheck + 317 前端測試 + production build + rustfmt + 50 Rust 測試 + Clippy
`-D warnings`)**全綠**(2026-09-19 本機驗證)。硬體迴路**前半段**(燒錄 → BLE 連線 → 校準)
已在 Electron 世代的真裝置上驗證正常;**Tauri 版完整真機 E2E(連線 → 達標 → 超限 → 斷線復原)
尚未驗證**,是 GitHub issue [#3](https://github.com/yuhina0515/IRMS/issues/3) 的現行範圍。

> ⚠ **驗收前的關鍵風險**:issue #3 已於 2026-09-11 指派給有裝置存取權的隊友 `harold1008`
> 執行既有的 30 分鐘驗證腳本,**截至最近一次追蹤(coding log 記錄)仍無回應**。使用者自己的
> 裝置目前也不在身邊(2026-09-19 確認)。若下週驗收前這兩條路徑都沒有進展,「裝置與應用場景」
> 驗收會缺少任何一次 Tauri 版完整真機驗證證據——這是目前對驗收日期最直接的威脅,不是任何
> 離線工作能替代的。

| 項目 | 狀態 |
|---|---|
| 應用端版本 | **`IRMS_App_Tauri` v1.2.0-beta.10**(現役,已發布至 GitHub prerelease,`beta-latest` manifest 已更新,`tauri-plugin-updater` 自動更新生效)。Electron 版(`IRMS_App`,曾發布至 v1.0.5)保留於 repo,不再開發 |
| 自動化測試 | **317 前端測試(Vitest,雙 project:node 純邏輯 + dom 元件)+ 50 Rust 測試(cargo test)**;`npm run ci` = typecheck + test + build(前端)+ rustfmt + cargo test + Clippy `-D warnings`(Rust),2026-09-19 本機全綠;遠端 GitHub Actions(Windows runner,Node 24 + stable Rust)跑同一套 |
| DB schema | SQLite(`rusqlite`,bundled),`PRAGMA user_version = 7`(遞增式 migration,每版單一交易、失敗回滾),Electron 舊安裝的一次性資料遷移已有專屬 `migrate_electron.rs` + 測試覆蓋 |
| IPC / 契約 | 20 個 `#[tauri::command]`,2026-09-17 CON-01 稽核全數確認呼叫端一致、無孤兒指令;修正一個真實型別契約漏洞(`Session.targetAngle/tolerance/holdTimeMs` 應為 `number \| null`);每個 IPC 回傳結構皆有 TS/Rust wire-shape 鎖定測試。**已知文件落差**:`IRMS_App_Tauri/README.md` 聲稱 `platform/irmsApi.ts` 是「唯一的 IPC adapter」,實際上 `services/bluetooth.ts`(6 個 `ble_*` 指令)與 `splash.ts`(`splash_ready`)也直接呼叫 `invoke()`——本次一併修正該文件敘述(見下方檔案狀態表) |
| 無硬體演練 | **沿用自 Electron 世代並延續到 Tauri**:單一 `ingest(text)` 注入接縫 + 純函式模擬器(封包編碼器逐位元對齊韌體 `snprintf`)+ 出貨版示範模式(`sessions.source` CHECK 約束,示範資料無法冒充臨床紀錄)。`sessionController` 的完整指令序列(LED/警報/GOAL 下發順序、去重、斷線重連、MTU 截斷)以此為基礎建立指令稽核測試(T1–T6,見下方已完成的驗證),**這證明的是 App 送出正確的字串與順序,不證明它們真的驅動 GPIO**——那一步只有真機能證明 |
| 桌面端 backlog | 見 [OPTIMIZATION](OPTIMIZATION.md) §三已知技術債:主要剩餘項是 Tauri 元件/旅程層測試覆蓋(目前只有 5 個 `.test.tsx`,App/Dashboard/Settings 的連線→Session→ERR/斷線→收尾與 OTA 進度/失敗旅程尚無元件層測試,底層邏輯已由 `sessionController.test.ts` 等服務層測試覆蓋)。i18n、ESLint(~35 項)、Windows 程式碼簽章、多關節泛化皆被會議明確延後,不佔用本檔的「待完成」敘述 |
| 架構 | App-Driven(判定 100% 在 App,決策 D1 延續);Tauri 原生層(`src-tauri/src`)負責 SQLite、BLE(`btleplug`)、韌體 OTA、App 自動更新與原生視窗生命週期;React/TS 層(`src/views`、`src/components`、`src/services`、`src/store`)負責 UI、判定引擎、校準邏輯與 session 協調 |
| 韌體 | v3 模組化(`config.h` / `imu.h` / `.ino`),與 Electron/Tauri 兩版 App 共用同一份 BLE 協定,協定本身不受桌面端遷移影響。2026-08-28 最近一次於真裝置重新燒錄驗證。2026-09-16/17 修復了 App 端 Roll 計算的深屈膝退化 bug(見下方校準狀態),**韌體本身未變動** |
| 校準狀態(CAL-02/CAL-03) | Roll 已於 2026-09-16/17 重新定義為「重力向量偏離屈曲平面的角度」,修好深屈膝 ±180° 退化、結構性收斂於 [-90°,90°],**尚未真機驗證**(見 [[log_20260917_cal02_design_decision]] 第五節的量化驗收門檻)。Knee(膝夾角)**有已知未修的結構性風險**:兩顆獨立貼裝 IMU 的原始向量座標系彼此獨立,直接比較在某些貼裝下會算出假的相對角;候選修法 `reconcileToReferenceFrame` 已合成驗證但**刻意未接上生產路徑**,需要真機 A/B 比較(CAL-03)才能決定是否啟用——這是目前唯一卡住的正式閘門,不是遺漏 |
| 實機驗證(Tauri) | **尚未執行**——Tauri 版自 2026-09-10 遷移以來,BLE OTA(`ble.rs`/`firmware.rs`)、GPIO 回饋、真實感測資料、斷線復原、Roll 修復後的深屈膝行為,以及 issue #3 的完整連線→達標→超限→斷線復原 E2E,**全部需要實體 ESP32 才能驗證**,模擬模式無法替代(見 `IRMS_App_Tauri/README.md` 架構邊界章節)。裝置目前不在使用者身邊;隊友 `harold1008` 已於 09-11 受託執行測試但尚無回應 |

---

## ✅ 目前具備的能力

### 1. 穿戴式感測節點(ESP32,韌體 v3)

- **FreeRTOS 多執行緒**:`Task_Sensor`(50Hz 讀取 + 互補濾波)、`Task_Comm`(40ms ≈ 25Hz
  BLE 推播)、`Task_LED`(狀態指示與非阻塞回饋)。
- **雙軸感測**:雙 MPU6050(`0x69` 大腿(含 ESP32)/ `0x68` 小腿外接),同時輸出 Pitch(矢狀面)與
  Roll(冠狀面),封包 `T,S,K,TR,SR,KR`;`setMTU(128)` 確保 6 軸不被截斷;選配的
  `V:x/y/z/x/y/z` 加速度向量擴充供校準精靈使用。
- **職責收斂**(決策 D1):韌體只做「感測 + 濾波 + 傳輸 + 執行 `CMD:`」,不含 Task_Logic /
  NVS / Profile 解析,判定 100% 在桌面端完成。
- **健全性**:I2C 連續失敗 > 5 次自動重初始化總線並重新喚醒 IMU、重連後重設濾波角與
  `lastTime` 避免積分尖峰、`Wire.setTimeOut(1000)` 防總線鎖死、斷線即靜音;
  **BLE OTA**(手刻,`Update.h` + MD5 驗證,斷線/中止一律 `Update.abort()` 確保不會變磚)。

### 2. 桌面監測應用端(`IRMS_App_Tauri`:Tauri 2 + Rust + React/TS/Vite)

- **引導式監測**:三種 `triggerType` 經 `movementMetric` 正規化為單一主指標;弧形量表
  (目標帶/超限/回位刻線)+ 教練提示 + 引擎 phase 徽章 + 3D 即時姿態(Three.js,惰性載入)。
- **判定引擎**:純狀態機,遲滯 4°、出區寬限 250ms(寬限內進度凍結)、EMA α=0.3 平滑;
  wrap-safe 環形角度數學;**rest 不變式**確保靜止的腿不會被計出幻影 reps。
- **`sessionController`**:串接即時角度 → 判定引擎 → BLE 硬體回饋 + DB 緩衝寫入的唯一協調層,
  指令去重、斷線重連後重置回饋狀態、ERR 當下強制關閉輸出,完整指令序列由 T1–T6 稽核測試鎖定
  (見下方已完成的驗證)。
- **校準**:六步精靈(佩戴確認 → 站直零位 → 抬大腿 → 後勾小腿 → 外展〈選配〉→ 預覽確認)、
  貼歪偵測、快速歸零;校準邏輯全部是可測純函式(`calibration.ts`/`angleMath.ts`)。2026-09-16/17
  重新定義 Roll 語意修復深屈膝退化,見上方校準狀態列。
- **資料層**:`PRAGMA user_version` 遞增式 migration(現行 7 版,每版單一交易、失敗回滾),
  Electron 舊安裝一次性遷移(`migrate_electron.rs`)、外鍵、交易批次寫入、孤兒 session 啟動
  收尾並標記 `abandoned`(`db.rs` 測試覆蓋)。
- **韌體 OTA(Settings > Firmware Update)**:原生 `.bin` 選檔對話框 → Rust 端 4MB 上限驗證 →
  讀檔/MD5 → BLE 傳輸,`firmware.rs` 有邊界測試(副檔名/空檔/超限)。真機端對端(燒錄後裝置
  重開機、感測器功能正常)與斷電/斷連復原驗證仍待硬體。
- **App 自動更新**:`tauri-plugin-updater` + `latest.json` manifest,靜默背景檢查/下載,
  端對端已實測過。
- **History**:實際判定指標曲線、主進程 LTTB 抽樣至 1200 點、CSV 匯出 6 軸。
- **健全性**:ErrorBoundary 包裹各視圖、硬體錯誤遮罩(凍結顯示 + 暫停寫入)、
  production CSP(self + Tauri IPC + 必要 asset/data/blob)。
- **外觀**:延續 2026-09 初 Gemini 主導的 Tailwind 雙主題重建,2026-09-15 進一步重構為固定命令軌
  + 情境命令列的 Desktop Workstation 佈局(beta8)。本輪不涉及外觀變更(使用者明確裁定驗收
  焦點是裝置與應用場景,非美觀)。

---

## ⚠ 已知風險與未驗證項

| 風險 | 說明 |
|---|---|
| 🔴 **Tauri 版完整真機 E2E 未驗證**(issue [#3](https://github.com/yuhina0515/IRMS/issues/3)) | 連線 → 達標 → 超限 → 斷線復原這條完整鏈,自 2026-09-10 遷移至 Tauri 後從未在真裝置上跑過。已於 09-11 指派隊友 `harold1008` 執行既有 30 分鐘驗證腳本,**尚無回應**;使用者裝置目前也不在身邊。**這是下週驗收最直接的風險**,command-sequencing 邏輯本身已有充分的模擬層測試(見下),但沒有任何一項證明過它們真的驅動了 GPIO |
| 🟡 **Knee 公式有已知未修的結構性風險**(CAL-03,阻塞中) | 兩顆獨立貼裝 IMU 的原始向量座標系彼此獨立,`calibration.redesign.test.ts` 的合成反例證明某些貼裝下直接比較會算出假的相對角。候選修法 `reconcileToReferenceFrame` 已合成驗證但刻意未接上生產路徑,依賴「髖屈軸與膝屈軸方向平行」這個從未真機驗證過的假設。需要真機 A/B 比較才能決定啟用與否,見 [[log_20260917_cal02_design_decision]] 第五節第 3 項量化驗收門檻 |
| 🟡 **Roll 修復未經真機驗證** | 2026-09-16/17 重新定義的 Roll 語意(修好深屈膝 ±180° 退化)只經合成/既有真機觀察推論驗證,尚未在真裝置上跑過回歸測試,見 [[log_20260917_cal02_design_decision]] 第五節第 1、2 項 |
| 🟡 **BLE OTA 硬體驗證未完成**(B4/D1/D2) | 燒錄測試裝置、App 觸發更新的端對端測試、傳輸中途斷電/斷連的變磚防護驗證三步皆需實體 USB/BLE,同樣卡在裝置可用性上 |
| 🟡 **Tauri 元件/旅程層測試覆蓋不足** | 目前只有 5 個 `.test.tsx`(`CalibrationWizard`/`MetricGauge`/`useGlobalShortcut`/`ActionsView`/`HistoryView`),`DashboardView`/`SettingsView` 的連線→Session→ERR/斷線→收尾旅程與 OTA 進度/失敗旅程尚無元件層測試——底層邏輯已由 `sessionController.test.ts`(T1–T6 指令稽核)與 `reconnect.test.ts` 覆蓋,缺口是「畫面是否正確反映這些狀態」這一層,不是判定/指令邏輯本身 |
| 🟡 **Gemini 設計權責懸置** | Gemini CLI 訂閱到期,非互動環境呼叫直接掛住無回應;OTA Settings 面板的 IA 位置覆核因此卡住。使用者已聲明本次驗收不以外觀為目標,此項風險對驗收本身影響低,但架構規範 §1.1 的既有慣例仍待使用者裁決是否重新啟用/指定替代 |
| 🟢 **未簽章** | 安裝檔未做 Windows 程式碼簽章,安裝時會跳 SmartScreen |
| 🟢 **舊版 Electron 資料無自動遷移路徑到 Tauri 以外的情境** | `migrate_electron.rs` 已覆蓋 Electron→Tauri 這一條路徑並有測試;更早的 v1(Express 時期)資料庫格式未涵蓋 |

---

## 🧪 已完成的驗證

### Tauri 世代(2026-09-10 起)

- **CI(2026-09-19 本機重新驗證)**:317 前端測試(Vitest,雙 project)+ 50 Rust 測試(cargo
  test)+ typecheck + production build + rustfmt + Clippy `-D warnings`,全綠。遠端 GitHub
  Actions(Windows runner)跑同一套 `npm ci && npm run ci`。
- **指令稽核測試(T1–T6,`sessionController.test.ts`)**:透過 `bluetoothService.ingest` 注入
  模擬封包(與真實封包解析走同一條路),對 `bluetoothService.send` spy 取得有序指令稽核。
  涵蓋:超限警報鳴響/靜音/自動重新武裝、未開始 Session 不鳴響、`ERR:` 強制關閉並繞過去重、
  達標計數與 LED 序列(含回位後再次進區必須再次送出 LED_ON 的既有缺陷回歸)、斷線重連後的
  去重快取清空與警報重新武裝、MTU 截斷降級。**這證明的是 App 送出正確字串與順序,不證明
  GPIO 實際被驅動**。
- **IPC 契約(CON-01,2026-09-17)**:全數 20 個 Tauri command 稽核完畢,無孤兒指令;修正一個
  真實型別契約漏洞並補齊每個 IPC 回傳結構的 wire-shape 鎖定測試(見上方一句話現況表)。
- **BLE wire-level 契約**:TS/Rust 共用 fixture(`fixtures/angle-packets.json`、
  `fixtures/vector-packets.json`)涵蓋向量欄位缺失/空值/額外/非有限值、`TR:`/`SR:`/`ERR:`/
  MTU 截斷等邊界情境,兩端解析邏輯不會各自維護一份容易漂移的測試案例。
- **Migration**:7 版 `PRAGMA user_version` migration 皆有升級路徑測試,含既有安裝的升級情境
  與失敗回滾情境;`migrate_electron.rs` 覆蓋 Electron→Tauri 一次性資料遷移的乾淨/損毀來源情境。
- **韌體 OTA(App 端接縫)**:選檔對話框 → Rust `.bin`/4MB 驗證 → 讀檔/MD5 → TS adapter 已閉合,
  5 項邊界測試(副檔名、空檔、超限)。**尚待實體硬體的部分見上方風險表**。

### Electron 世代(v2,歷史,壓縮保留)

以下驗證發生於已退場的 Electron 架構,協定/判定邏輯與 Tauri 版共用同一套設計決策(D1–D4),
故仍具參考價值,但**不代表 Tauri 版本身已被驗證過**:

- **實機(2026-08-07 / 08-28 / 08-29)**:韌體 v3 燒錄、BLE 連線、校準精靈(含配戴側)皆在真
  裝置上跑過並確認正常;65.5s / 1639 行 / 25Hz 零 `ERR:1` 的桌上旋轉記錄證實 Roll 不再靜默
  截斷(issue #2,已關閉);Demo Mode 驅動的 App 端 E2E(達標/超限警報+靜音/`ERR:1` 遮罩/
  abandoned session 持久化)在 Electron 打包產物上以 Playwright 連 CDP 驗證通過。
- **目視驗收(2026-08-03 / 08-27)**:實際開啟 app 逐張截圖比對,抓到多個只有跑起來才看得見
  的缺陷(冷開機誤報值過期、未支援協定仍畫目標帶、History 畫出當時不存在的安全線等)。
- **打包**:v1.0.0–v1.0.5 皆實測安裝檔可正常啟動、單例鎖生效、RDP session 下可正常顯示。

> ⚠ 舊版本檔曾記載一段「拔除杜邦線 / 頻寬監控」的 E2E 實測結果,那是 **v1(Express 架構)**
> 時期的紀錄,更早於 Electron v2,現行協定/架構下未重新驗證,不列為現行證據。

---

## 📜 歷史沿革(壓縮保留)

- **v1(至 2026-06-26)**:Vanilla JS + Express + sqlite3。完成雙軸感測、多協定指定動作
  判定、Varus/Valgus 冠狀面視覺化、BLE 雙向控制。
- **v2(2026-06-27 → 2026-09 初)**:桌面端重寫為 Electron + Vite + React + TS + IPC +
  better-sqlite3。判定引擎改純狀態機、超限警報與 `ERR:1` 遮罩修復、無硬體演練基建
  (`ingest` 注入接縫 + 模擬器 + 示範模式)、多輪 UI 重建(Liquid Glass → Tailwind 雙主題)。
  最終發布至 v1.0.5,自 2026-09-10 起不再是現役實作。
- **v3 / Tauri 遷移(2026-09-10 起)**:桌面端遷移為 `IRMS_App_Tauri`(Tauri 2 + Rust),
  原生層取代 Electron main process(SQLite/BLE/更新器/視窗生命週期),前端沿用 React/TS 與
  既有判定/校準邏輯。新增 BLE OTA(韌體推送)、App 自動更新(`tauri-plugin-updater`)、
  Electron→Tauri 一次性資料遷移。持續發布 beta 系列(現行 `v1.2.0-beta.10`)。
  2026-09-15 起建立前端+Rust 統一 CI(`npm run ci`)、production CSP、遠端 Windows CI gate。
  2026-09-16/17 完成一批離線可做的正確性批次(Roll 修復、CON-01 IPC 契約稽核、CAL-02 正式
  決策文件)。

詳見 [`doc/coding log/`](coding%20log/) 與 [[HOME]] 的狀態速記。

---

## 📁 相關檔案狀態

### 文件

| 檔案 | 角色 |
|---|---|
| [`README.md`](../README.md) | 專案總覽與文件入口 |
| [`doc/HOME.md`](HOME.md) | **Obsidian 導覽首頁 + 逐次變更速記(最即時)** |
| [`doc/README.md`](README.md) | 系統架構與整合規格(硬體腳位、BLE 協定、六軸方向定義;§1 已標註 Tauri 為現役實作) |
| [`doc/PROJECT_STATUS.md`](PROJECT_STATUS.md) | 階段性總覽(本檔) |
| [`doc/ROADMAP.md`](ROADMAP.md) | 架構決策 D1–D4 與 Phase 0–5,含歷次會議的順位覆寫 |
| [`doc/OPTIMIZATION.md`](OPTIMIZATION.md) | 功能盤點與 P0–P4 活清單(含被否決項與理由) |
| [`doc/AI_CODING_RULES.md`](AI_CODING_RULES.md) | 協作規範與參數速查(含多 AI 代理協作 §1.2) |
| [`IRMS_App_Tauri/README.md`](../IRMS_App_Tauri/README.md) | Tauri App 開發環境、CI、架構邊界 |
| [`doc/coding log/`](coding%20log/) | 變更日誌,只增不改 |

### 邊緣端 (ESP32)

- `IRMS_Sensor/IRMS_Sensor.ino` + `config.h` + `imu.h`(v3 模組化,**已燒錄現行版本**,
  2026-08-28 含 MTU 診斷 + Serial 遙測重新燒錄;BLE OTA GATT service 隨後加入,尚未真機驗證
  端對端更新流程)
- `IRMS_Sensor/IRMS_Sensor_Full.bak`(v1 含 Task_Logic/NVS 的舊版,保留供 D1 後果條款參考)
- `I2C_Scanner/I2C_Scanner.ino`(接線檢測工具)

### 應用端(現役,`IRMS_App_Tauri/src`)

- `shared/`:`protocol.ts`(BLE 協定/封包解析)、`types.ts`——與 `src-tauri/src` 對應的
  Rust struct 手動維護契約一致性,由 wire-shape 鎖定測試把關(CON-01)。
- `platform/irmsApi.ts`:Tauri IPC adapter,**但非唯一**——`services/bluetooth.ts`(BLE 相關
  指令)與 `splash.ts` 直接呼叫 `invoke()`,本檔已依 CON-01 稽核結果修正此敘述(是否收攏成
  單一 adapter 留待之後的架構決策,不在本次文件核對範圍內擅自變更)。
- `store/`:`useStore.ts`(Zustand + persist + 校準)、`useUiStore.ts`。
- `services/`:`sessionController`(BLE+判定引擎+DB 協調層)、`triggerEngine`/`movementMetric`/
  `calibration`/`angleMath`/`smoothing`/`guidance`/`bluetooth`(含 reconnect 邏輯)/
  `simulation/`(無硬體演練)。
- `components/` 與 `views/`:Dashboard / Actions / History / Settings 四視圖及共用元件。

### 應用端(現役,`IRMS_App_Tauri/src-tauri/src`)

- `db.rs`/`migrations.rs`:SQLite 讀寫與 7 版 schema migration。
- `ble.rs`:BLE 連線管理(`btleplug`)。
- `firmware.rs`/`update.rs`:韌體 OTA 選檔/驗證與 App 自動更新中繼資料。
- `types.rs`/`protocol.rs`:與前端 `shared/` 對應的 Rust 型別與封包解析,wire-shape 測試互鎖。
- `migrate_electron.rs`:Electron→Tauri 一次性資料遷移。
- `splash.rs`:開機動畫視窗生命週期。

### 應用端(歷史,`IRMS_App/`——Electron v2,保留未除役)

架構與規格描述已移至本檔「歷史沿革」與 Electron 世代驗證章節壓縮保留,不在此重複列出檔案樹。
除役條件見 `TAURI_MIGRATION_PLAN.md`。
