# IRMS (智慧復健監測系統) - 專案開發進度與整合報告

> **相關文件**:[專案總覽](../README.md) · [系統規格 README](README.md) · [優化待辦 OPTIMIZATION](OPTIMIZATION.md) · [編碼規範 AI_CODING_RULES](AI_CODING_RULES.md) · [變更日誌 coding log](coding%20log/)

## 📅 更新日期
2026-06-30(v2 重寫於 2026-06-27)

> ⚠ **本文件內容僅涵蓋至 2026-06-30**,之後(韌體 v3、引導式監測重構、方向校正、
> 達標判定穩定化、UI 節流、Apple/Liquid Glass 主題、自製桌布、側欄→頂部+底部導覽
> 改版、無邊框視窗等)未反映於此。**最新現況請見 [[HOME|doc/HOME.md]] 與
> [[ROADMAP|doc/ROADMAP.md]]**;下方「進行中/待辦事項」清單同理已被
> ROADMAP.md 的 Phase 0–5 / D1–D4 決策體系取代,僅保留作歷史紀錄。

## 🔄 v2 應用端從零重寫 (2026-06-27)

桌面監測端 (IRMS_App) 已從「Vanilla JS 模組 + Express + sqlite3」**從零重寫**為
**Electron + Vite + React + TypeScript + IPC + better-sqlite3**。ESP32 韌體與 BLE 協定不變。

**架構升級**
- 移除 Express/localhost,改用 Electron **IPC + contextBridge**(型別安全 `window.irms`),消除 CSP/連接埠/啟動 race 問題。
- 資料層改 **better-sqlite3**(同步、穩定),DB 移至 `userData` 目錄(不再進版控)。
- 狀態以 **Zustand** 集中(單一真實來源),取代 StateManager + DOM 雙來源。
- TriggerEngine 改為純狀態機(可測試);校準邏輯集中於 `applyCalibration`。

**重寫時一併修復的舊版缺陷**
- 🔴 **超限安全警報**:重新實作(舊版重構後完全遺失,從未發出 `CMD:ALARM_ON`)。
- 🔴 **ERR:1 紅色遮罩**:重新接線(舊版事件無人監聽);錯誤時凍結畫面並暫停資料寫入。
- 🟡 `restore_defaults` 端點、`action` 資料模型(改 `actionId`+`actionName`)、死訂閱、NaN 節流、XSS(React 文字渲染)等全部修正。

詳見 `doc/coding log/log_20260627_app_v2_rewrite.md`。

> ⚠ 尚未執行 `npm install`、BLE 實機連線尚待裝置回歸後驗證。

---

## ✅ 先前已完成進度 (Phase 1, Phase 2 & Phase 3 — v1)

本專案目前已成功完成硬體端（ESP32）韌體架構與軟體桌面端（Electron App）的整合開發。系統具備多角度 Roll/Pitch 雙向感測、指定動作判定、藍牙硬體連動回饋、本地數據庫儲存與異常容錯能力。

### 1. 穿戴式感測節點 (邊緣端)
- **多執行緒架構**: 導入 FreeRTOS，將感測任務 (`Task_Sensor` @50Hz)、邏輯判定任務 (`Task_Logic`)、藍牙通訊任務 (`Task_Comm` @10Hz) 與狀態指示任務 (`Task_LED`) 解耦運行。
- **雙軸互補濾波演算法**: 升級 `readMPU6050` 及 `Task_Sensor`，同時融合大腿與小腿的 Pitch（矢狀面彎曲）與 Roll（冠狀面側彎）角度，並套用互補濾波器與零點偏移校準。
- **BLE 指令通道與雙向控制**: 
  - 藍牙推播 packet 升級為傳送 6 軸數據：`T,S,K,TR,SR,KR`（包含大腿、小腿、關節夾角及其 Roll 側翻角度）。
  - 於 `Profile RX` 寫入特徵值實作 `CMD:` 解碼器，支援 `CMD:LED_ON/OFF` 控制 LED 綠燈、`CMD:GOAL` 觸發蜂鳴器雙短響，以及 `CMD:ALARM_ON/OFF` 觸發超限報警長鳴。
  - 韌體端在 `deviceConnected = true` 時會自動跳過本機 Standalone 簡易判定，避免本機邏輯與 App 端的精準指定動作條件產生控制權衝突。

### 2. 桌面監測應用程式 (應用端與資料庫)
- **多協定指定動作判定**:
  - 於 Profile Settings 新增「指定動作 (Designated Action)」下拉選單，依據當前 active 協議（Knee / Elbow / Shoulder）動態切換（如 Squat 膝彎曲、SLR 直膝抬腿、Backward Extension 後擺腿等）。
  - 於 `app.js` 實作精確的關聯判定（例如直膝抬腿要求：Knee <= 容錯 且 Thigh >= 目標角度；後擺腿要求：Knee <= 容錯 且 Thigh <= -目標角度），並藉由 BLE Command 主動控制硬體的 LED 與 Buzzer，達成硬體與 App 100% 同步的即時回饋。
- **內/外翻 (Varus/Valgus) 冠狀面感測與視覺化**:
  - App 端即時解析 `TR, SR, KR`，動態計算關節 Roll 軸差值（內外翻程度），並在儀表板新增 Varus/Valgus 即時卡片。
  - 本地 SQLite 資料庫擴展儲存 `kneeRoll`, `thighRoll`, `shinRoll` 欄位，並支援 Session 開始時指定動作欄位。
  - 歷史分析視窗 (Modal) 圖表全面支援載入並繪製 Varus/Valgus 曲線，並一併升級 CSV 導出模組以包含 6 軸角度數據。
- **Electron 整合與自動連接**: 在 Electron 主進程中自動配對連線 `IRMS_Device` 藍牙裝置，並提供 I2C 異常（`ERR:1`, `ERR:2`）的即時紅色遮罩警告。

### 3. 架構與邏輯缺陷修正 (2026-06-11)
- **非阻塞藍牙通訊**: 移除 `onWrite` 藍牙回呼中的 `vTaskDelay`，將蜂鳴器雙響動作轉交至 `Task_LED` 非同步處理，完全解決藍牙通訊阻塞的潛在超時風險。
- **角速度物理軸向校正**: 修正 `readMPU6050` 內 Pitch 與 Roll 的角速度對應，使其分別對應 `gy` 與 `gx`，提升互補濾波之動態演算精確度。
- **I2C 重連平滑化**: 於感測器斷線恢復後，自動重設濾波角至靜態加速度角，並將 `lastTime` 與當前系統時間對齊，杜絕 `dt` 突增引發的積分尖峰波。
- **前端緩衝區防溢出**: 於 `app.js` 加入 `restoreDataBuffer` 邏輯與最大 2000 點上限限制，避免長時間連線中斷後拼接巨量陣列引發瀏覽器主執行緒卡死與效能衝擊。

### 4. 全系統深度程式碼審計與 19 項 Bug 修復 (2026-06-11)
針對 ESP32 韌體與 Electron App 進行了全面審計，修復了 19 項潛在缺陷：
* **🔴 Tier 1 嚴重問題（安全與數據完整性）**：
  * **超限警報死碼修復**：修正 `app.js` 中 `cfgAction` 判定邏輯，改為比對 `activeAction.triggerType` 判定 `joint_angle` 動作，恢復超限安全警報。
  * **零值數據遺失修復**：修正 `server.js` 與 `app.js` 中 `|| null` 或 `|| ''` 的 falsy 寫法，改用 `??` 空值合併運算子，避免 0° 合法角度數據被丟棄。
  * **BLE MTU 設定**：於韌體中顯式呼叫 `BLEDevice::setMTU(128)`，解決 6 軸數據包長度超過預設 23 bytes 導致的數據截斷問題。
  * **Volatile 變數宣告**：宣告 `deviceConnected` 與 `oldDeviceConnected` 為 `volatile`，防止 FreeRTOS 跨工作快取導致的連線狀態競態條件。
  * **NaN 防護**：在 `app.js` 中對 BLE 角度解析結果進行 `isNaN` 判定，自動丟棄異常封包，確保數據管線穩定。
* **🟡 Tier 2 中度問題（健全性與一致性）**：
  * **Express 啟動卡死防護**：修正 `startServer()`，監聽 `error` 事件並在端口衝突時 `reject` Promise，防止 Electron 進程卡死。
  * **I2C 復原狀態修正**：修改韌體，使 I2C 總線恢復後的系統狀態能依據 `deviceConnected` 在 `STATE_CONNECTED` 與 `STATE_ADVERTISING` 間動態正確切換。
  * **BLE 重連狀態重設**：斷線時清除 App 端的 `lastSentLedState` 與 `lastSentAlarmState` 快取，避免重連後因硬體狀態重置而無法重新同步。
  * **Start Session 按鈕邏輯**：更新 `updateUIConnected()`，僅在當前協定包含可用自訂動作時才啟用開始按鈕，避免無動作 Session 寫入。
  * **Restore Defaults 避免重複**：在插入預設動作前先對現有動作執行 `DELETE`，解決重複點擊產生重複記錄問題。
  * **CSV 匯出優化**：改用 `Blob` 與 `URL.createObjectURL` 代替 `encodeURI`，解決大型 CSV 數據截斷與特殊字元（如 `#`, `&`）出錯問題。
  * **ESP32 堆積碎片化優化**：將 Task_Comm 內的 String 串接改用棧上 `char` 陣列與 `snprintf` 實作。
  * **FreeRTOS 堆疊溢出防護**：將 `Task_LED` 的堆疊大小從 1024 增大至 2048 單位，避免崩潰。
  * **MPU6050 寫入校驗**：在 `setupMPU6050` 中全面檢查所有 I2C `endTransmission()` 回傳碼，防範配置失敗。
  * **I2C 超時設定**：新增 `Wire.setTimeOut(1000)` 防止總線鎖死導致 Task_Sensor 無限期掛起。
* **🟢 Tier 3 輕度/改進問題**：
  * **XSS 安全防範**：將 `logDebug` 中 `innerHTML` 修改為 `textContent` 插入，防範潛在的 DOM-based XSS 注入。
  * **廣播狀態修正**：BLE 廣播啟動後將狀態設為 `STATE_ADVERTISING` 以對齊狀態指示燈語意。
  * **校準精度保留**：修改 `calibrateMPU6050` 使用 `float` 直接進行角速度累加，避免 `float -> long -> float` 不必要的轉換精度損失。

---

## 🧪 端到端驗證結果 (E2E Verification)

本系統已通過以下整合驗證，運行指標良好：

1. **斷線容錯與數據完整性測試**:
   - **實測**: 在 Session 進行中拔除 MPU6050 杜邦線。
   - **結果**: ESP32 狀態 LED 立刻轉為快閃，發送 `ERR:1`。Electron App 瞬間跳出紅色警示，且 SQLite 暫停寫入無效數據。當插回杜邦線後，ESP32 於 1 秒內自動完成 I2C 重啟與 MPU6050 喚醒，App 警示消失並恢復紀錄，無程式崩潰或資料庫死鎖問題。
2. **傳輸頻寬與效能監控**:
   - **實測**: ESP32 以 50Hz 頻率進行濾波運算與佇列傳遞，並以 25Hz BLE 頻率推播至 App。
   - **結果**: Chart.js 即時圖表流暢顯示，無延遲 (Lag)，Electron 渲染進程與 Node.js 後端服務 CPU 使用率均維持在 5% 以下，無記憶體洩漏現象。

---

## 🏃 進行中/待辦事項 (Phase 3: 臨床驗證與硬體設計)——⚠ 歷史紀錄,已被 [[ROADMAP]] 取代

接下來的開發階段建議朝以下方向推進：

- [ ] **硬體機構設計**：設計 3D 列印穿戴式外殼與魔鬼氈綁帶，確保大腿與小腿感測器在配戴時的穩定性與舒適度。
- [ ] **臨床數據校準**：收集真實人體測試數據，進一步微調互補濾波器的權重比例與馬達/蜂鳴器回饋的作動時機。
- [ ] **病患復健評分模型**：在應用端或後台實作評分機制，依據動作平穩度（角速度變異數）與維持時間達標率產出單次復健履歷的品質分數。
- [ ] **多關節協議支持**：擴展系統參數，以適應肘關節、肩關節或踝關節等多種不同的物理治療復健協議。

---

## 📁 相關檔案狀態

### 文件檔案
- [`README.md`](../README.md) (根目錄)：專案總覽與文件入口(v2 架構摘要、快速開始、倉庫結構)。
- [`doc/README.md`](README.md)：系統架構、整合規格與建置說明文件(BLE 協定、SQLite schema、腳位)。
- [`doc/PROJECT_STATUS.md`](PROJECT_STATUS.md)：專案開發進度報告與整合細節報告（本檔案）。
- [`doc/OPTIMIZATION.md`](OPTIMIZATION.md)：v2 功能清單與 P0–P4 優化待辦(活清單)。
- [`doc/AI_CODING_RULES.md`](AI_CODING_RULES.md)：AI 協同開發與編碼規範及參數速查表，確保後續 AI 開發邏輯一致與效率。
- [`doc/coding log/`](coding%20log/)：歷次開發計畫與變更日誌(只增不改);v2 重寫詳見 [`log_20260627_app_v2_rewrite.md`](coding%20log/log_20260627_app_v2_rewrite.md)。

### 邊緣端 (ESP32) 程式碼
- `I2C_Scanner/I2C_Scanner.ino` (已完成)：硬體 I2C 接線檢測工具。
- `IRMS_Sensor/IRMS_Sensor.ino` (已完成)：ESP32 主韌體程式碼（含 FreeRTOS, BLE, Complementary Filter, NVS, I2C Recovery）。

### 應用監測端 (Electron App) 程式碼 — v2
- `IRMS_App/src/shared/`:`protocol.ts`(BLE 協定/封包解析)、`types.ts`(DB 模型 + `IrmsApi`)、`ipc.ts`、`defaults.ts`。前後端共用單一真實來源。
- `IRMS_App/src/main/`:`index.ts`(視窗 + BLE 自動配對)、`db.ts`(better-sqlite3)、`ipc.ts`(IPC handlers)。
- `IRMS_App/src/preload/`:`index.ts`(contextBridge → `window.irms`)、`index.d.ts`。
- `IRMS_App/src/renderer/src/`:
  - `store/`:`useStore.ts`(Zustand + persist + 校準)、`useUiStore.ts`。
  - `services/`:`bluetooth.ts`、`triggerEngine.ts`(含超限警報)、`sessionController.ts`。
  - `components/` 與 `views/`:Dashboard / Actions / History / Settings 四視圖及共用元件。
  - `styles/global.css`:Glassmorphism 主題。
- 舊版檔案(`main.js`/`server.js`/`db.js`/`public/`/`routes/`)已移除,保留於 git 歷史。
