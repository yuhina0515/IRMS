---
tags: [irms, architecture, moc]
date: 2026-11-12
summary: "IRMS 整體架構：系統脈絡、韌體任務、App 分層、即時資料流、資料模型、發布管線，以及 2026-11-12 架構檢視的發現與優化路線。圖用 Mermaid，GitHub 與 Obsidian 都能直接顯示。"
---

# IRMS 系統架構

> 以 2026-11-12 的程式碼為準（App `1.2.0-beta.26` 候選、韌體 `1.0.1-beta.2`、資料庫 `user_version = 10`）。
> 依專案決策 D2「程式碼優先於文件」：兩者不一致時修文件。
> 視覺化的總覽另見 [[IRMS_架構圖.canvas|Obsidian Canvas]]。
> 每張圖都另存 PNG 在 `doc/architecture/img/`（報告、投影片、學習歷程可直接使用）；修改圖後用 Mermaid 重新輸出。

## 1. 系統脈絡

誰在用、資料從哪裡來、往哪裡去。

```mermaid
flowchart LR
  user([使用者／復健者])
  therapist([醫生／治療師])
  tester([隊友測試者])

  subgraph wear[穿戴裝置]
    imu1[MPU6050 大腿 0x68]
    imu2[MPU6050 小腿 0x69]
    esp[ESP32 韌體<br/>FreeRTOS]
    imu1 -- I2C --> esp
    imu2 -- I2C --> esp
  end

  subgraph app[IRMS App（Tauri 2）]
    ui[React 前端]
    native[Rust 原生層]
    db[(SQLite)]
    ui <-- IPC --> native
    native --- db
  end

  gh[(GitHub Releases<br/>App 更新・韌體 manifest)]
  mods[(IRMS-Modules<br/>簽章執行期模組)]
  tele[(遙測收集端<br/>hina-server，選擇加入)]

  user -- 配戴、操作 --> app
  esp <-- BLE 通知／指令 --> native
  app -- CSV 匯出 --> therapist
  native -- 簽章驗證後下載 --> gh
  native -- 簽章驗證後下載 --> mods
  native -- 實機紀錄上傳 --> tele
  tester -. 遠端查看 .-> tele
```

- **判定全部在 App 端**（決策 D1）：韌體只負責量測與傳輸，不做任何計次或警示判斷。
- **平台**：Windows 桌面與 Android（同一份程式碼）；iOS 暫停。
- 裝置自 2026-09-27 起沒有實體蜂鳴器／LED，App 仍會送 `CMD:` 指令（相容），但**警示靠畫面與語音**。

## 2. 韌體（IRMS_Sensor）

```mermaid
flowchart TB
  subgraph core1[Core 1]
    ts[Task_Sensor 優先權 3<br/>50 Hz 讀兩顆 IMU<br/>互補濾波・I2C 失敗自動復原]
    tl[Task_LED 優先權 1<br/>狀態燈：廣播／連線／錯誤]
  end
  subgraph core0[Core 0]
    tc[Task_Comm 優先權 1<br/>25 Hz 推播角度封包<br/>斷線後重新廣播]
    rx[Profile RX onWrite<br/>解析 CMD: 指令]
    ota[OTA service<br/>START／資料塊／END／ABORT]
  end
  shared[(latestAngles<br/>mutex 保護)]
  ts -- 寫入 --> shared
  shared -- 讀取 --> tc
  tc -- "Notify：T/S/K/TR/SR/KR + V:加速度<br/>（選擇加入 G: 原始資料）或 ERR:1" --> ble((BLE))
  ble -- "CMD:GOAL／ALARM_ON／RAW_ON …" --> rx
  ble -- 韌體分塊 --> ota
```

| 項目 | 值 |
|---|---|
| 取樣／推播 | 50 Hz 取樣，25 Hz 推播（每 40 ms） |
| BLE MTU | 要求 128；OTA 在 MTU 不足時直接拒絕（`MTU_TOO_SMALL`） |
| 封包最長 | 角度封包約 105 bytes、`G:` 原始封包上限 112 bytes，都在 125 bytes 承載內 |
| 韌體更新 | BLE OTA，雙分割區（失敗仍跑舊韌體，不會變磚） |

## 3. App 分層

```mermaid
flowchart TB
  subgraph fe[前端 React + TypeScript]
    views[views/ 頁面<br/>Dashboard・History・Actions・Tools・Settings]
    comps[components/ 元件<br/>校準流程・3D 姿態・圖表・SessionDock]
    hooks[hooks/]
    svc[services/ 領域邏輯<br/>bluetooth・sessionController・triggerEngine<br/>calibrationCore・slipMonitor・voice・telemetry]
    store[store/ Zustand<br/>useStore 設定與即時狀態・useUiStore]
    i18n[i18n/ 繁中・英文]
    platform[platform/irmsApi<br/>唯一的 IPC 入口]
    shared[shared/ 協定・型別・驗證<br/>與 Rust 共用的契約]
  end
  subgraph rs[Rust 原生層 src-tauri]
    cmds[commands.rs 等<br/>44 個 tauri::command]
    ble[ble.rs・ble_lifecycle.rs<br/>btleplug 連線與重連]
    proto[protocol.rs<br/>真實封包解析]
    dbrs[db.rs・migrations.rs]
    fw[firmware*.rs<br/>韌體 manifest 與 OTA]
    upd[update.rs<br/>App 自動更新]
    mod[modules.rs<br/>執行期模組]
    tel[telemetry.rs]
    live[live_share.rs]
  end
  sqlite[(SQLite<br/>user_version 10)]

  views --> comps
  views --> hooks
  views --> svc
  comps --> svc
  comps --> store
  svc --> store
  svc --> platform
  svc --> shared
  views --> store
  i18n --> store
  platform -- "invoke / listen" --> cmds
  cmds --> dbrs --> sqlite
  cmds --> ble
  ble --> proto
  ble -- "事件 ble:packet／ble:raw／ble:connection" --> platform
  cmds --> fw
  cmds --> upd
  cmds --> mod
  cmds --> tel
  cmds --> live
```

依賴規則（2026-11-12 以靜態分析確認）：

- 前端 85 個模組，**沒有執行期循環依賴**。
- `platform/irmsApi.ts` 是前端呼叫原生層的唯一入口；元件不直接 `invoke`。
- `shared/` 是與 Rust、韌體共用的契約，不依賴任何上層。
- 頁面只能被 `App.tsx` 載入（延遲載入），其他層不得 import `views/`。

## 4. 即時資料流（一個封包的一生）

```mermaid
sequenceDiagram
  autonumber
  participant IMU as 兩顆 IMU
  participant FW as ESP32 韌體
  participant BLE as ble.rs
  participant P as protocol.rs
  participant BT as bluetooth.ts
  participant SC as sessionController
  participant TE as triggerEngine
  participant ST as useStore
  participant DB as SQLite

  IMU->>FW: 加速度＋角速度（50 Hz）
  FW->>FW: 互補濾波 → 傾角
  FW->>BLE: Notify 角度封包（25 Hz）
  BLE->>P: parse_angle_packet
  P-->>BLE: ParsedPacket（angles／error／malformed）
  BLE->>BT: 事件 ble:packet
  BT->>BT: applyCalibration → 平滑 → 膝角
  BT->>SC: onAnglesReceived(angles)
  SC->>TE: 更新判定（目標區間・維持時間・極限角・過度伸直）
  TE-->>SC: 進區／完成一下／超限 等事件
  SC->>ST: patchSession（節流）→ 畫面更新
  SC->>SC: 語音提示（安全警示優先）・穿戴位移監測
  SC->>DB: 每完成一下立即寫次數；角度資料分批 appendBatch
```

- 真實裝置的封包在 **Rust 端解析**；TS 的 `parseAnglePacket` 用在模擬器與示範模式，`G:` 原始封包只在 TS 解析。
- 兩個解析器共用 `fixtures/angle-packets.json`、`fixtures/vector-packets.json` 測試案例；事件的 JSON 欄位名稱另由 Rust 的 wire-shape 測試鎖住（見第 7 節）。
- 示範與模擬資料走同一個入口（單一注入接縫），但在資料庫層標記 `source`，無法冒充真實紀錄。

## 5. 資料模型

```mermaid
erDiagram
  custom_actions ||--o{ sessions : "actionId（軟參照，另存 actionName 快照）"
  sessions ||--o{ sensor_data : "sessionId 外鍵"
  calibration_profiles ||--o{ mobility_records : "calibrationId（軟參照）"

  custom_actions {
    int id PK
    text name
    text protocol
    real targetAngle
    real tolerance
    int holdTimeMs
    text triggerType
    real safetyLimit
  }
  sessions {
    int id PK
    text startTime
    text endTime
    int actionId
    text actionName
    real targetAngle
    real tolerance
    int holdTimeMs
    int repsCompleted
    int abandoned
    text triggerType
    real safetyLimit "快照"
    text calibration "當時生效的校準快照"
    text source "device 或 demo"
    real comfortAngle "快照"
    real limitAngle "快照"
  }
  sensor_data {
    int id PK
    int sessionId FK
    int timestamp
    real kneeAngle
    real thighAngle
    real shinAngle
    real kneeRoll
    real thighRoll
    real shinRoll
  }
  angle_range_records {
    int id PK
    text measuredAt
    text metric
    real comfortAngle
    real limitAngle
  }
  mobility_records {
    int id PK
    text measuredAt
    text movementSet
    real totalDeg
    text calibrationId
    text side
  }
  calibration_profiles {
    text id PK
    text createdAt
    text side
    text profile
    int active
  }
```

- **快照優先於參照**：`sessions` 把開始當下的動作參數、校準、舒適角與極限角都複製一份，所以日後改設定或刪動作，舊紀錄仍能原樣重現。
- `angle_range_records` 是獨立的量測歷史；療程只保存當時的值，不連結這張表。
- 欄位取自 `src-tauri/src/migrations.rs`（10 個版本依序套用，每一版各自在交易內完成，失敗只回滾該版）；型別為示意。

## 6. 發布與更新管線

```mermaid
flowchart LR
  dev[開發者 commit] --> ci[GitHub Actions CI<br/>tsc・vitest・build<br/>cargo fmt／test／clippy]
  ci --> rel[手動簽章建置<br/>tauri build + 更新簽章金鑰]
  rel --> ghr[(GitHub Release<br/>預發布 + latest.json)]
  ghr -- beta／stable 頻道 --> appupd[App 自動更新]
  fwci[韌體 CI<br/>arduino-cli 編譯] --> fwrel[(韌體簽章 manifest)]
  fwrel --> appfw[App 下載並驗簽] -- BLE OTA --> device[裝置]
  modrepo[(IRMS-Modules)] -- 簽章模組 --> appmod[App 執行期載入]
```

- 尚未實機驗證的版本一律走 `-beta.N` 預發布，附免責聲明；stable 頻道要等實機證據。
- 韌體、模組與 App 各自獨立發布與驗簽。

## 7. 2026-11-12 架構檢視

方法：讀程式碼、以腳本分析前端相依圖（循環、分層方向、扇入）、檢查 Rust 與前端的 IPC 欄位、看建置產物。

### 已修正

| # | 問題 | 證據 | 修正 |
|---|---|---|---|
| F1 | **`ble:packet` 事件的欄位名稱與前端型別不符**：Rust 送出 `has_roll`，前端讀 `hasRoll`，真實裝置路徑上永遠是 `undefined` | 序列化實測輸出 `{"kind":"angles",…,"has_roll":true,…}`；`#[serde(rename_all)]` 在 enum 上只改變體名稱，不改欄位 | `protocol.rs` 加 `rename_all_fields = "camelCase"`；新增 wire-shape 測試，拿掉修正時測試會失敗（已驗證）。目前沒有正式程式讀 `hasRoll`，屬潛伏缺陷，尚未造成可見錯誤 |
| F2 | 元件 `TopNav` 直接 import 頁面 `views/ToolsView`，讓本應延遲載入的頁面被拉進首屏 bundle | 建置產物沒有 ToolsView 獨立 chunk | `useToolModules` 移到 `hooks/`；ToolsView 成為獨立 chunk，首屏 `main` 252.6 → 242.7 KB |
| F3 | 架構文件過時：Canvas 寫 `user_version = 8`、校準 A／B、10 Hz 推播與實體蜂鳴器 | 對照 `migrations.rs`、`IRMS_Sensor.ino` | 更新 Canvas，新增本文件 |

### 提案（不在 12/03 凍結前做）

依「修缺陷，不擴大議程」，以下只記錄、不動手；建議在統一校準通過實機驗證、`v1.2.0` 發布後評估。

| # | 觀察 | 風險 | 建議 |
|---|---|---|---|
| P1 | `store/useStore.ts` 930 行，設定、即時狀態、校準與裝置狀態同一個 store；13 個 service 直接讀寫它 | 任何欄位改動牽動面大；測試需重設整個 store | 依領域切成 settings／session／device slice，service 改用注入的讀寫介面 |
| P2 | `sessionController.ts` 611 行，同時負責判定接線、警示、語音、位移監測、持久化與關窗保護 | 職責多、修一處易影響他處 | 拆出 AlarmPolicy、SessionPersistence 等小單元，controller 只做協調 |
| P3 | 藍牙服務用單一 callback 欄位（`onAnglesReceived`）接上 controller | 目前只有一個指派者，安全；但第二個指派者會靜默覆蓋前一個 | 改成可多訂閱的事件介面 |
| P4 | 舊校準精靈 A、B 與活動度 C（約 1,700 行 UI＋演算法）仍保留在「舊版」開關後 | 維護成本；與統一校準並存易混淆 | 統一校準通過量角器對照後移除，計畫風險表本來就把它當備援 |
| P5 | 角度封包有 Rust 與 TS 兩份解析器 | 共用 fixture 與 wire-shape 測試已降低漂移風險 | 維持現狀；若未來 Android／桌面都只走 Rust 路徑，可讓模擬器改經 Rust 解析，刪掉 TS 版 |
| P6 | `store` 反向依賴 `services/angleMath`、`i18n` 讀 `store` | 分層方向不純，但無循環 | 隨 P1 一起整理 |

## 8. 名詞

| 名詞 | 說明 |
|---|---|
| 互補濾波 | 以陀螺儀積分為主、加速度計的重力方向為校正，得到穩定的傾角 |
| 統一校準 | 2026-10-15 起取代 A／B／C 三套方案的單一校準流程 |
| 單一注入接縫 | 真實、模擬、示範資料都從同一個入口進入判定流程 |
| wire-shape 測試 | 檢查 Rust 序列化後的 JSON 欄位，與前端 TypeScript 型別逐字一致 |
