# IRMS_App 功能清單與優化待辦 (v2)

> **相關文件**:[專案總覽](../README.md) · [系統規格 README](README.md) · [開發進度 PROJECT_STATUS](PROJECT_STATUS.md) · [編碼規範 AI_CODING_RULES](AI_CODING_RULES.md) · [變更日誌 coding log](coding%20log/)

> 更新日期:2026-08-12 · 對應 v2 架構 (Electron + React + TS + IPC + better-sqlite3)
> 本文件為「活清單」,完成項目請打勾並標註日期。
> 被會議否決的項目**保留在清單上並註明否決理由**,不直接刪除——否則同一個提案會在
> 幾個月後被重新提出、重新辯論一次。

---

## 一、現有功能盤點 (Feature Inventory)

### 1. 連線與 BLE 通訊
- [x] Web Bluetooth 自動配對(過濾名稱含 `IRMS` 的裝置,主進程 `select-bluetooth-device`)
- [x] GATT 連線、訂閱 Angle TX 通知 (25Hz)
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
- [x] **超限安全警報**:獨立的 `safetyLimit` 欄位(2026-08-01 與容錯解耦,migration 5;
      NULL 時才沿用舊的 `target+tol+10°` 導出值)、與 session 綁定、UI 可靜音、重連後重新武裝
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
- [x] **校準精靈**:六步引導(UI 標示 1/6–6/6,末步為套用前預覽)自動判斷佩戴方向
      (invert / axisSwap)與歸零(offset),含幅度/靜止驗證;免手擷取 + 可退上一步
      (2026-07-05 建立,2026-08-01 改免手,2026-08-03 修第 5 步誤觸發)
- [x] 手動校準(進階摺疊):offset + 反相 × {大腿, 小腿} × {Pitch, Roll}
- [x] 快速歸零(沿用現有 axisSwap/invert,只重算四個 offset;
      `buildQuickZeroPatch` 純函式,2026-08-07 修好漏套 axisSwap 的缺陷)
- [x] ~~同步校準 offset 至 ESP32~~(依 D1 移除:校準全在 App 端,2026-07-03)
- [x] 一般設定:預設協定、圖表最大點數、寫入間隔
- [x] 設定持久化 (Zustand persist → localStorage,version 1 + migrate)

### 7. 引導式監測(2026-07-05 重構)
- [x] 主指標正規化層(movementMetric):三種 triggerType 收斂單一判定路徑
- [x] 弧形量表(目標帶/超限/回位刻線/膝直徽章)+ 教練提示(再抬 X°/保持/回位)
- [x] 引擎 phase 外露(準備/保持/回位徽章)
- [x] 3D 即時姿態視圖(Three.js,2026-07-04);趨勢圖/3D/2D/詳細數值 tab 化

### 8. 基礎建設
- [x] IPC + contextBridge 型別安全資料層 (`window.irms`)
- [x] better-sqlite3(WAL、外鍵、交易批次寫入)
- [x] `PRAGMA user_version` migration runner(2026-08-01,目前 5 版;見 [ROADMAP](ROADMAP.md) D4)
- [x] 孤兒 session 啟動收尾 + `abandoned` 標記(2026-08-01)
- [x] React ErrorBoundary 包裹各視圖(2026-08-01)
- [x] Toast / Confirm / TopHeader+BottomBar UI 基礎(2026-07-14 側欄改版)
- [x] `escapeStack` 巢狀 modal Esc 分派層(2026-08-03)
- [x] Vitest 測試基建:**雙 project(node / dom)**,目前 **246 tests / 21 files**;
      `npm run ci` = typecheck + test + build(2026-08-27 由單一 node project 改制)
- [x] **無硬體演練基建**(2026-08-27):單一 `ingest(text)` 注入接縫(2026-08-03 會議裁定)、
      純函式模擬來源(封包編碼器逐位元對齊韌體 snprintf,含往返閘門測試)、六個具名情境、
      模擬鏈路 `beginSimulated`/`endSimulated`。**校準精靈自此可在桌前跑完**
      (此前被 `isConnected` 閘門鎖住,2026-08-03 會議記為「永遠看不到」)
- [x] **示範模式(出貨版)**(2026-08-27):migration 7 的 `sessions.source` 帶 CHECK、
      型別層必填、進行中不可切換、四個讀取面標記、一鍵清除示範紀錄

### 已修缺陷(2026-08-27,由新測試抓到)
- [x] **達標 LED 從第一下卡亮到 Session 結束**:`onRepCompleted` 未熄燈,引擎轉入
      `restPending` 後再次進區的 `LED_ON` 被去重吃掉。第 2..N 下患者無任何區間回饋,
      且 store 的 `inZone:false` 與 GPIO 實際狀態分歧
- [x] **`linkTruncated` 永久卡在 true**:`attemptReconnect` 繞過 `connect()` 直呼
      `connectGATT()`,重設從未執行。重設已移進 `connectGATT()`

---

## 二、優化待辦 (Optimization Backlog)

### 🔴 P0 — 正確性與安全(優先)
- [→] 📡 **實機端對端驗證**——**已部分完成**。2026-08-07 燒錄韌體 v3、BLE 連線、
      跑完校準精靈,快速歸零修正經實測確認正常。**仍未驗證**:達標音 → 超限長鳴 →
      斷線收尾這條回饋鏈(issue [#3](https://github.com/yuhina0515/IRMS/issues/3))
      與 ±180° 桌面旋轉記錄(issue [#2](https://github.com/yuhina0515/IRMS/issues/2) 的後半)。
      依專案慣例,需要實機的工作一律走 issue,不佔用桌面 backlog。
      ⚠ **裝置取得零星,下次拿到之前必須先備妥錄製能力**,否則時間窗會被浪費在
      「錄了但事後無法解讀」的 session 上(issue [#4](https://github.com/yuhina0515/IRMS/issues/4))。
- [x] ~~**下發 Profile 參數至韌體**~~:**依 [ROADMAP](ROADMAP.md) 決策 D1 關閉,不需要**——正式採 App-Driven 架構,判定不在韌體(現行韌體亦無 Task_Logic/NVS/Profile 解析)。(2026-07-03)
- [x] **ERR 當下主動關閉回饋**:收到 `ERR:` 時重置判定引擎並強制下發 `LED_OFF` + `ALARM_OFF`。(2026-07-03)
- [x] **斷線時的 Session 收尾**:重連耗盡或手動斷線時自動 End Session 並 flush 緩衝資料。(2026-07-03)
- [ ] ~~**復健評分模型**~~:**2026-08-03 會議否決**——平穩度需要角速度,但 BLE 協定只傳
      融合後的角度、沒有陀螺通道,且封包量化底線 0.1°;用差分角度反推的「平穩度」量到的
      主要是量化雜訊,會產出一個看起來客觀的假分數寫進病歷。要做必須先改協定。
- [x] 🔴 **判定路徑的元件測試**:2026-08-27 建立 vitest 雙 project(node/dom)。舊設定的
      `include: ['src/**/*.test.ts']` **不匹配 `.tsx`**,元件測試會被靜默忽略而非失敗——
      正是 2026-08-07 快速歸零缺陷死掉的那個缺口。現以副檔名分流,該陷阱不可能再出現。
      已落地 `MetricGauge`(鎖住 2026-08-03 目視驗收的兩個迴歸)與 `HistoryView` 示範標記。
- [x] 🔴 **回饋/警報鏈的指令稽核測試**(2026-08-27):`sessionController` 此前 368 行零覆蓋。
      以 `vi.spyOn(bluetoothService, 'send')` 取得有序指令稽核,涵蓋超限→靜音→自動重新武裝、
      未開始 Session 不得鳴響、`ERR:` 強制關閉並繞過去重、達標序列、斷線重連、MTU 截斷。
      當場抓到兩個既有缺陷(見下方「已修缺陷」)。**注意:這證明的是 App 送出正確的字串
      與順序,不證明它們真的驅動 GPIO——issue #3 仍完全開啟。**

### 🟡 P1 — 效能
- [x] LiveChart 高頻更新:25Hz 封包流以 `UI_SYNC_MS = 80` 尾緣節流同步 UI(≈12.5fps,
      重繪減半),判定與 DB 寫入仍全速。(2026-07-11)
- [x] History 分析:大型 Session 於主進程 LTTB 抽樣至 1200 點(保留峰值),不再一次載入全量。(2026-08-01)
- [x] ~~以 `requestAnimationFrame` 聚合多筆封包再繪圖~~:**2026-08-03 會議裁定此項應刪除**
      ——需求已由上面的 `UI_SYNC_MS` 節流滿足,rAF 是同一件事的另一種寫法,留在 backlog
      只會誤導成尚未處理。

### 🟢 P2 — 使用者體驗
- [x] ~~淺色主題(目前僅深色)~~:**已於 2026-07-12 完成**——雙主題跟隨系統(Apple Liquid Glass token 架構)。
- [ ] 圖表可切換顯示 Roll(內外翻)曲線。
- [ ] 動作卡片排序 / 搜尋 / 依 triggerType 分組。
- [ ] 重連進度更明確的視覺提示(目前僅狀態文字)。
- [ ] i18n(繁中 / English 切換),目前介面中英混用。
- [ ] 鍵盤快捷鍵(連線、開始/結束 Session)。

### 🔵 P3 — 程式品質與測試
- [x] **單元測試**:2026-07-03 導入 Vitest(22 tests),此後隨每批修正擴充,
      目前 **144 tests / 14 files**;`npm run ci` = typecheck + test + build。
- [ ] ESLint + Prettier 設定。(2026-08-01 會議明確延後:已知約 35 項待修,
      優先度低於判定正確性;`npm run ci` 現含 typecheck+test+build,不含 lint)
- [x] React ErrorBoundary 包裹各視圖,避免單一錯誤白屏。(2026-08-01)
- [x] DB migration 機制:`PRAGMA user_version` 遞增式 runner,每版單一交易、失敗回滾;
      含 v1.0.1 既有安裝的升級路徑測試。(2026-08-01)

### ⚪ P4 — 打包與部署
- [x] electron-builder:應用程式圖示 (`build/icon.ico`) 與產品中繼資料
      (`appId`/`productName`);已發布 v1.0.0 / v1.0.1 的 NSIS 安裝檔。(2026-07-14)
- [ ] Windows 程式碼簽章(目前所有產出皆未簽章,安裝時會跳 SmartScreen 警告)。
- [ ] 自動更新 (electron-updater)。
- [ ] 跨平台 target(目前僅 Windows NSIS)。

### 🧩 多關節協定泛化 (Phase 5)

> 現況:elbow / shoulder 已在 2026-08-01 **明確擋下**(判定仍讀腿部感測器,擋下後
> 不再讓它們產生假紀錄)。泛化順序依 [ROADMAP](ROADMAP.md) 決策 D3:型別 → migration
> → UI → 判定。

- [ ] elbow / shoulder 目前共用以「膝/大腿/小腿」命名的判定邏輯。需:
  - [ ] 泛化命名(近端/遠端肢段,而非 thigh/shin)。
  - [ ] 依關節對應正確的 IMU 軸向與判定方向。
  - [ ] 各協定的預設範本與目標角度臨床校準。

---

---

## 二之二、專案規則(會議累積,動任何項目前先過這一關)

1. **指出它改變哪一個決定,以及那是誰的決定——引擎的,還是人的。**(2026-08-03 修訂)
   指不出來就是裝飾性的,排到清單最後面。舊版寫作「指出它餵給哪條判定路徑」,但那條
   規則按字面會把「History 畫錯的安全線」判為裝飾性——它不餵給引擎,卻改變督導的判讀。
2. **修缺陷,不擴大議程。**(2026-08-03 立、2026-08-07 沿用)發現缺陷就修該缺陷,
   不順勢啟動架構級重寫。i18n、Electron 升級、多關節泛化、ESLint 35 項都是照此延後。
3. **需要實機/硬體的工作一律開 GitHub issue**,不寫進本文件或 ROADMAP,
   避免硬體滑期時整份 backlog 看起來是空的。

---

## 三、已知技術債(重寫時保留待辦)
- [x] `react-chartjs-2` 已列入依賴但實際使用原生 Chart.js,可移除依賴。(2026-06-27 已移除)
- [ ] 舊版 `irms.sqlite`(v1 schema)未自動遷移至 v2;若需保留歷史資料需寫一次性匯入腳本。
- [x] 文件中 `AI_CODING_RULES.md` 的檔案路徑仍指向舊位置 `c:/Users/Yuhina/Documents/IRMS`。(2026-06-30 已改為倉庫內相對連結;並一併同步全文件至 v2 架構、修正 3 軸/舊 schema 描述、補齊文件交互指引。)
