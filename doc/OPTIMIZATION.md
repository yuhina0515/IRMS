# IRMS_App 功能清單與優化待辦 (v2)

> 更新日期:2026-06-27 · 對應 v2 架構 (Electron + React + TS + IPC + better-sqlite3)
> 本文件為「活清單」,完成項目請打勾並標註日期。

---

## 一、現有功能盤點 (Feature Inventory)

### 1. 連線與 BLE 通訊
- [x] Web Bluetooth 自動配對(過濾名稱含 `IRMS` 的裝置,主進程 `select-bluetooth-device`)
- [x] GATT 連線、訂閱 Angle TX 通知 (10Hz)
- [x] 手動 Connect / Disconnect 切換
- [x] 斷線自動重連(最多 5 次,間隔 3 秒)
- [x] 下發控制指令:`LED_ON/OFF`、`GOAL`、`ALARM_ON/OFF`、`SYNC,offset`
- [x] 封包解析:`T/S/K(/TR/SR/KR)`、`ERR:` 錯誤碼、malformed 丟棄

### 2. 即時監測 (Dashboard)
- [x] 即時角度卡片:大腿 / 小腿 / 膝夾角 / 內外翻 (Varus/Valgus)
- [x] 即時折線圖 (Chart.js,knee/thigh/shin,maxPoints 可設)
- [x] SVG 骨架視覺化 + 目標容錯弧(達標時變綠)
- [x] 達標進度環(百分比 + reps)
- [x] 硬體錯誤紅色遮罩(ERR 時凍結畫面、暫停寫入)

### 3. 復健 Session
- [x] 開始 / 結束 Session(寫入 DB)
- [x] 達標狀態機:進入區間 → 維持計時 → 達標 → 回休息位
- [x] **超限安全警報**(超過 `target+tol+10°` 觸發長鳴)
- [x] reps 計數 + Session 計時器
- [x] 高頻資料批次緩衝寫入(可設 flush 間隔,失敗回補上限 2000 筆)
- [x] 達標 / 進出區間時同步硬體 LED / 蜂鳴器(含指令去重)

### 4. 自訂動作 (Actions)
- [x] 動作 CRUD(建立 / 編輯 / 刪除)
- [x] 依協定過濾(knee / elbow / shoulder)
- [x] 三種判定規則:joint_angle / segment_elevation / segment_extension
- [x] 還原預設範本(清空後重建,避免重複)

### 5. 歷史紀錄 (History)
- [x] Session 列表(時間、動作名稱快照、reps)
- [x] 單次分析圖表(knee + Varus/Valgus 曲線)
- [x] CSV 匯出(6 軸角度,Blob 下載)
- [x] 刪除紀錄(FK CASCADE 連動清除 sensor_data)

### 6. 設定與校準 (Settings)
- [x] 校準:offset + 反相 × {大腿, 小腿} × {Pitch, Roll}
- [x] 快速歸零(以最新原始值反推 offset)
- [x] 同步校準 offset 至 ESP32
- [x] 一般設定:預設協定、圖表最大點數、寫入間隔
- [x] 設定持久化 (Zustand persist → localStorage)

### 7. 基礎建設
- [x] IPC + contextBridge 型別安全資料層 (`window.irms`)
- [x] better-sqlite3(WAL、外鍵、交易批次寫入)
- [x] Toast / Confirm / 側欄收合 UI 基礎
- [x] 系統日誌面板(環狀 200 行)

---

## 二、優化待辦 (Optimization Backlog)

### 🔴 P0 — 正確性與安全(優先)
- [ ] **實機端對端驗證**:裝置回歸後完整跑 BLE 連線 → 達標 → 超限 → 斷線復原。
- [ ] **下發 Profile 參數至韌體**:目前 Settings 的「同步」只送校準 offset,未透過 Profile RX 下發 `目標角度,容錯,維持時間`。需確認 ESP32 在 `deviceConnected` 時是否仍需 App 下發 profile(原韌體會跳過本機判定)。
- [ ] **ERR 當下主動關閉回饋**:收到 `ERR:` 時除凍結畫面外,主動送 `LED_OFF` + `ALARM_OFF`,避免蜂鳴器卡在作動狀態。
- [ ] **斷線時的 Session 收尾**:Session 進行中若 BLE 永久斷線,確保仍能安全 End 並 flush 已緩衝資料。
- [ ] **復健評分模型 (Phase 3)**:以角速度變異數(平穩度)+ 維持達標率產出單次品質分數,寫入 session 並於 History 顯示。

### 🟡 P1 — 效能
- [ ] LiveChart 高頻更新:啟用 Chart.js decimation 或將 `update` 節流至 ~20fps,降低長時間 Session 的 CPU。
- [ ] History 分析:大型 Session(數萬筆)讀取改分頁 / 抽樣繪圖,避免一次載入。
- [ ] 評估以 `requestAnimationFrame` 聚合多筆封包再繪圖。

### 🟢 P2 — 使用者體驗
- [ ] 側欄收合狀態持久化(目前 `useUiStore` 未 persist)。
- [ ] 圖表可切換顯示 Roll(內外翻)曲線。
- [ ] 動作卡片排序 / 搜尋 / 依 triggerType 分組。
- [ ] 重連進度更明確的視覺提示(目前僅狀態文字)。
- [ ] i18n(繁中 / English 切換),目前介面中英混用。
- [ ] 淺色主題(目前僅深色)。
- [ ] 鍵盤快捷鍵(連線、開始/結束 Session)。

### 🔵 P3 — 程式品質與測試
- [ ] **單元測試**:`triggerEngine.ts`(純狀態機,含超限/休息/達標邊界)、`parseAnglePacket`、`applyCalibration`。導入 Vitest。
- [ ] ESLint + Prettier 設定與 CI typecheck。
- [ ] React ErrorBoundary 包裹各視圖,避免單一錯誤白屏。
- [ ] DB migration 機制(目前為 CREATE IF NOT EXISTS;未來 schema 變更需版本化遷移)。

### ⚪ P4 — 打包與部署
- [ ] electron-builder:應用程式圖示、產品中繼資料、Windows 簽章。
- [ ] 自動更新 (electron-updater)。
- [ ] 跨平台 target(目前僅 Windows NSIS)。

### 🧩 多關節協定泛化 (Phase 3)
- [ ] elbow / shoulder 目前共用以「膝/大腿/小腿」命名的判定邏輯。需:
  - [ ] 泛化命名(近端/遠端肢段,而非 thigh/shin)。
  - [ ] 依關節對應正確的 IMU 軸向與判定方向。
  - [ ] 各協定的預設範本與目標角度臨床校準。

---

## 三、已知技術債(重寫時保留待辦)
- [x] `react-chartjs-2` 已列入依賴但實際使用原生 Chart.js,可移除依賴。(2026-06-27 已移除)
- [ ] 舊版 `irms.sqlite`(v1 schema)未自動遷移至 v2;若需保留歷史資料需寫一次性匯入腳本。
- [ ] 文件中 `AI_CODING_RULES.md` 的檔案路徑仍指向舊位置 `c:/Users/Yuhina/Documents/IRMS`,待更新。
