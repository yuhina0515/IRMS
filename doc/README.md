# 智慧復健監測系統 (Intelligent Rehabilitation Monitoring System - IRMS)

> 系統架構與整合技術規格說明書 (System Architecture & Specifications)

> 2026-10-29 Wizard B access: B now uses the single-calibration-wizard portal/focus contract, named
> Close and side pressed states, priority-10 capture Escape consumption. B raw-stream lifetime/detection,
> solver and Apply-only persistence unchanged. Simultaneous arbitrary A/B mounting unsupported;
> native raw/AT/paint/step and metrology acceptance remain open.

> 2026-10-29 calibration modal: Wizard A owns a named body-portal dialog with focus/background
> isolation. It yields to real alertdialogs through closing, resuming its prior control after recovery.
> Paint layers: Wizard A 1100, confirmation 1200, hardware 1500 (native paint acceptance pending).
> Escape priority: background 0, Wizard A 10, confirmation 20, hardware 100; capture consumes without
> closing. Explicit close/capture math unchanged. Native AT/step announcements/Wizard B remain open.

> 2026-10-29 calibration controls: Wizard A exposes localized Close and mutually exclusive wear-side
> pressed states using existing native buttons/local state. Selection and close do not apply settings.
> Capture math/timing unchanged; full modal focus and native AT acceptance remain open.

> 2026-10-29 emergency access: ErrorOverlay owns a named body-portal alertdialog, contained focus,
> save/disconnect access and reversible inert isolation. Confirmation hands off the original recovery
> target; shared isolation leases restore only after the last owner. Hardware Escape priority 100
> consumes without dismissal; ordinary priority 0 remains LIFO. Session/BLE/DB/IPC contracts unchanged.

> 2026-10-29 dropdown access: GlassDropdown is a select-only combobox with trigger focus,
> active-descendant navigation, explicit Enter/Space/Tab/click commit and Escape cancellation.
> Closing options are noninteractive; shared Escape stack protects underlying layers. Display
> language/theme/pose fields have associated names; native/AT acceptance remains documented separately.

> 2026-10-29 ownership-v1: native per-launch master derives collector-specific proof, only in a
> sensitive HTTP header; first ingest transaction binds its SHA-256 digest in collector `run_owners`.
> Owned ingest/share create requires proof; legacy runs cannot acquire ownership later. Runtime
> module request shape unchanged; native preflight/response markers reject legacy collectors, and
> generation checks suppress stale code/token. Canonical collector URLs exclude userinfo/query/
> fragment; proof-bearing requests never redirect. Client+collector rollout/acceptance still open.

> 2026-10-29 share HTTP budgets: native bridge accepts incoming bodies up to 64 KiB, checking
> declared length and each accumulated chunk for all statuses before appending. Outgoing JSON
> remains <=32 KiB; existing method/path/endpoint/token/timeouts and status/body contract unchanged.
> 64 KiB accommodates current collector 16K UTF-16 state after UTF-8 expansion and its envelope.

> 2026-10-29 share authorization: collector source now ends a removed/departed/expired viewer's
> pending state polls with 401 and no state, revalidating membership at completion. Closing a share
> retains 410. No request format, BLE or DB schema changes; production collector deployment open.

> **相關文件**:[專案總覽](../README.md) · [開發進度 PROJECT_STATUS](PROJECT_STATUS.md) · [優化待辦 OPTIMIZATION](OPTIMIZATION.md) · [編碼規範 AI_CODING_RULES](AI_CODING_RULES.md) · [變更日誌 coding log](coding%20log/)

---

## BLE notification retirement (2026-10-29)

Native angle/raw-calibration/OTA-status dispatch and telemetry are checked under the same short
connection-epoch gate used by begin/invalidate. An invalidation waits for an already-running
dispatch, and a retired listener cannot start another dispatch afterward. Stream acquisition errors
use the same gate; stream-end teardown first waits for the peripheral lock, then rechecks the epoch
before clearing the handle or publishing disconnect. No await or recursive BLE lock acquisition is
allowed within the synchronous epoch callback (lock order: peripheral -> epoch). Poison recovery
keeps retirement available after callback panic. Debug stderr output runs outside that short gate.

This does not recall frontend events already queued before invalidation or add source timestamps.
Native btleplug/OS race acceptance remains open.

### Native connect ownership (2026-10-29)

`ble_lifecycle.rs` reserves an epoch before its first await and serializes native attempts through
cleanup. Current ownership is checked at awaited boundaries; native adapter/scan/setup also check
their internal boundaries. Scan uses one stop_scan epilogue and reports cleanup failures. Installation,
connected publication and listener scheduling run in that order under peripheral/epoch protection.
Disconnect cannot take a newer handle or publish a stale disconnected event. Cancellation preserves
simultaneous backend/cleanup errors. Lock order is attempts -> peripheral -> epoch; disconnect skips
attempts so it can retire ownership promptly.

OS calls already running are awaited before cleanup; cancellation does not mean instantaneous physical
disconnect. Cleanup failure leaves physical state unverified, and arbitrary orchestration-future abort
is not a cleanup guarantee. Fake transports verify the shared orchestration, not real OS timing.

## Firmware and module download budgets (2026-10-29)

The shared HTTP downloader rejects oversized declared Content-Length and also counts every body
chunk before extending its buffer, so chunked/close-delimited responses cannot bypass the limit.
Firmware manifests are capped at 64 KiB, module indexes at 1 MiB and base64 signature text at 1 KiB.
Payload downloads use the exact size from a verified manifest/index (existing maximums: firmware
4 MiB, module 512 KiB). Signature, final size, hash, version and rollback checks remain required.
The byte budget is not a replacement for authenticity checks or a measured process-heap ceiling.
Oversized module metadata follows the existing verified-cache fallback; oversized module content is
skipped without writing partial files. No external service or release format changes.

## Telemetry resource and destination boundaries (2026-10-29)

Opt-in telemetry now accepts at most 64 KiB of serialized event data from either Rust or frontend
callers. The queue evicts oldest events above 20,000 entries or 8 MiB of serialized events; batches
are selected before cloning and capped at 2,000 events / approximately 512 KiB, plus the request
envelope. These are wire-size budgets, not a measured total heap limit. Drops remain visible in status.
Changing the normalized collector endpoint or enabled state discards pending data and changes the
configuration generation. Old request results cannot mutate the new generation. Already-issued
requests may still reach the former destination; changing settings cannot recall transmitted data.
No database schema, BLE protocol or public IPC shape changes. See [research readiness](RESEARCH_READINESS.md)
for the institution/locale evidence matrix and follow-up priorities.

## Mobility and session reliability (2026-10-20)

Repetition-hold follow-up (2026-10-29): TriggerEngine now uses a monotonic receiver clock and reads
it once per sample. A gap above 250 ms, backwards time or a nonfinite clock cancels the current hold;
the next valid strictly in-zone sample starts a fresh hold. Completed repetitions still require an
actual rest sample before rearming, and personal-angle warnings remain independent. This prevents
notification silence from earning hold time. The 250 ms threshold is an engineering continuity
guard; native BLE scheduling and source timestamps remain separate validation work. Visual freshness
during total silence is not changed: this guard is evaluated when the next sample arrives.

Mobility C uses monotonic sample timestamps to require a continuous two-second hold, at least ten samples,
and no inter-sample gap above 250 ms. The gap threshold is an engineering continuity guard, not a validated
clinical threshold. Knee capture requires aligned thigh-reference samples. Trends compare the same movement
set and recorded leg; legacy records without a leg remain a separate group. Closing or disconnecting cancels
the current measurement; a background save still refreshes history without closing a replacement wizard.

Ending a session immediately stops acquisition and repetition counting, waits for any in-flight batch write,
then performs one final flush. A disconnect invalidates a pending session start even if the connection returns.
These changes have automated regression coverage; real BLE timing and native speech remain unverified.

### Session save recovery (2026-10-21)

Final append/finalization failure now retains the stopped session ID, totals and pending readings for explicit
retry. Completion notices and speech occur only after persistence succeeds. A successful append is not replayed
when only finalization failed. Retry is available in the session dock and hardware/crash error fallbacks.
Pending sessions block update installation, firmware updates, demo/calibration changes, and deletion of their
history row. Demo purge removes only completed rows; repeated finalization preserves its first successful end time
and a missing session cannot be reported saved. No database schema or IPC signature changed.

Recovery keeps the app process alive; it is not a durable crash-recovery journal. The existing 2,000-reading
failed-write buffer cap remains. Genuine failed SQLite batches roll back atomically; ambiguous IPC acknowledgements
are not deduplicated and require a separate batch-token design if that failure must be handled.

## 1. 系統概述 (System Overview)

本系統旨在提供一套精準、即時且具備雙向參數同步與互動回饋機制的智慧復健輔助方案。透過穿戴式 ESP32 物聯網 (IoT) 裝置擷取人體運動力學數據，結合邊緣運算 (Edge Computing) 與桌面監測端應用程式，協助物理治療師與患者即時監控關節夾角變化，並將所有復健歷程自動儲存於本地 SQLite 資料庫中，以進行量化分析與成效追蹤。

> **2026-09-16 現役實作更正:**桌面監測端現役實作是 `IRMS_App_Tauri`(Tauri 2 + Rust +
> React/TypeScript),取代下面第 3、4、5 節仍在描述的 Electron v2 架構。Electron
> (`IRMS_App`)已於 2026-09 切換為 Tauri 後停用(原始碼目錄暫留在 repo 內作歷史參照;切換紀錄見
> [TAURI_MIGRATION_PLAN.md](TAURI_MIGRATION_PLAN.md)),故下方 Electron 相關章節保留為
> **歷史/v2 世代文件**,不代表現況。現役架構與開發指引請見
> [`IRMS_App_Tauri/README.md`](../IRMS_App_Tauri/README.md)。硬體(ESP32 韌體、腳位、
> BLE 協定)章節不受此更正影響,雙方應用程式共用同一份韌體協定。

---

## 2. 硬體架構與腳位配置 (Hardware Architecture & Pinout)

> **2026-09-16 protocol WIP:** Tauri and current firmware support the final optional
> `V:x/y/z/x/y/z` acceleration extension (thigh then shin). Exactly six nonempty finite
> values are required; invalid extensions mark truncation and supply neither vector.
> Legacy angle parsing remains supported. Current maximum payload is 114 bytes (MTU >=117).
> See `IRMS_App_Tauri/fixtures/vector-packets.json` for shared TS/Rust regression cases.

硬體端以低功耗、高整合度的 ESP32 微控制器為核心，搭配高精度雙慣性感測器，組成穿戴式感測節點。

* **核心運算單元 (MCU)**：ESP32 (雙核心 32-bit 處理器，內建 BLE 5.0)
* **姿態感測單元 (IMU)**：雙 MPU6050 (六軸加速度計與角速度計)，分別配戴於關節兩側（大腿與小腿端），透過 I2C 總線與 MCU 通訊：
  * **SDA 腳位**：GPIO 21
  * **SCL 腳位**：GPIO 22
  * **I2C 位址**：真機逐顆動態辨識確認，大腿端（含 ESP32）為 `0x69`，小腿外接端為 `0x68`。
* **警示與回饋單元**：
  * **狀態指示燈 (System LED)**：GPIO 2 (內建 LED)，用於呈現藍牙廣告、連線、錯誤與目標達成之閃爍狀態。
  * **目標區間視覺回饋燈 (Ext LED)**：GPIO 25，當關節夾角處於目標容錯區間內時自動點亮。
  * **回饋蜂鳴器 (Active Buzzer)**：GPIO 26，提供復健達標提示（雙響）與超限危險警報（持續長鳴）。
* **電源管理**：支援 3.7V 鋰電池供電。

### 2.1 六軸方向定義(校準後統一慣例,2026-07-05 制定)

> **2026-10-01**:除流程 A 校準精靈外,設定頁新增「校準 B (beta)」——以重力平面、陀螺儀樞軸與六面地面階段推算安裝方向,輸出相同的 Settings 欄位;實機驗證待辦。

App 端校準精靈會把任意佩戴方向的原始值正規化為以下慣例;所有偵測、量表、3D/2D 顯示均以此為準:

| 值 | 意義 | 零點 | 正方向 |
|---|---|---|---|
| `T` 大腿 Pitch | 矢狀面 | 站直(垂直向下) | 向前抬(髖屈) |
| `S` 小腿 Pitch | 矢狀面 | 站直 | 向前(踢出);後勾為負 |
| `K` 膝夾角 | \|T − S\| | 直膝 = 0 | 屈膝越大值越大(無方向) |
| `TR` 大腿 Roll | 冠狀面 | 站直 | 向外側傾 |
| `SR` 小腿 Roll | 冠狀面 | 站直 | 向外側傾 |
| `KR` 內外翻 | SR − TR(帶符號) | 中立 = 0 | **正 = 外翻 (valgus)、負 = 內翻 (varus)** |

**佩戴方位**:感測器建議綁於肢段**外側**、晶片面朝外;但實際方向**不必精準**——校準精靈
會自動偵測並校正:貼歪 90°(彎曲動作出現在 roll 軸)→ 軟體軸對調 (axisSwap);方向顛倒 →
反相 (invert);零位偏移 → 歸零 (offset)。精靈的「腿向外側擺」步驟負責判定 Roll 正方向;
跳過該步驟則內外翻僅保證大小、方向可能相反。

**已知限制**:Yaw(水平轉向)無法量測(MPU6050 無磁力計);膝過伸與屈膝在 `K` 上無法區分
(帶符號膝角列 ROADMAP Phase 4)。

---

## 3. 韌體與軟體架構 (Software Architecture)

> **本節第 3.2、4.2、5.3 小節描述的是 Electron v2 架構,現已被 Tauri 取代為現役實作**
> (見第 1 節更正)。保留在此供 Electron 尚未除役前的維護參考與歷史沿革,韌體(3.1、4.1)
> 章節維持現況適用。

系統採用多執行緒與分散式架構設計，將即時性要求極高的感測濾波運算，與資料庫讀寫及 UI 渲染進行解耦。

```
+-------------------------------------------------------------+
|                 ESP32 Firmware (v3, App-Driven)              |
|   +--------------+      +--------------+   +------------+   |
|   | Task_Sensor  |----->|  Task_Comm   |   |  Task_LED  |   |
|   | (Core1, P3)  |mutex |  (Core0, P1) |   | (Core1,P1) |   |
|   +--------------+      +--------------+   +------------+   |
|         ^  GPIO25 LED / GPIO26 蜂鳴器 ← onWrite CMD 直控     |
+---------|------------------------/---------\----------------+
     I2C 50Hz                     /           \
   雙 MPU6050            BLE Rx  /             \ BLE Notify 25Hz
                     (CMD: 指令)                \ (T,S,K,TR,SR,KR)
+--------------------------------v---------------v------------+
|                  Electron Desktop App (v2)                   |
|   +--------------------------+   +----------------------+    |
|   | Renderer (React+Zustand) |   |  Main (IPC handlers) |    |
|   | Web Bluetooth · 判定引擎 |<->|  better-sqlite3      |    |
|   +--------------------------+   +----------------------+    |
+--------------------------------------------------------------+
```

> **架構決策 D1(2026-07-03,詳見 [ROADMAP](ROADMAP.md))**:達標/超限**判定完全在 App 端
> TriggerEngine**;韌體職責收斂為「感測 + 濾波 + 傳輸 + 執行 CMD」,無本機判定、無 NVS 持久化。

### 3.1 邊緣運算韌體 (Edge Firmware - ESP32,v3)
韌體於 2026-07-04 依決策 D1 重寫為模組化結構(協定與 v2 完全相容):

| 檔案 | 職責 |
|---|---|
| `config.h` | 腳位 / I2C 位址 / BLE UUID / 濾波與時序參數(單一組態來源) |
| `imu.h` | `Mpu6050` 驅動(量程設定、burst 讀取、零點校準)+ `ComplementaryFilter` |
| `IRMS_Sensor.ino` | BLE 服務、三個 FreeRTOS 任務與 CMD 解析 |

任務分配:
1. **Task_Sensor(Core 1,優先權 3)**:
   - 50Hz 讀取雙 MPU6050,互補濾波(α=0.85)融合 Pitch/Roll,開機自動校準陀螺儀零點。
   - `dt` 以 0.2s 夾限,任何停頓(I2C 復原、排程延遲)都不會產生積分尖峰。
   - 連續 5 次讀取失敗 → `STATE_ERROR` + 自動重啟 I2C、重新初始化並以靜態角重設濾波。
2. **Task_Comm(Core 0,優先權 1)**:
   - 每 40ms(**25Hz**)以 `snprintf` 組包推播 `T,S,K,TR,SR,KR`;錯誤狀態改送 `ERR:1`。
   - 斷線後延遲 500ms 重新廣播。
3. **Task_LED(Core 1,優先權 1)**:
   - 狀態指示:廣播慢閃 / 連線恆亮 / 錯誤 10Hz 快閃。
   - 達標雙響改由**旗標驅動**(`goalBeepRequest`),不再借用系統狀態機;雙響結束後蜂鳴器
     恢復為警報旗標(`alarmActive`)對應狀態,避免蓋掉進行中的超限長鳴。

**安全機制**:BLE 斷線瞬間強制關閉 GPIO25/GPIO26(App 已無法下指令時,蜂鳴器不得卡在長鳴)。

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
    * **格式 (6 軸)**：I2C 正常時以 **25Hz** 頻率通知發送 `T:大腿Pitch,S:小腿Pitch,K:膝夾角,TR:大腿Roll,SR:小腿Roll,KR:膝Roll差` (例如 `T:12.5,S:-45.2,K:57.7,TR:1.2,SR:-0.8,KR:2.0`);其中 `K`、`KR` 為衍生值,前端會由 Pitch/Roll 自行重算。若 I2C 離線則發送 `ERR:1`。
    * **原始串流 (`G:`,韌體 1.0.1-beta.2 起,opt-in)**:App 送出 `CMD:RAW_ON` 後,韌體額外推播 `G:tgx/tgy/tgz/sgx/sgy/sgz/tax/tay/taz/sax/say/saz`——前 6 欄為大腿/小腿陀螺儀(deg/s,已扣偏差,含 gz),後 6 欄為原始加速度(g,±4g、8192 LSB/g)。`CMD:RAW_OFF`、斷線與 OTA 傳輸中皆停止;最長約 85 bytes。舊版 App 從不開啟,不受影響。
    * **MTU**：韌體顯式設定 `setMTU(128)`,確保 6 軸封包(6 軸最長約 54 bytes;含 `V:` 擴充欄位最長 114 bytes,需 MTU ≥ 117)不被截斷。
  * **指令接收 (Profile RX Characteristic)**：
    * **UUID**：`4fafc201-1fb5-459e-8fcc-c5c9c331914b` -> `beb5483f-36e1-4688-b7f5-ea07361b26a8`
    * **指令格式 (`CMD:`)**:
      `CMD:LED_ON/OFF`(達標回饋燈)、`CMD:GOAL`(達標雙短響)、`CMD:ALARM_ON/OFF`(超限長鳴)、`CMD:RAW_ON/OFF`(開關下述 `G:` 原始串流,預設關閉)。
      韌體以 `trim()` 剝除尾端空白後**精確比對**;指令字串不可附加換行。
    * **依 D1 不再解析**:Profile 參數(`目標,容錯,維持ms`)與 `CMD:SYNC` 校準同步——判定與校準
      皆在 App 端完成,韌體收到後直接忽略(無 NVS 持久化)。

### 4.2 應用端 (Electron App) 整合細節
* **藍牙自動配對與連接**：
  * (Electron v2 歷史作法,已退場)Electron 主進程監聽 `select-bluetooth-device` 事件自動配對。現役 Tauri 版由 Rust `src-tauri/src/ble.rs`(btleplug)掃描,以名稱前綴 `IRMS`(`DEVICE_NAME_PREFIX`)比對並自動連線。
  * 前端網頁 (`app.js`) 透過 Web Bluetooth 連接至該設備，並對 `Angle TX` 特徵值進行監聽。若連線意外中斷，會自動重設 UI 狀態，並在日誌記錄錯誤，待使用者再次點擊時進行重新連接。
* **雙向參數控制面板**：
  * 在主界面設計了「設定面版 (Profile Settings)」，允許使用者調整目標角度、容錯與維持時間，並點擊「Sync to ESP32」將設定下發。
  * 同步成功後，前端儀表板的對應指示數值（如 Target、Tol）會即時更新。
* **資料持久化與匯出**：
  * **SQLite 本地資料庫(三張表,存於 Electron `userData` 目錄)**:完整欄位定義見
    [AI_CODING_RULES.md §4.3](AI_CODING_RULES.md#43-sqlite-schema目前-user_version--9)。
    * `custom_actions` 資料表:自訂復健動作範本(名稱、協定、目標角度、容錯、維持時間、`triggerType` 判定型別)。
    * `sessions` 資料表:每次復健歷程(開始/結束時間、目標角度、容錯、維持時間、`actionId`/`actionName` 動作快照、`protocol`、`repsCompleted` 達標次數)。
    * `sensor_data` 資料表:以 `sessionId` 外鍵(`ON DELETE CASCADE`)連動,記錄高頻 6 軸角度(`kneeAngle`、`thighAngle`、`shinAngle`、`kneeRoll`、`thighRoll`、`shinRoll`)與時間戳記。
  * **CSV 數據匯出**：提供一鍵導出按鈕,將歷史復健 Session 及其 6 軸感測角度數據整合成 CSV 格式下載,便於物理治療師進行量化評估與學術分析。
* **進階異常提示**：
  * 應用端主畫面上設有隱藏的 `error-overlay` 紅色警示遮罩。
  * 當從藍牙接收到 `ERR:1` 訊號時，應用端會立刻凍結即時角度顯示（呈現為 `ERR` 字樣），並彈出「🚨 硬體異常：感測器 I2C 連線脫落，系統嘗試重新連線中...」之醒目警報。若 ESP32 自動復位成功並恢復發送正常角度，警示遮罩會自動消失，確保使用者能即時得知硬體接線狀態。

---

## 5. 開發建置指引 (Development & Build Guide)

### 5.1 邊緣端 (ESP32) 燒錄與部署
1. 韌體已移至 [IRMS-Firmware](https://github.com/yuhina0515/IRMS-Firmware) 儲存庫;使用 Arduino IDE 或 VS Code (PlatformIO) 開啟其中的 `IRMS_Sensor/IRMS_Sensor.ino`。
2. 在開發板管理員中，確認已安裝並選擇 **ESP32 Arduino Core v3.0.x**。
3. 選擇對應的開發板型號（如 ESP32 Dev Module），確認 I2C 接腳與周邊配置無誤。
4. 編譯並燒錄韌體至 ESP32 晶片中。

### 5.2 應用端(現役,Tauri App)安裝與執行

完整內容見 [`IRMS_App_Tauri/README.md`](../IRMS_App_Tauri/README.md)(開發環境需求、架構邊界、
CI 涵蓋範圍)。摘要:

```powershell
cd IRMS_App_Tauri
npm ci
npm run tauri dev    # 開發模式
npm run ci           # TypeScript + Vitest + build + rustfmt + Rust tests + Clippy
```

技術棧:Tauri 2 (Rust) · React 18 · TypeScript 5 · Vite · rusqlite(bundled) · btleplug 0.11。

### 5.3 應用端(v2 世代,Electron App)安裝與執行——保留供尚未除役前參考
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


## Runtime module contract (2026-09-27)

Module listings manage modules only; operation UI belongs to module-owned pages hosted on the 工具 (Tools) tab.
See [MODULE_CONTRACT.md](MODULE_CONTRACT.md) for page registration, immediate reactivation,
cancellation/disposal, compatibility and release integration requirements.
