---
tags: [coding-log]
date: 2026-08-01
summary: "實作 2026-08-01 會議裁決的第一與第三順位:rest 不變式(殺掉出貨預設的幻影 reps)、wrap-safe 角度數學、警報三修+靜音按鈕、判定參數鉗制、user_version migration runner、孤兒 session 收尾、ErrorBoundary、History 改畫實際判定的指標 + LTTB 抽樣、Record Pose 回補;74 → 121 tests,npm run ci 全綠"
---

# 2026-08-01 變更日誌 — 全面檢視裁決的實作

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260801_meeting_app_review|前置:會議裁決]] ·
> [[log_20260801_project_status_analysis|前置:現況解析]] · [[ROADMAP|架構與代碼計畫]]

## 🎯 請求

「開始制定計畫並完成專案」——依 [[log_20260801_meeting_app_review]] 的裁決順序推進實作。

## 🔧 已完成

### 第一順位|判定正確性批次(commit `30f1924`)

1. **rest 不變式**(`movementMetric.ts`):新增 `REST_MARGIN = 5` 與
   `restThreshold(min) = min(REST_TOLERANCE, min - REST_MARGIN)`。出貨預設
   `Backward Extension`(target 20、segment_extension)原本 `zone.min = 20 ≤ rest = 30`,
   目標區整個落在休息區內,狀態機在原地閉合成迴圈。現在 `rest < min` 是結構性保證。
2. **wrap-safe 角度數學**(新檔 `services/angleMath.ts`):`normalizeDeg` /
   `shortestArcDelta` / `circularMeanDeg` / `circularStdDevDeg` / `jointAngleDeg`。
   接進校準統計、EMA、`applyCalibration`,以及精靈裡每一處 delta 與正負號判定。
3. **警報三修**(`sessionController.ts`):新增 `applyAlarmOutput()` 逐封包重算輸出
   (引擎超限 ∧ session 進行中 ∧ 未靜音)、`silenceAlarm()` + Dashboard 靜音按鈕。
4. **`resetFeedbackState()`**:取代四條各自不完整的重置路徑。
5. **判定參數鉗制**(新檔 `shared/validation.ts`):鉗制點放在 `currentConfig()`——
   所有參數進入引擎的唯一咽喉點——外加動作儲存、Session 開始、輸入框 `min`/`max` + blur。
6. **`ErrorOverlay` 逃生出口**:加上「結束並儲存 Session」「中斷連線」。

### 第三順位|migration + 崩潰隔離(commit `b04776c`)

7. **migration runner**(新檔 `main/migrations.ts`):`PRAGMA user_version` + 有序清單,
   每版包在自己的交易內。migration 1 = v1.0.1 形狀且完全冪等;2 = `custom_actions`
   重建加 CHECK 並在搬移過程鉗制既有壞列;3 = `sessions.abandoned`。
8. **孤兒 session 收尾**:新增 `session:progress` IPC,每完成一下就持久化 reps;
   啟動時把 `endTime IS NULL` 的列以最後一筆感測時間補齊並標記 `abandoned`,
   History 顯示「未正常結束」標籤。
9. **`ErrorBoundary`**(新檔):包住各 view,fallback 提供「結束並儲存 Session」。
10. **`db.close()`** 於 `will-quit`。

### 連帶決議與意見清單(commit `222fcf0`、`Record Pose`)

11. **刪除 Dashboard 的「內外翻方向未驗證」警示**;Settings 該行語意由警告改為
    「僅影響顯示,不影響判定」。精靈第 5 步標為選配、「略過」升為主要按鈕。
12. **History 改畫實際判定的指標**:新增 migration 4(`sessions.triggerType` 快照),
    依型別畫 thigh/knee,疊上目標帶與超限門檻參考線。
13. **LTTB 抽樣**(新檔 `shared/downsample.ts`):主進程抽樣至 1200 點。
14. **CSV 匯出**改為另取全量 + 前置 session metadata。
15. **Record Pose 回補**:動作編輯器顯示即時指標並可一鍵擷取為目標角度。

## 🧠 關鍵決策

- **wrap 修復排在燒錄之前**:會議中出貨務實派主張「先燒錄」,但臨床派的反駁被採納——
  wrap 缺陷是**掛載方向相依**的,燒一次只能取樣一種掛載方向;而 App 第 1 步明文承諾
  「方向與角度不必在意」。一個宣稱掛載無關的 App,不可能用單一掛載方向驗證 wrap 行為。
  真正的修法完全不需要硬體,且今天就能用合成序列在 Vitest 證明。
- **`rest` 由 `min` 導出而非改大常數**:改常數只會把問題推到另一個目標角度區間;
  導出才讓不變式成為結構性保證,對使用者自建動作同樣成立。
- **鉗制點放在 `currentConfig()` 而非只在 UI**:那是參數進入引擎的唯一咽喉點,
  不論值來自手打、動作載入或舊 persist 還原,引擎都拿不到會讓 zone 退化的值。
- **輸入鉗制在 blur 而非每次按鍵**:每鍵鉗制會把「輸入 100 的第一個 1」跳改成 10。
- **LTTB 而非均勻抽樣**:復健資料的臨床意義集中在峰值(這一下抬到幾度、有沒有超過
  安全上限),均勻抽樣會直接錯過落在取樣點之間的峰。已加對照組測試證明這個差異。
- **`abandoned` 旗標而非直接顯示 0**:一個看起來像事實的錯誤數字,比一個明確標示
  不確定的數字更有害。
- **刪除警示而非讓它更準確**:roll 不進判定路徑,在判定不讀方向的畫面上宣稱
  「方向未驗證」是假的負面訊號。移除比修正便宜,而且移除本身就是準確的。

## ✅ 驗證

- [x] `npm run ci` 全綠:typecheck(node + web)+ **121 tests**(原 74)+ build 成功
- [x] **反向驗證**:把 `restThreshold` 暫時改回舊的固定 `REST_TOLERANCE`,幻影 reps
      迴歸測試確實失敗——靜止的腿被計了 **3 下與 5 下**,與會議預測一致。改回後全綠。
      (未做這一步的話,那三個測試等於沒測到東西。)
- [x] **LTTB 測試抓到我自己寫的真 bug**:桶索引偏移一格,最後一個桶會選到尾點而與
      固定保留的尾點重複,「輸出維持 x 遞增」測試失敗。改回標準桶邊界後通過。
- [x] migration 以 `node:sqlite` 對**真實 SQLite 引擎**測試(better-sqlite3 是為
      Electron ABI 編譯的,vitest 純 Node 環境載不進來;`migrations.ts` 因此刻意只用
      exec/prepare 這組兩邊共通的 API)。10 個測試涵蓋全新安裝、v1.0.1 升級路徑且資料
      完整保留、既有壞列被鉗制而非讓重建失敗、CHECK 生效、失敗回滾、孤兒收尾。
- [x] **自我審查抓到我引入的回歸**:改用抽樣資料畫圖後,CSV 匯出仍讀 `readings`,
      等於匯出被抽掉的資料集。已改為另外取全量。
- [ ] **📡 未做實機驗證**。所有變更都是桌面可證的邏輯層修正,但沒有任何一項在真實
      感測器上跑過。韌體 v3 仍未燒錄。
- [x] **實際啟動 App(`npm run dev`)驗證 migration 在正式 driver 上運作**——這是單元測試
      無法涵蓋的部分:測試用 `node:sqlite`,正式跑的是 better-sqlite3。先備份使用者的真實
      資料庫(`%APPDATA%/irms-app/irms.sqlite`,備份於本次 session 的 scratchpad),
      啟動前狀態為 `user_version = 0`、5 個動作、表已存在——**正是 v1.0.1 升級路徑本身**。
      主進程輸出:

      ```
      [db] migration 1 applied: base schema (v1.0.1 shape)
      [db] migration 2 applied: custom_actions: clamp existing rows and add CHECK constraints
      [db] migration 3 applied: sessions: abandoned flag for sessions never properly ended
      [db] migration 4 applied: sessions: triggerType snapshot for history analysis
      ```

      升級後查驗:`user_version = 4`、5 個動作連同原 id(11–15)與數值完整保留、
      `sessions` 已含 `abandoned` 與 `triggerType` 欄位、`custom_actions` 的 CHECK 約束存在。
- [x] renderer 無錯誤:dev log 中 4 筆 `ERROR:CONSOLE` 全部來自 `devtools://`
      (DevTools 自身的 Autofill / VE context 雜訊),App 自身 origin 零錯誤,
      無 React 例外或未捕捉錯誤。
- [ ] **未目視確認畫面**:要求螢幕存取時被拒絕,因此沒有截圖。
      「renderer 沒拋錯」不等於「畫面長得對」——Dashboard 靜音按鈕、ErrorOverlay 的
      逃生按鈕、ErrorBoundary fallback、Record Pose 面板的**視覺呈現與版面皆未經人眼確認**,
      需使用者自行開 App 驗收。

## 📝 後續待辦

1. **📡 桌面燒錄 + ±180° 旋轉 serial 記錄** —— 目前唯一的硬體阻塞項,且門檻比原本以為的低:
   不需受試者、不需焊接。一個晚上可定案 MTU 協商、FILTER_ALPHA 是否振鈴、以及各姿勢的
   真實 stdDev(`CAPTURE_STD_LIMIT_ABDUCTION = 4` 至今仍是無依據的猜測)。
2. **migration #5:每場 session 的校準快照 + 原始角度欄位** —— `sensor_data` 目前只存
   校準後 + EMA 後的值,當時的校準設定存在 localStorage 而非 session 列上。錄過 N 場後
   若發現某軸 invert 設反,先前所有場次將永久無法解讀。schema 形狀需先看過真實資料。
3. 未處理的意見清單項目:精靈免手觸發與單步重捕(#16/#17)、elbow/shoulder 協定看起來
   可用但實際讀腿部感測器(#18)、獨立的 `safetyLimit` 欄位(#19)、無障礙(#33:
   modal 無 Esc/focus trap、狀態僅以顏色區分)、Electron 33 升級(#21)。
4. ESLint/Prettier:會議明確延後,維持延後。
