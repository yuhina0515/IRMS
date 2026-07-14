# IRMS_App 功能清單與優化待辦 (v2)

> **相關文件**:[專案總覽](../README.md) · [系統規格 README](README.md) · [開發進度 PROJECT_STATUS](PROJECT_STATUS.md) · [編碼規範 AI_CODING_RULES](AI_CODING_RULES.md) · [變更日誌 coding log](coding%20log/)

> 更新日期:2026-06-30 · 對應 v2 架構 (Electron + React + TS + IPC + better-sqlite3)
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
- [x] **校準精靈**:五步引導自動判斷佩戴方向(invert)與歸零(offset),含幅度/靜止驗證與套用前預覽(2026-07-05)
- [x] 手動校準(進階摺疊):offset + 反相 × {大腿, 小腿} × {Pitch, Roll}
- [x] 快速歸零(以最新原始值反推 offset)
- [x] ~~同步校準 offset 至 ESP32~~(依 D1 移除:校準全在 App 端,2026-07-03)
- [x] 一般設定:預設協定、圖表最大點數、寫入間隔
- [x] 設定持久化 (Zustand persist → localStorage,version 1 + migrate)

### 8. 引導式監測(2026-07-05 重構)
- [x] 主指標正規化層(movementMetric):三種 triggerType 收斂單一判定路徑
- [x] 弧形量表(目標帶/超限/回位刻線/膝直徽章)+ 教練提示(再抬 X°/保持/回位)
- [x] 引擎 phase 外露(準備/保持/回位徽章)
- [x] 3D 即時姿態視圖(Three.js,2026-07-04);趨勢圖/3D/2D/詳細數值 tab 化

### 7. 基礎建設
- [x] IPC + contextBridge 型別安全資料層 (`window.irms`)
- [x] better-sqlite3(WAL、外鍵、交易批次寫入)
- [x] Toast / Confirm / 側欄收合 UI 基礎
- [x] 系統日誌面板(環狀 200 行)

---

## 二、優化待辦 (Optimization Backlog)

### 🔴 P0 — 正確性與安全(優先)
- [ ] **實機端對端驗證**:裝置回歸後完整跑 BLE 連線 → 達標 → 超限 → 斷線復原。(⚠ 韌體已加 `trim()`,需重燒)
- [x] ~~**下發 Profile 參數至韌體**~~:**依 [ROADMAP](ROADMAP.md) 決策 D1 關閉,不需要**——正式採 App-Driven 架構,判定不在韌體(現行韌體亦無 Task_Logic/NVS/Profile 解析)。(2026-07-03)
- [x] **ERR 當下主動關閉回饋**:收到 `ERR:` 時重置判定引擎並強制下發 `LED_OFF` + `ALARM_OFF`。(2026-07-03)
- [x] **斷線時的 Session 收尾**:重連耗盡或手動斷線時自動 End Session 並 flush 緩衝資料。(2026-07-03)
- [ ] **復健評分模型 (Phase 3)**:以角速度變異數(平穩度)+ 維持達標率產出單次品質分數,寫入 session 並於 History 顯示。(依 ROADMAP 排入 Phase 4,先建 D4 migration)

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
- [x] **單元測試**:`triggerEngine.ts`(純狀態機,含超限/休息/達標邊界)、`parseAnglePacket`、`applyCalibration`、`reconcileSelection`。已導入 Vitest,22 tests;`npm run ci` = typecheck+test+build。(2026-07-03)
- [ ] ESLint + Prettier 設定與 CI typecheck。(`npm run ci` 已含 typecheck+test+build,ESLint 待補)
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
- [x] 文件中 `AI_CODING_RULES.md` 的檔案路徑仍指向舊位置 `c:/Users/Yuhina/Documents/IRMS`。(2026-06-30 已改為倉庫內相對連結;並一併同步全文件至 v2 架構、修正 3 軸/舊 schema 描述、補齊文件交互指引。)
