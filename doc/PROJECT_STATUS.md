# IRMS (智慧復健監測系統) — 專案開發進度與整合報告

> **相關文件**:[專案總覽](../README.md) · [系統規格 README](README.md) · [導覽首頁 HOME](HOME.md) · [架構與代碼計畫 ROADMAP](ROADMAP.md) · [優化待辦 OPTIMIZATION](OPTIMIZATION.md) · [編碼規範 AI_CODING_RULES](AI_CODING_RULES.md) · [變更日誌 coding log](coding%20log/)

## 📅 更新日期

**2026-08-29**(v1.0.2–v1.0.4 三次發布 + issue #3 校準子項完成 + 校準自動化評估會議;
上一次全面更新為 2026-08-12)

> 本檔提供**階段性總覽**。逐次變更的細節在 [[HOME|doc/HOME.md]] 的「目前狀態速記」與
> [`doc/coding log/`](coding%20log/);待辦與階段順序在 [[ROADMAP]] 與 [[OPTIMIZATION]]。
> 三者衝突時,以 coding log 的實際紀錄為準;文件與程式衝突時,**以程式為準**(決策 D2)。

---

## 🎯 一句話現況

桌面端功能完整、測試齊備、已發布安裝檔(v1.0.4);硬體迴路的**前半段**(燒錄 → BLE 連線 →
校準)已於 2026-08-07 / 2026-08-28 / 2026-08-29 在真裝置上驗證正常(issue #2 已關閉,
校準精靈今天在真人身上完整跑過一輪,含新加的配戴側選擇),**後半段**(達標回饋 → 超限警報 →
斷線收尾 → abandoned session 復原)仍未驗證,是 issue [#3](https://github.com/yuhina0515/IRMS/issues/3)
剩餘範圍。裝置**目前仍在手邊**,但使用者短暫離開,需要真人在場的步驟先暫停。

| 項目 | 狀態 |
|---|---|
| 應用端版本 | **v1.0.4**(已發布 NSIS 安裝檔,未簽章);v1.0.2 發布後 40 分鐘內連兩次 hotfix
  (v1.0.3 單例鎖、v1.0.4 RDP titleBarOverlay 卡死),詳見 08-28 三份 hotfix 日誌 |
| 自動化測試 | **284 tests / 26 files 全綠**(雙 project:node 純邏輯 + dom 元件);`npm run ci` = typecheck + test + build |
| DB schema | `user_version = 7`(遞增式 migration),真實預設 profile 已驗證乾淨套用(0 筆 session/sensor_data 殘留) |
| 無硬體演練 | **已建立**(2026-08-27):單一 `ingest(text)` 注入接縫 + 模擬器 + 出貨版示範模式,整條「封包 → 判定 → 回饋/警報 → DB」可在桌前完整演練 |
| 桌面端 backlog | **P2 使用者體驗清單已清空**(2026-08-27)。剩餘桌面項全部是被會議明確延後的大項(i18n、ESLint、簽章、多關節泛化) |
| 架構 | App-Driven(判定 100% 在 App,決策 D1) |
| 韌體 | v3 模組化(`config.h` / `imu.h` / `.ino`)——**2026-08-28 重新燒錄現行版本**(含 08-22 MTU 診斷 + Serial 遙測) |
| 校準自動化評估 | **2026-08-29 會議否決**:配戴側+固定安裝幾何可推導預期值,但不可取代即時擷取與人工預覽確認(本專案自己的 08-14/08-28 事故史是主要理由)。改採「幾何值當比對信號」的折衷方案,待實機驗證後落地(見 [[log_20260829_meeting_auto_calibration_feasibility]]) |
| 實機驗證 | **部分**:連線、校準精靈(含配戴側)、快速歸零修正、桌上 ±180° 旋轉記錄皆已在真裝置上跑過並確認正常。**未驗證**:達標回饋、超限警報、斷線收尾、abandoned session 復原這條完整 E2E 鏈(issue #3,已排入待辦清單,等使用者下次在場時繼續) |

---

## ✅ 目前具備的能力

### 1. 穿戴式感測節點(ESP32,韌體 v3)

- **FreeRTOS 多執行緒**:`Task_Sensor`(50Hz 讀取 + 互補濾波)、`Task_Comm`(40ms ≈ 25Hz
  BLE 推播)、`Task_LED`(狀態指示與非阻塞回饋)。
- **雙軸感測**:雙 MPU6050(`0x68` 大腿 / `0x69` 小腿),同時輸出 Pitch(矢狀面)與
  Roll(冠狀面),封包 `T,S,K,TR,SR,KR`;`setMTU(128)` 確保 6 軸不被截斷。
- **職責收斂**(決策 D1):韌體只做「感測 + 濾波 + 傳輸 + 執行 `CMD:`」,不含 Task_Logic /
  NVS / Profile 解析,消除舊版兩端各一份判定造成的控制權衝突。
- **健全性**:I2C 連續失敗 > 5 次自動重初始化總線並重新喚醒 IMU、重連後重設濾波角與
  `lastTime` 避免積分尖峰、`Wire.setTimeOut(1000)` 防總線鎖死、斷線即靜音。

### 2. 桌面監測應用端(Electron + Vite + React + TS + better-sqlite3)

- **引導式監測**:三種 `triggerType` 經 movementMetric 正規化為單一主指標;弧形量表
  (目標帶/超限/回位刻線)+ 教練提示 + 引擎 phase 徽章 + 3D 即時姿態(Three.js)。
- **判定引擎**:純狀態機,遲滯 4°、出區寬限 250ms(寬限內進度凍結)、EMA α=0.3 平滑;
  wrap-safe 環形角度數學;**rest 不變式**確保靜止的腿不會被計出幻影 reps。
- **安全警報**:獨立 `safetyLimit` 欄位(與 tolerance 解耦)、與 session 綁定、UI 可靜音、
  `ERR:`/斷線時強制關閉、重連後重新武裝。
- **校準**:六步精靈(UI 標示 1/6–6/6:佩戴確認 → 站直零位 → 抬大腿 → 後勾小腿 →
  外展〈選配,只影響顯示〉→ 預覽確認;免手擷取——擺好姿勢穩住即自動觸發、可退上一步)、axisSwap
  偵測貼歪 90°、快速歸零(`buildQuickZeroPatch`);校準邏輯全部是可測純函式。
- **資料層**:`PRAGMA user_version` 遞增式 migration(目前 5 版,每版單一交易、失敗回滾,
  含 v1.0.1 既有安裝的升級路徑測試)、WAL、外鍵、交易批次寫入、孤兒 session 啟動收尾並
  標記 `abandoned`。
- **History**:畫該場**實際判定的那個指標**(依 session 的 `triggerType` 快照)、
  主進程 LTTB 抽樣至 1200 點(保留峰值)、安全線用當場生效的 `safetyLimit`、CSV 匯出 6 軸。
- **健全性**:ErrorBoundary 包裹各視圖、ERR 紅色遮罩(凍結畫面 + 暫停寫入)+ 逃生出口、
  `escapeStack` 巢狀 modal Esc 分派、UI 以 80ms 尾緣節流(判定與 DB 仍全速)。
- **外觀**:Apple 語意 token 雙主題跟隨系統、Liquid Glass 材質、無邊框視窗
  (`titleBarStyle:'hidden'` + `titleBarOverlay`,頂列 inset 走 `env(titlebar-area-*)`)。

---

## ⚠ 已知風險與未驗證項

| 風險 | 說明 |
|---|---|
| 🔴 **回饋與警報鏈未在實機驗證** | 2026-08-27 已為這條鏈建立**指令稽核測試**(有序 `CMD:` 斷言,涵蓋靜音自動重新武裝、`ERR:` 強制關閉、重連重新武裝),並因此抓到「達標 LED 從第一下卡亮到 Session 結束」這個臨床缺陷。**但那證明的是 App 送出正確的字串與順序,不證明它們真的驅動 GPIO 25/26**——issue [#3](https://github.com/yuhina0515/IRMS/issues/3) 部分開始(校準子項已完成,達標/警報/斷線/abandoned 復原仍待測,見下方待辦) |
| 🟢 **UI 已目視驗收**(2026-08-27) | 以 Playwright 拋棄式驅動腳本跑完整條示範模式路徑並逐張截圖比對:全域橫幅、Demo 確認對話框、即時量表反應、Actions 搜尋空狀態、**真的跑完一場 Session**、History 徽章、分析 modal 橫幅、CSV 檔名(`irms_DEMO_session_1.csv`)全數確認正確。腳本本身未進版控。重連進度軌道(需真實斷線事件)仍未展開驗收;**校準精靈逐步畫面已於 2026-08-29 在真裝置上完整驗收**(見下) |
| 🟢 **桌上旋轉記錄已完成**(2026-08-28) | issue [#2](https://github.com/yuhina0515/IRMS/issues/2) 已關閉:65.5s / 1639 行 / 25Hz / 零 `ERR:1` 的真實旋轉資料,Roll 擺動 193–197°,證實不再靜默截斷。第一次擷取因開窗時機沒對上、資料其實沒動,已丟棄未採用 |
| 🟡 **裝置取得零星** | 每次拿到裝置的時間窗都稀缺。issue #2 已完成;#3 的校準子項 2026-08-29 完成,其餘(達標/警報/斷線/abandoned)因使用者需離場暫停,已排入待辦清單等下次時間窗 |
| 🟡 **校準精靈的幾何預測未經實機交叉驗證** | 2026-08-29 會議否決全自動校正,但認可「配戴側+固定安裝幾何」可算出預期 axisSwap/roll invert 當比對信號。這個推導本身尚未拿真裝置驗證過(只驗證過右腿一次真實擷取,未與左腿實測值交叉比對),落地前需先做這一步 |
| 🟡 **元件層無測試覆蓋** | 144 tests 全在純函式層。2026-08-07 的快速歸零缺陷正是死在這個缺口:把值寫進 settings 的那個元件沒人測 |
| 🟡 **`minHeight` 前提未實測** | 「1366×768@125% 筆電放不下 680」是算術推導,未在該機型實測。修正本身無害,但急迫性的前提未驗證 |
| 🟡 **Esc 實際按鍵未驗證** | `escapeStack` 邏輯層有測試,但自動化輸入送不出 Escape,真實按鍵行為未確認 |
| 🟢 **未簽章** | 安裝檔未做 Windows 程式碼簽章,安裝時會跳 SmartScreen |
| 🟢 **舊版資料無遷移** | v1 的 `irms.sqlite` 不會自動升到 v2 schema;需保留歷史須另寫一次性匯入 |

---

## 🧪 已完成的驗證

- **自動化**:284 tests / 26 files(雙 project:node 純邏輯 + dom 元件;判定狀態機邊界、
  封包解析、校準〈含配戴側〉、環形角度數學、guidance、smoothing、UI 節流、LTTB、
  validation、migration 升級路徑、escapeStack、demo mode、模擬器、CMD 指令稽核等)。
- **目視驗收**(2026-08-03):實際把 app 開起來看,抓到 4 個只有跑起來才看得見的缺陷
  (冷開機誤報值過期、未支援協定仍畫目標帶、History 畫出當時不存在的安全線、Esc 一次
  關兩層 modal)。以隔離 `--user-data-dir` 造假資料驗證 History / LTTB / CSV,
  **使用者真實 DB 全程未動**。
- **響應式**(2026-08-07):瀏覽器分頁對 1093×614 / 850×600 / 1024×600 / 2560×1440
  四種尺寸量測,無水平或垂直溢出;真實 Electron 視窗量到頂列 inset 136px,
  證實 `env(titlebar-area-*)` 生效。
- **打包**:v1.0.0 / v1.0.1 / v1.0.2 / v1.0.3 / v1.0.4 皆實測安裝檔可正常啟動、自訂圖示生效;
  v1.0.3 起額外驗證「開啟→關閉→再開啟」不留殭屍 process,v1.0.4 額外驗證 RDP session 下
  視窗可正常顯示(6/6 輪快速開關循環)。

- **實機**(2026-08-07):韌體 v3 燒錄成功、BLE 連線成功、校準精靈在真裝置上跑過一輪,
  快速歸零的 axisSwap 修正經使用者實測確認正常。
- **實機旋轉記錄**(2026-08-28,issue #2):重新燒錄現行韌體,65.5s / 1639 行 / 25Hz 序列擷取,
  零 `ERR:1`、零畸形封包,Roll 擺動 193–197°、Pitch 擺動 96–97°,證實 08-22 的逐軸降級
  修法(App 端 `parseAnglePacket`)在實機下 Roll 不再靜默卡在 0。
- **校準精靈全流程實機驗收**(2026-08-29,issue #3 校準子項):用 Playwright 連上正在跑的
  packaged app(CDP `--remote-debugging-port`)驅動 UI,真人配合完成連線 → 選右腿 →
  站直捕零位 → 前抬大腿 → 後勾小腿 → 略過外展 → 預覽確認 → 套用,全程截圖記錄。透過
  `localStorage` 直接讀出 `wearSide:"right"`、`lastCalibratedAt` 皆正確寫入。免手擷取
  單次嘗試失敗屬設計內防呆(非 bug),手動點擊觸發後續步驟正常完成。

> ⚠ 舊版本檔曾記載一段「拔除杜邦線 / 頻寬監控」的 E2E 實測結果,那是 **v1(Express 架構)**
> 時期的紀錄。v2 重寫後該迴路尚未重新驗證,故不列為現行證據。

---

## 📜 歷史沿革(壓縮保留)

- **v1(至 2026-06-26)**:Vanilla JS + Express + sqlite3。完成雙軸感測、多協定指定動作
  判定、Varus/Valgus 冠狀面視覺化、BLE 雙向控制。2026-06-11 全系統審計修復 19 項缺陷
  (超限警報死碼、`|| null` 吞掉 0° 合法值、BLE MTU、`volatile` 競態、NaN 防護等)。
- **v2 重寫(2026-06-27)**:桌面端從零重寫為 Electron + Vite + React + TS + IPC +
  better-sqlite3。移除 Express/localhost(消除 CSP/連接埠/啟動 race)、狀態集中 Zustand、
  判定引擎改純狀態機。重寫時一併修復舊版遺失的超限警報與無人監聽的 `ERR:1` 遮罩。
- **2026-07**:韌體 v3 模組化、方向校正與 axisSwap、判定穩定化、UI 節流、Apple/Liquid
  Glass 雙主題、底部導覽改版、無邊框視窗、v1.0.0 / v1.0.1 發布。
- **2026-08**:判定正確性批次(rest 不變式殺掉幻影 reps、wrap-safe、警報三修)、
  migration runner、ErrorBoundary、目視驗收 4 修、方向裁決會議(發現 `main` 一直在出貨
  會捏造 reps 的版本)、快速歸零 axisSwap 修復與響應式 5 修。

詳見 [`doc/coding log/`](coding%20log/) 與 [[HOME]] 的狀態速記。

---

## 📁 相關檔案狀態

### 文件

| 檔案 | 角色 |
|---|---|
| [`README.md`](../README.md) | 專案總覽與文件入口 |
| [`doc/HOME.md`](HOME.md) | **Obsidian 導覽首頁 + 逐次變更速記(最即時)** |
| [`doc/README.md`](README.md) | 系統架構與整合規格(硬體腳位、BLE 協定、六軸方向定義) |
| [`doc/PROJECT_STATUS.md`](PROJECT_STATUS.md) | 階段性總覽(本檔) |
| [`doc/ROADMAP.md`](ROADMAP.md) | 架構決策 D1–D4 與 Phase 0–5,含歷次會議的順位覆寫 |
| [`doc/OPTIMIZATION.md`](OPTIMIZATION.md) | 功能盤點與 P0–P4 活清單(含被否決項與理由) |
| [`doc/AI_CODING_RULES.md`](AI_CODING_RULES.md) | 協作規範與參數速查(GPIO / BLE / schema / 判定) |
| [`doc/coding log/`](coding%20log/) | 變更日誌,只增不改 |

### 邊緣端 (ESP32)

- `IRMS_Sensor/IRMS_Sensor.ino` + `config.h` + `imu.h`(v3 模組化,**待燒錄**)
- `IRMS_Sensor/IRMS_Sensor_Full.bak`(v1 含 Task_Logic/NVS 的舊版,保留供 D1 後果條款參考)
- `I2C_Scanner/I2C_Scanner.ino`(接線檢測工具)

### 應用端 (IRMS_App/src)

- `shared/`:`protocol.ts`(BLE 協定/封包解析)、`types.ts`、`ipc.ts`、`defaults.ts`、
  `validation.ts`、`downsample.ts`(LTTB)——前後端共用單一真實來源。
- `main/`:`index.ts`(視窗 + BLE 自動配對)、`db.ts`、`migrations.ts`、`ipc.ts`。
- `preload/`:`index.ts`(contextBridge → `window.irms`)。
- `renderer/src/`:
  - `store/`:`useStore.ts`(Zustand + persist + 校準)、`useUiStore.ts`
  - `services/`:`triggerEngine` / `movementMetric` / `calibration` / `angleMath` /
    `smoothing` / `guidance` / `uiThrottle` / `escapeStack` / `bluetooth` /
    `sessionController` / `theme`
  - `components/` 與 `views/`:Dashboard / Actions / History / Settings 四視圖及共用元件
  - `styles/global.css`:Liquid Glass 主題與版面
