---
tags: [coding-log]
date: 2026-08-29
summary: "使用者臨時離場前,改用 2026-08-27 建立的無硬體演練基建(demo mode + 模擬器)驗證 issue #3 的四項 App 端行為:達標(reps 10)、超限警報+靜音+30秒重新武裝、ERR:1 遮罩+逃生按鈕、強制關閉 App 後 abandoned 標記+repsCompleted 正確持久化——全部透過 Playwright 連上封裝後 app 的 CDP 埠驅動,並用唯讀 SQL 直接查真實 DB 客觀驗證,不只看畫面。過程中發現並修正一個測試方法論陷阱(模擬器假設預設校準,套用真實裝置的非預設校準會讓判定通道跑到別的軸,看起來像卡死)、確認並記錄一個既有的文件與實作落差(demo 面板從未真的套用 REFERENCE_ACTION 參數)、並確認 BLE 斷線重連這項无法用模擬器測試(deviceSimulator.stop() 直接呼叫 onConnectionLost,不會經過 attemptReconnect,只有真實 GATT 斷線事件會)。結束後完整還原真實校準、清除示範紀錄與測試動作。"
---

# 2026-08-29 變更日誌 — Demo Mode 驅動的 issue #3 App 端驗證

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260827_ingest_seam_simulator_demo_mode|前置:無硬體演練基建]] ·
> [[log_20260829_meeting_auto_calibration_feasibility|同日:校準自動化評估會議]]

## 🎯 目的

使用者臨時要去補習班,原訂需要真人配合的 issue #3 E2E 清單(達標/超限/斷線/abandoned)
沒辦法繼續。使用者提議「用什麼工具模擬」,想起 2026-08-27 建的無硬體演練基建正是為了
這個情境準備的——改用 demo mode + 模擬器把 App 端邏輯先驗證掉。

## 🔧 過程與發現

### 方法:Playwright 連上封裝後 app 的 CDP 埠

`IRMS Dashboard.exe --remote-debugging-port=9333` 啟動,用 `playwright.chromium.
connectOverCDP` 連上,直接點選 UI、截圖記錄、並用 Node 內建 `node:sqlite` 唯讀開啟
真實 `irms.sqlite` 客觀核對結果——不只信畫面,每一項都有 DB 層級證據。

### 踩到的坑 1:真實校準套在模擬資料上,判定通道跑到別的軸

第一次跑 `rep-cycle` 情境,連續 62 秒角度紋絲不動。一度懷疑是 bash 背景啟動的 stdout
沒接上、RDP session 斷線干擾(`query session` 一度真的顯示 Disc,確認 Active 後問題
仍在)、GPU 加速——逐一排除後回頭看 `kinematics.ts` 的檔頭註解:模擬器產生的是**原始**
角度,只有在**預設校準**(zeroRaw 全 0、axisSwap 全 false)下才等於判定看到的值。
今天稍早在真裝置上做的右腿校準(`axisSwap:true` 等)還留在 localStorage,套用到模擬
資料上把判定通道整個轉到別的軸——不是 app 的 bug,是我沒注意到的測試前置條件。
備份真實校準到檔案、暫時重設成單位轉換、測完整批 demo 情境後完整還原(見下方驗證)。

### 踩到的坑 2:`REFERENCE_ACTION` 從未被 UI 實際套用

修好校準後 `rep-cycle` 情境仍然 `repsCompleted: 0`。追查發現:`scenarios.ts` 的
`REFERENCE_ACTION`(hold 2000ms)只有 `demoMode.test.ts` 手動 spread 使用,**Demo 面板
從未真的把它套到 Designated Action**——當時選的是預設 `Squat` 動作(hold 3000ms),
情境的保持窗只有 2500ms,永遠不夠 3000ms 的門檻,reps 因此結構性地卡在 0。這是文件
(檔頭註解宣稱「選情境時一併套用」)與實作之間的真實落差,已修正註解如實記錄現況
(不擴大範圍去實作自動套用,那是另一個獨立的產品決策)。手動建立一個參數與
`REFERENCE_ACTION` 完全一致的 Action(`Demo E2E Reference`)後,情境立刻正常運作。

### 踩到的坑 3(方法論而非 bug):BLE 斷線重連無法用模擬器測

檢查 `bluetooth.ts` 確認:`deviceSimulator.stop()`/`endSimulated()` 直接呼叫
`onConnectionLost()`,等同手動斷線,完全繞過 `attemptReconnect()`——那只在真實
`gattserverdisconnected` GATT 事件才會觸發。issue #3 的「斷線重連後警報重新武裝」這項
因此**無法用 demo mode 驗證**,如實記在待辦裡,留給真裝置。

### 實測結果(四項,皆有 DB 或畫面雙重證據)

| 項目 | 情境 | 結果 |
|---|---|---|
| 達標 | rep-cycle(換上參數相符的 Action 後) | `repsCompleted: 10`,session 正常 end |
| 超限警報 + 靜音 + 30秒重新武裝 | over-limit(45秒停留,專為測這個設計) | 靜音後畫面即時變化,30 秒後警報 UI 確認自動變回紅色/顯示靜音鈕,判定為重新武裝 |
| ERR:1 遮罩 + 逃生按鈕 | hardware-error | 紅色遮罩「感測器 I2C 連線脫落(ERR:1)」正確顯示;點擊「結束並儲存 Session」逃生鈕後 DB 確認 `endTime` 正確寫入、`abandoned:0` |
| 強制關閉 App → abandoned | rep-cycle(先建立進行中 session) | Force-kill process(非正常關閉)後查 DB:`endTime:null,abandoned:0`;重啟後 `initDatabase()` 的 `finalizeOrphanedSessions` 正確補上 `endTime`、`abandoned:1`,`repsCompleted` 停在強制關閉前最後一次增量寫入的值(6),未歸零也未卡死 |

## ✅ 驗證方式

- [x] `npm run typecheck`:全綠(僅改動 scenarios.ts 一段註解)
- [x] `npm run test`:284 tests 持續全綠,不受本次變更影響
- [x] 四項 demo mode E2E 場景皆有 DB 層級客觀證據(見上表),非僅目視
- [x] 收尾:`localStorage` 校準以備份檔還原並經**乾淨重啟**確認持久化生效(第一次還原
      被同一個 page session 之後的其他操作蓋回預設值,重做時中間不再插入任何操作,
      立即重啟驗證);測試用 Action(`Demo E2E Reference`)已刪除;示範紀錄以
      「清除所有示範紀錄」按鈕清空;最終確認 `sessions:0`、`custom_actions:5`(僅預設)

## 🧠 關鍵取捨

**為什麼直接重設校準做測試,而不是想辦法讓模擬器相容任意校準?** 範圍要收斂——
`kinematics.ts` 檔頭已經明講這是模擬器的已知邊界,不是這次任務的責任。用真人今天已
驗證過的真實校準去讓模擬資料失真,才是需要修的是我的測試流程,不是程式碼。

**為什麼只修 `REFERENCE_ACTION` 的註解,不順手把自動套用實作出來?** 那是一個真實但
獨立的產品決策(demo 面板該不該在選情境時覆蓋使用者當下選的 Designated Action,
覆蓋後結束示範模式要不要復原)——今天的任務是「用模擬器驗證 App 邏輯」,不是「順便
擴大 demo mode 的功能範圍」。如實記錄落差,決定权留給之後。

## 📝 後續待辦

- issue #3 剩餘兩項(斷線重連重新武裝、換邊配戴警告的實機驗證)仍需真裝置與真人,
  已留在待辦清單等下次時間窗。
- `REFERENCE_ACTION` 自動套用是否要真的實作,是一個獨立的小型產品決策,未排入本次
  範圍。
