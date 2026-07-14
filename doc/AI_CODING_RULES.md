# 智慧復健監測系統 (IRMS) AI 協同開發與編碼規範 (AI Coding & Collaboration Guidelines)

> **相關文件**:[專案總覽](../README.md) · [系統規格 README](README.md) · [開發進度 PROJECT_STATUS](PROJECT_STATUS.md) · [優化待辦 OPTIMIZATION](OPTIMIZATION.md) · [變更日誌 coding log](coding%20log/)

本文件定義了 AI 助手在參與此專案（包括 ESP32 韌體與 Electron 監測應用程式）開發時必須遵守的編碼原則與運行邏輯。這些規則旨在確保系統的穩定性、代碼的可讀性，並極大化 AI 的協同開發效率。

---

## 1. AI 代理運行邏輯與協同規則 (AI Agent Operational Logic)

為保持與 Claude/Antigravity 運作邏輯的一致性並最大化開發品質，AI 必須嚴格遵守以下行為準則：

* **拒絕占位符 (No Placeholders)**：
  * 修改或生成代碼時，**嚴禁**使用 `// TODO`、`// ... 其餘代碼不變` 或 `/* 實作省略 */` 等占位文字。
  * 每次輸出必須是**語法完整、可直接編譯/運行**的完整程式碼區塊。
* **分步執行與自我修正 (Step-by-Step & Self-Correction)**：
  * 面對複雜任務時，必須先分解為子任務，並遵循「分析 -> 實作 -> 驗證」的增量修改循環。
  * 若程式在編譯、執行或測試時報錯，AI 必須詳細分析報錯日誌並進行自我修正，嚴禁在同一個錯誤點重複發起無效的修改嘗試。
* **文件與註解維護 (Comments & Docs Preservation)**：
  * 必須完整保留代碼中原有且不衝突的**繁體中文註解**。
  * 新增任何函數、變數或重要控制邏輯時，必須附上清晰的繁體中文說明。
  * 修改核心功能或接口協議後，必須在第一時間同步更新 [PROJECT_STATUS.md](PROJECT_STATUS.md)、[README.md](README.md)(系統規格)與 [OPTIMIZATION.md](OPTIMIZATION.md),並確保 BLE 協定 / SQLite schema 描述與實際程式碼一致。
* **增量編輯 (Incremental File Editing)**：
  * 嚴禁對大型檔案進行無意義的整檔覆寫。必須優先使用精密編輯工具（如 `replace_file_content` 或 `multi_replace_file_content`），以降低 Token 消耗並避免意外覆蓋其他無關邏輯。
* **記錄計畫與變更日誌 (Plan & Action Logging)**：
  * 每次進行開發計畫與程式碼變更時，必須在 [coding log](coding%20log/) 目錄下建立全新的 markdown 格式 log 檔案，記錄當時的修改目的與所有 AI 執行動作。
  * 每次都必須建立獨立的新 log 檔案，嚴禁覆寫或刪除歷史舊 log。
* **持續運行與架構質疑 (Continuous Execution & Architectural Questioning)**：
  * 在完成任何分配的任務後，AI **不得直接結束**運作。
  * AI 必須以「質疑與批判」的角度，主動審查專案的整體架構、代碼邏輯、同步協定與異常防護是否存在潛在問題、漏洞或改進空間，並向使用者提出建設性反饋，以更有效地掌控與優化此專案。

---

## 2. ESP32 韌體開發規則 (ESP32 Firmware Rules)

* **FreeRTOS 多執行緒安全 (Thread Safety)**：
  * ESP32 採用多工作 (Task) 架構運行。所有跨執行緒共享的全局數據（如 `latestAngles`、`currentProfile`）**必須使用訊號量或互斥鎖 (Mutex/Semaphore)** 進行同步保護。
* **非阻塞調度 (Non-blocking Task Delays)**：
  * 所有的工作循環內部必須使用 `vTaskDelay(pdMS_TO_TICKS(ms))` 釋放 CPU 控制權，**嚴禁調用阻塞式 `delay()`**，以免造成核心調度飢餓、BLE 看門狗逾時或通訊嚴重卡頓。
* **I2C 連線健全度與自動復位 (Auto-Recovery)**：
  * 每次讀取感測器皆需判定 I2C 狀態。**若連續失敗次數 > 5 次**，必須將系統切換至 `STATE_ERROR`，並在工作執行緒中執行 `Wire.begin()` 重新初始化總線並重新喚醒 `MPU6050`，實現無感自我修復。
* **NVS (Preferences) 寫入限制**：
  * 為了保護 ESP32 快閃記憶體壽命，禁止高頻寫入 NVS。NVS 僅能在 BLE 接收到新的設定檔參數時進行單次寫入。
* **燒錄與排錯規範 (Flashing & Debugging)**：
  * **序列埠衝突防範 (Serial Port Conflict)**：在進行韌體燒錄（Upload）時，必須確認對應的序列埠（如 `COM3`）未被其他程式佔用。常見衝突原因包括 Arduino IDE 的「序列監視器 (Serial Monitor)」處於開啟狀態，或有其他背景程式正佔用該埠。燒錄前必須先關閉序列監控，否則會觸發 `Could not open COMx, the port is busy or doesn't exist` 燒錄錯誤。

---

## 3. 應用監測端 (Electron App) 開發規則 (Electron App Rules)

* **資料庫高頻寫入防護 (SQLite Buffer/Transaction)**：
  * 由於邊緣端角度推送頻率高（10Hz），為避免 SQLite 因高頻磁碟 I/O 連鎖鎖定，應用端在寫入 `sensor_data` 時必須使用**事務（Transactions）**進行批量寫入，或建立寫入緩衝區。
* **藍牙連線生命週期管理 (BLE Lifecycle & UI Protection)**：
  * 應用端必須監聽 `select-bluetooth-device` 與設備斷線事件。
  * 當藍牙連線意外中斷或收到 `ERR:1` 異常時，前端必須凍結角度顯示，暫停資料庫寫入，並彈出**紅色警示遮罩 (Error Overlay)**。待復原後自動解除，防止系統在無有效資料時崩潰或寫入空值。
* **Chart.js 圖表渲染效能優化 (Chart.js Optimization)**：
  * 即時折線圖必須限制最大顯示點數（如 `maxPoints = 100`），每次有新點進入時，必須呼叫 `chart.data.datasets[i].data.shift()` 移出舊點，避免圖表數據堆積導致瀏覽器渲染引擎崩潰。

---

## 4. AI 開發參數速查表 (AI Cheat Sheet)

AI 助手在編寫代碼時，必須嚴格對齊以下系統參數，嚴禁單方面變更：

### 4.1 硬體引腳與配置 (GPIO & Hardware)
* **狀態指示燈 (System LED)**：`GPIO 2`
* **目標視覺回饋 LED**：`GPIO 25`
* **回饋蜂鳴器 (Active Buzzer)**：`GPIO 26`
* **I2C 總線腳位**：`SDA (GPIO 21)`、`SCL (GPIO 22)`
* **I2C 位址**：大腿端 `0x68`，小腿端 `0x69`

> 此節為協定契約速查;權威來源為 [`IRMS_App/src/shared/protocol.ts`](../IRMS_App/src/shared/protocol.ts) 與韌體
> [`IRMS_Sensor/IRMS_Sensor.ino`](../IRMS_Sensor/IRMS_Sensor.ino),兩端任一變更必須同步。

* **藍牙廣播名稱**：`IRMS_Device`(前端以 `includes("IRMS")` 比對自動配對)
* **BLE Service UUID**：`4fafc201-1fb5-459e-8fcc-c5c9c331914b`
* **MTU**：韌體 `setMTU(128)`,確保 6 軸封包不被截斷。
* **Angle TX 特徵值 (角度推播,ESP32 → App,Notify @10Hz)**：
  * **UUID**：`beb5483e-36e1-4688-b7f5-ea07361b26a8`
  * **正常格式 (6 軸)**：`"T:大腿Pitch,S:小腿Pitch,K:膝夾角,TR:大腿Roll,SR:小腿Roll,KR:膝Roll差"`
    （例如 `"T:15.5,S:-40.2,K:55.7,TR:1.0,SR:-0.5,KR:1.5"`）。`K`/`KR` 為衍生值,前端自行重算。
  * **錯誤格式**：`"ERR:1"` (I2C 斷線時)
* **Profile RX 特徵值 (參數與指令接收,App → ESP32,Write)**：
  * **UUID**：`beb5483f-36e1-4688-b7f5-ea07361b26a8`
  * **Profile 寫入格式**：`"目標角度,容錯範圍,維持時間ms"`（例如 `"90.0,10.0,3000"`）
  * **控制指令 (`CMD:`)**：`CMD:LED_ON/OFF`、`CMD:GOAL`、`CMD:ALARM_ON/OFF`、`CMD:SYNC,大腿offset,小腿offset`

> 權威來源為 [`IRMS_App/src/main/db.ts`](../IRMS_App/src/main/db.ts) 的 `createSchema()`;DB 檔存於 Electron `userData` 目錄(不進版控)。

* **資料表 `custom_actions`** (自訂復健動作範本)：
  * 欄位：`id` (PK), `name` (TEXT), `description` (TEXT), `protocol` (TEXT), `targetAngle` (REAL), `tolerance` (REAL), `holdTimeMs` (INTEGER), `triggerType` (TEXT)
* **資料表 `sessions`** (復健歷程紀錄)：
  * 欄位：`id` (PK), `startTime` (TEXT), `endTime` (TEXT), `targetAngle` (REAL), `tolerance` (REAL), `holdTimeMs` (INTEGER), `actionId` (INTEGER), `actionName` (TEXT), `protocol` (TEXT), `repsCompleted` (INTEGER)
* **資料表 `sensor_data`** (高頻 6 軸角度數據)：
  * 欄位：`id` (PK), `sessionId` (外鍵 → `sessions.id`, `ON DELETE CASCADE`), `timestamp` (TEXT), `kneeAngle` (REAL), `thighAngle` (REAL), `shinAngle` (REAL), `kneeRoll` (REAL), `thighRoll` (REAL), `shinRoll` (REAL)
  * 索引：`idx_sensor_data_sessionId` on `sensor_data(sessionId)`

### 4.4 智慧判定邏輯 (Target & Alarm Rules)
* **達標區間**：`fabs(kneeAngle - targetAngle) <= tolerance`
* **達標回饋**：進入區間時 GPIO 25 點亮，維持時間達 `holdTimeMs` 時完成復健，GPIO 26 蜂鳴器發出雙短響，系統狀態燈快速雙閃。
* **動作安全超限**：`kneeAngle > targetAngle + tolerance + 10.0`
* **超限回饋**：GPIO 26 蜂鳴器持續長鳴，直到回復安全角度。
