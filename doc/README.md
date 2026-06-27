# 智慧復健監測系統 (Intelligent Rehabilitation Monitoring System - IRMS)

> 系統架構與整合技術規格說明書 (System Architecture & Specifications)

---

## 1. 系統概述 (System Overview)

本系統旨在提供一套精準、即時且具備雙向參數同步與互動回饋機制的智慧復健輔助方案。透過穿戴式 ESP32 物聯網 (IoT) 裝置擷取人體運動力學數據，結合邊緣運算 (Edge Computing) 與桌面監測端應用程式 (Electron App)，協助物理治療師與患者即時監控關節夾角變化，並將所有復健歷程自動儲存於本地 SQLite 資料庫中，以進行量化分析與成效追蹤。

---

## 2. 硬體架構與腳位配置 (Hardware Architecture & Pinout)

硬體端以低功耗、高整合度的 ESP32 微控制器為核心，搭配高精度雙慣性感測器，組成穿戴式感測節點。

* **核心運算單元 (MCU)**：ESP32 (雙核心 32-bit 處理器，內建 BLE 5.0)
* **姿態感測單元 (IMU)**：雙 MPU6050 (六軸加速度計與角速度計)，分別配戴於關節兩側（大腿與小腿端），透過 I2C 總線與 MCU 通訊：
  * **SDA 腳位**：GPIO 21
  * **SCL 腳位**：GPIO 22
  * **I2C 位址**：大腿端位址為 `0x68`，小腿端位址為 `0x69` (小腿 AD0 腳位接至 3.3V)
* **警示與回饋單元**：
  * **狀態指示燈 (System LED)**：GPIO 2 (內建 LED)，用於呈現藍牙廣告、連線、錯誤與目標達成之閃爍狀態。
  * **目標區間視覺回饋燈 (Ext LED)**：GPIO 25，當關節夾角處於目標容錯區間內時自動點亮。
  * **回饋蜂鳴器 (Active Buzzer)**：GPIO 26，提供復健達標提示（雙響）與超限危險警報（持續長鳴）。
* **電源管理**：支援 3.7V 鋰電池供電，並提供斷電持久化設定記憶。

---

## 3. 韌體與軟體架構 (Software Architecture)

系統採用多執行緒與分散式架構設計，將即時性要求極高的感測濾波運算，與資料庫讀寫及 UI 渲染進行解耦。

```
+-------------------------------------------------------------+
|                      ESP32 Firmware                         |
|   +--------------+   +--------------+   +---------------+   |
|   | Task_Sensor  |-->|  Task_Logic  |-->|   Task_Comm   |   |
|   |  (Core 1)    |   |   (Core 1)   |   |   (Core 0)    |   |
|   +--------------+   +--------------+   +---------------+   |
+----------------------------------------/---------\----------+
                                        /           \
                               BLE Rx  /             \ BLE Notify
                        (Write Profile)               \ (T,S,K Angles)
                                      /                 \
+------------------------------------v-------------------v----+
|                       Electron Desktop App                  |
|   +--------------------------+   +----------------------+   |
|   |   Vanilla JS Frontend    |   |   Express Backend    |   |
|   |  (Web Bluetooth / Chart) |<->|  (SQLite DB Logger)  |   |
|   +--------------------------+   +----------------------+   |
+-------------------------------------------------------------+
```

### 3.1 邊緣運算韌體 (Edge Firmware - ESP32)
基於 FreeRTOS 實作多工作業架構，各任務分配如下：
1. **感測任務 (Task_Sensor - Core 1, 優先權 3)**：
   - 以 50Hz 頻率讀取雙 MPU6050 原始數據。
   - 實作**互補濾波器 (Complementary Filter)** 融合加速度與角速度，並於啟動時自動校準陀螺儀零點偏移。
   - 包含 I2C 故障自動檢測，若連續 5 次讀取失敗則切換至錯誤狀態，發送錯誤代碼並嘗試自動重啟 I2C 總線。
2. **邏輯任務 (Task_Logic - Core 1, 優先權 2)**：
   - 監聽最新角度數據，比對「目標角度」、「容錯區間」與「維持時間」。
   - 控制 GPIO 25 回饋燈與 GPIO 26 蜂鳴器。
3. **通訊任務 (Task_Comm - Core 0, 優先權 1)**：
   - 負責 BLE 廣播與客戶端狀態監測。
   - 每 100ms (10Hz) 將大腿、小腿及夾角數據 (`T:xx.x,S:yy.y,K:zz.z`) 或錯誤碼 (`ERR:1`) 推播至 App。
   - 接收來自 App 的設定檔資料，解譯後即時更新並存入 NVS。
4. **狀態指示任務 (Task_LED - Core 1, 優先權 1)**：
   - 依據系統當前狀態（未連線、已連線、硬體異常、達標完成）切換內建 LED 閃爍頻率。

### 3.2 應用端介面與後端 (Electron App — v2 架構)
自 v2 起,應用端改以 **Electron + Vite + React + TypeScript** 重寫,並以 **IPC + contextBridge** 取代舊版的 Express/localhost 伺服器,資料層改用同步的 **better-sqlite3**。

* **前端 (Renderer / React)**:即時關節角度折線圖 (Chart.js)、SVG 骨架視覺化、達標進度環、參數同步面板、歷史瀏覽與 CSV 匯出。透過 Web Bluetooth 與 ESP32 自動配對。狀態以 Zustand 集中管理(單一真實來源)。
* **主進程 (Main)**:建立視窗、Web Bluetooth 裝置自動配對、`better-sqlite3` 資料存取,並透過 `ipcMain.handle` 提供 Session/Data/Action 操作。
* **安全橋接 (Preload)**:以 `contextBridge` 將型別安全的 `window.irms` API 注入 renderer(`contextIsolation` 開啟、`nodeIntegration` 關閉)。
* **資料持久化 (SQLite DB)**:本地 SQLite 資料庫存於 Electron `userData` 目錄(不再置於專案樹),設計 `custom_actions`、`sessions`、`sensor_data` 三張資料表;`sensor_data` 以外鍵 `ON DELETE CASCADE` 連動。
* **協定相容**:BLE Service/Characteristic UUID、角度封包與 `CMD:` 指令完全沿用,韌體無需修改。

---

## 4. 系統整合規格細節 (System Integration Specifications)

### 4.1 邊緣端 (ESP32) 整合細節
* **感測器穩健度與動態校準**：
  * **I2C 健康度檢查與防錯**：在 `setupMPU6050()` 中檢驗 `Wire.endTransmission()` 回傳狀態碼。若偵測到連線異常，系統會將狀態切換至 `STATE_ERROR`，狀態 LED (GPIO 2) 進入 10Hz 高速閃爍模式，並透過 BLE 發送 `ERR:1` 代碼，避免系統輸出無效數據。
  * **自動動態校準 (Auto-Calibration)**：設備開機時會進入 3~5 秒的靜態校準期（取樣 200 次陀螺儀讀數），自動計算並扣除 X 軸陀螺儀的零點偏移 (Zero-rate offset)，有效抑制積分漂移。
  * **軟體自動復位 (Auto-Recovery)**：於 `Task_Sensor` 中，若感測器連續 5 次讀取失敗，將觸發 I2C 總線重新初始化並嘗試重新喚醒 MPU6050，確保在接觸不良等突發硬體狀況下具備自我修復能力。
* **雙向通訊整合 (BLE Characteristic)**：
  * **角度推播 (Angle TX Characteristic)**：
    * **UUID**：`4fafc201-1fb5-459e-8fcc-c5c9c331914b` -> `beb5483e-36e1-4688-b7f5-ea07361b26a8`
    * **格式**：當 I2C 正常時，以 10Hz 頻率通知發送 `T:大腿角度,S:小腿角度,K:膝蓋夾角` (例如 `T:12.5,S:-45.2,K:57.7`)；若發生 I2C 離線，則發送 `ERR:1`。
  * **參數接收 (Profile RX Characteristic)**：
    * **UUID**：`4fafc201-1fb5-459e-8fcc-c5c9c331914b` -> `beb5483f-36e1-4688-b7f5-ea07361b26a8`
    * **格式**：允許 App 透過 BLE Write 傳入 `目標角度,容錯範圍,維持時間` (如 `90.0,10.0,3000`)。
    * **持久化儲存**：接收到新參數後，自動調用 Preferences 程式庫寫入 ESP32 的 NVS 快閃記憶體，下次開機時自動加載。

### 4.2 應用端 (Electron App) 整合細節
* **藍牙自動配對與連接**：
  * Electron 主進程 (`main.js`) 監聽 `select-bluetooth-device` 事件，自動過濾並選取名稱為 `IRMS_Device` 的藍牙設備，省去繁瑣的手動選擇視窗。
  * 前端網頁 (`app.js`) 透過 Web Bluetooth 連接至該設備，並對 `Angle TX` 特徵值進行監聽。若連線意外中斷，會自動重設 UI 狀態，並在日誌記錄錯誤，待使用者再次點擊時進行重新連接。
* **雙向參數控制面板**：
  * 在主界面設計了「設定面版 (Profile Settings)」，允許使用者調整目標角度、容錯與維持時間，並點擊「Sync to ESP32」將設定下發。
  * 同步成功後，前端儀表板的對應指示數值（如 Target、Tol）會即時更新。
* **資料持久化與匯出**：
  * **SQLite 本地資料庫**：
    * `sessions` 資料表：記錄每次復健歷程的 ID、開始時間、結束時間、設定的目標角度、容錯與維持時間。
    * `sensor_data` 資料表：以 `sessionId` 作為外鍵，記錄高頻率的膝蓋夾角讀數及時間戳記。
  * **CSV 數據匯出**：提供一鍵導出按鈕，將所有歷史復健 Session 及其感測角度數據整合成 CSV 格式下載，便於物理治療師進行量化評估與學術分析。
* **進階異常提示**：
  * 應用端主畫面上設有隱藏的 `error-overlay` 紅色警示遮罩。
  * 當從藍牙接收到 `ERR:1` 訊號時，應用端會立刻凍結即時角度顯示（呈現為 `ERR` 字樣），並彈出「🚨 硬體異常：感測器 I2C 連線脫落，系統嘗試重新連線中...」之醒目警報。若 ESP32 自動復位成功並恢復發送正常角度，警示遮罩會自動消失，確保使用者能即時得知硬體接線狀態。

---

## 5. 開發建置指引 (Development & Build Guide)

### 5.1 邊緣端 (ESP32) 燒錄與部署
1. 使用 Arduino IDE 或 VS Code (PlatformIO) 開啟 `IRMS_Sensor/IRMS_Sensor.ino`。
2. 在開發板管理員中，確認已安裝並選擇 **ESP32 Arduino Core v3.0.x**。
3. 選擇對應的開發板型號（如 ESP32 Dev Module），確認 I2C 接腳與周邊配置無誤。
4. 編譯並燒錄韌體至 ESP32 晶片中。

### 5.2 應用端 (Electron App) 安裝與執行 (v2)
1. 進入 `IRMS_App` 目錄:
   ```bash
   cd IRMS_App
   ```
2. 安裝依賴(`postinstall` 會自動以 `electron-rebuild` 重建原生模組 `better-sqlite3`):
   ```bash
   npm install
   ```
   > 若原生模組載入失敗,可手動重建:`npm run rebuild`
3. 開發模式啟動(Vite HMR + Electron):
   ```bash
   npm run dev
   ```
4. 型別檢查 / 打包:
   ```bash
   npm run typecheck   # 檢查 main 與 renderer 兩端型別
   npm run dist        # electron-vite build + electron-builder 產生安裝檔
   ```

技術棧:Electron 33 · Vite 5 · React 18 · TypeScript 5 · better-sqlite3 11 · Zustand 5 · Chart.js 4。
