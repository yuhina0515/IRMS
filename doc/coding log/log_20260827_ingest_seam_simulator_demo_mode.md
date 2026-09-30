---
tags: [coding-log]
summary: "落地 2026-08-03 會議裁定卻一直未動工的單一 ingest(text) 注入管線,並在其上建立無硬體演練基建:兩個 vitest project(node/dom,讓 .tsx 不可能再被靜默略過)、純函式模擬來源(封包編碼器逐位元對齊韌體 snprintf)、以及會出貨的示範模式(migration 7 的 sessions.source 帶 CHECK、型別層必填、四個讀取面標記、一鍵清除)。首次為 CMD: 回饋鏈建立指令稽核測試,當場抓到兩個既有缺陷:達標 LED 從第一下卡亮到 Session 結束(第 2..N 下患者無任何區間回饋,且 store 與 GPIO 狀態分歧),以及 attemptReconnect 繞過 connect() 導致 linkTruncated 永久卡在 true。過程中發現原本的 T5 並未測到它宣稱的東西,補上重連幻影 reps 的測試。173→246 tests,npm run ci 全綠;實機仍未驗證。"
date: 2026-08-27
---

# 2026-08-27 變更日誌 — ingest 注入接縫、模擬器與示範模式

> **相關文件**:[[HOME|導覽首頁]] · [[PROJECT_STATUS|開發進度]] · [[ROADMAP|架構與代碼計畫]] ·
> [[OPTIMIZATION|優化待辦]] ·
> [[log_20260803_meeting_direction_after_visual_pass|2026-08-03 方向裁決會議]] ·
> [[log_20260822_calibration_freeze_and_snapshot|2026-08-22 校準凍結與快照]] ·
> [[log_20260822_firmware_mtu_diagnostics_and_serial_telemetry|2026-08-22 MTU 診斷與序列遙測]]

## 🎯 目的

裝置取得零星、目前不在手邊。使用者的要求是「趁拿到之前把 app 準備好、完善所有功能」,
裁定為兩階段全做,示範模式**進出貨版**,i18n / ESLint / 簽章 / 多關節泛化維持延後。

本次完成 **Stage 1(無硬體演練基建)**。Stage 2(P2 UX backlog)尚未動工。

規劃時掃出的結構性瓶頸:`bluetooth.ts` 把傳輸解碼與協定管線焊在一起,導致
`sessionController`(368 行,含整條回饋/警報鏈)與全部 21 個 `.tsx` 測試覆蓋率為零;
校準精靈被 `isConnected` 閘門鎖住,沒裝置根本進不去;而
**引擎唯一會主動對患者發出指令的那條鏈從未被任何形式驗證**。

2026-08-03 會議早已裁定解法是單一 `ingest(text)` 注入管線,但至今 `⏳ 未動工`
(全 repo grep `ingest` 零命中)。

## 🔨 變更

### 1. 測試基建:兩個 vitest project

原本是 `include: ['src/**/*.test.ts']` + `environment: 'node'`。那個 glob **不匹配 `.tsx`**,
所以元件測試會被**靜默忽略而非失敗**——寫了、沒跑、全綠。這正是 2026-08-07 快速歸零缺陷
死掉的那個缺口(純函式層當時全綠)。

改成兩個 project(`node` / `dom`),讓副檔名本身成為選擇器,這個陷阱不可能再出現;
node project 設定逐字不變,既有 173 個測試環境零影響。
新增 `src/renderer/src/test/{irmsStub,setup}.ts`;`irmsStub` 刻意做成**可呼叫模組**,
因為 CMD: 稽核測試是 service 層的 `.test.ts`,跑在不掛 setupFiles 的 node project。

environment 選 jsdom 而非 happy-dom:CSV 匯出走 `Blob`/`URL.createObjectURL`/`a.click()`,
主題偵測走 `matchMedia`,都是 happy-dom 的弱項。

### 2. `ingest(text)` 純搬移

`handleNotification` 只留事件解包與 `TextDecoder`,`bluetooth.ts:139-183` 原封不動搬進
公開的 `ingest(text)`。以 `git diff -w` 逐行確認是純搬移。

**留在 `BluetoothService` 上而不抽新 class**:這正是 DI 問題消失的原因——模擬器
**驅動既有 singleton 而不是取代它**,`sessionController` 的硬 import 照舊,不需要注入任何東西。
會議的約束是「不得繞過 `parseAnglePacket` 與 `applyCalibration`」,不是「必須自成一個 class」。

### 3. 模擬來源(全純函式)+ 播放器

`simulation/`:`encode.ts` 逐位元對齊韌體 `IRMS_Sensor.ino:203` 的 snprintf,
**含 `K:`/`KR:` 兩個被解析器忽略的欄位**——它們必須在線上,因為長度決定 MTU 截斷的切點。
`kinematics.ts`、`scenarios.ts`(六個情境)全部以 `t` 參數化,所以 vitest 不必啟動 pump
就能消費;`simulator.ts` 是唯一有副作用的檔案。

`scenarios.ts` 檔頭寫明禁止事項:任何測試都不得用模擬器論證 `FILTER_ALPHA`、`EMA_ALPHA`、
`HYSTERESIS_DEG`、`EXIT_GRACE_MS`、擷取門檻的取值。模擬器驗證的是程式對輸入的反應,
永遠不是輸入像不像一條腿——用它驗證那些常數是循環論證。

### 4. 示範模式(出貨版)+ migration 7

`sessions.source TEXT NOT NULL DEFAULT 'device' CHECK (source IN ('device','demo'))`。

**刻意不沿用 `NULL = 舊行為` 慣例**:migration 4/5/6 的 NULL 意思是「我們確實不知道」;
這裡我們知道——示範模式當時還不存在。更關鍵的是失效模式:可為 NULL 的欄位其失效表現
恰好是**靜默地呈現為真實資料**,正是這個欄位要防的那件事。

`SessionSource` 在 `SessionStartInput` 設為**必填**,TypeScript 於是拒絕編譯任何沒做決定的路徑;
旗標放無 persist 的 `useUiStore`(必須隨行程死亡);進行中不可切換(UI 停用 + store 拒絕並留日誌);
四個讀取面標記(History 徽章、分析 modal 常駐橫幅、CSV `# source` 第一行、檔名 `irms_DEMO_`);
示範列**刻意不隱藏**,另加一鍵清除,讓「資料庫乾不乾淨」變成回答得了的問題。

### 5. 順手修:回滾測試斷言的是複製品

`migrations.test.ts` 原本手抄了一份 runner 迴圈來測回滾,所以斷言的是複製品——
即使 `applyMigrations` 的回滾壞掉,那個測試也會永遠通過。改為讓
`applyMigrations` 接受可注入的 migration 清單,測試呼叫真正的函式。

## 🐞 抓到的既有缺陷

### 缺陷 A — `linkTruncated` 永久卡在 true
`connect()` 重設 `truncationReported` 並清 `linkTruncated`,但 `attemptReconnect()` 直接呼叫
`connectGATT()`,完全繞過 `connect()`。註解自述的理由(「重連可能協商到不同的 MTU,
舊旗標不得沿用」)正是唯一失效的那個情境。重連到較大 MTU 後截斷橫幅永不消失、
校準精靈持續拒絕外展步驟。修法:重設移進 `connectGATT()`(首次與重連的唯一共同路徑)。

### 缺陷 B — 達標 LED 從第一下卡亮到 Session 結束(臨床)
`onRepCompleted` 只 patch `inZone:false` 並送 `GOAL`,**沒有熄燈**;引擎隨即進入 `restPending`,
之後每筆封包提早 return,`onRestCompleted` 也不碰 LED。患者回位後再次進區時,
`onZoneEnter` 送出的 `LED_ON` 被 `lastLed === 'on'` 去重吃掉。

**淨效果:第 2..N 下患者得不到任何區間回饋,而 store 顯示 `inZone:false`——軟體狀態與
GPIO 實際狀態分歧,且沒有任何訊息。** 修法:`onRepCompleted` 內補 `sendLed('off')`,
放在 `session.running` 檢查之前(未開始 Session 時同樣已離開區間)。

## ✅ 驗證

- **`npm run ci` 全綠**:typecheck + **246 tests / 21 files** + build(原 173 / 14)。
- **先紅後綠**:缺陷 B 的測試在修正前確認為紅(且 `GOAL` 計數 2、`reps` 2 證明引擎
  確實再次進區,唯一沒送 `LED_ON` 的原因只能是去重快取),修正後轉綠。
- **突變測試**:逐一拿掉防護確認測試會紅——示範模式的進行中閘門(3 紅)、
  `connect()` 的提前 return(1 紅,且此測試若沒有日誌斷言會兩種情況都通過)、
  History 徽章條件(2 紅)、重連重設(1 紅)。
- **實機執行(非僅測試)**:以隔離 `--user-data-dir` 啟動打包後的 app,
  **七個 migration 全部在真正的 better-sqlite3 上套用成功**——這是 vitest 碰不到的路徑
  (better-sqlite3 為 Electron ABI 編譯,migration 測試用的是 `node:sqlite`)。
  隔離資料庫起來是 `user_version 7`、`source TEXT NOT NULL DEFAULT 'device'` 且 CHECK 完整。
  **使用者真實資料庫的 md5 前後相同,全程未被開啟。**

## 🔍 自我審查

**場景:T5 是不是真的測到它宣稱的東西?**

計畫預期 T5(重連後重新武裝警報)會鎖住 `sessionController` 的重連 `resetFeedbackState`。
實測把那三行拿掉後 **T5 照樣全綠**——它其實鎖的是「斷線時清空指令去重快取」那一段
(拿掉那段才會紅)。ALARM_ON 能重送靠的是快取被清空,與引擎有沒有重設無關。

於是把 T5 誠實改名,並補上重連重設**真正**保護的情境:斷線前已進區並開始保持,
斷線一分鐘後重連,若引擎沒重設則 `state` 仍是 `holding`、`inZoneStartTime` 停在一分鐘前,
**重連後的第一拍就計出一下並寫進 DB——一次患者根本沒做的療程**。該測試在拿掉重連重設時
確認為紅(`reps` 1 而非 0)。

另外兩次「以為抓到缺陷、其實是測試寫錯」也一併記在測試檔裡:EMA(α=0.3)需約 15 拍才收斂,
只餵 5 拍從 10° 只爬到 76.6°、根本沒進 80° 的區間;以及 130°→10° 的過程會**經過**目標區間
(真人放腿本來就會),所以 `ALARM_OFF` 之後還有 `LED_ON`/`LED_OFF` 是正確行為。

## ⚠ 尚未驗證

- **UI 沒有被眼睛看過**:本次環境無法截圖。示範模式面板、全域橫幅、分析 modal 的示範警示
  目前只由型別與元件測試涵蓋,仍應在有螢幕存取時目視驗收一次。
- **實機**:issue #3 完全未動。指令稽核只證明 App 送出正確的字串與順序,
  不證明它們真的驅動 GPIO 25/26。MTU 協商、真實 Web Bluetooth 行為、25Hz 持續吞吐、
  精靈的 axisSwap 在真人腿上是否成立,全部仍需裝置。
- **Stage 2 未動工**:P2 UX backlog(Roll 曲線切換、動作排序/搜尋、重連視覺提示、快捷鍵)。

## 📌 下一步

Stage 2 依序:重連進度視覺提示(⚠ `attemptReconnect` 寫的 `statusText` 會被 `setConnection`
無條件覆蓋,需要獨立的 store 欄位)→ LiveChart Roll 切換(⚠ 新增 `Settings` 欄位必須把
persist version 4→5 並擴充 `migrateSettings`,否則淺層 merge 會丟掉新欄位)→
Actions 排序/搜尋(抽純函式)→ 鍵盤快捷鍵(重用 `escapeStackDepth() > 0` 擋 modal)。
