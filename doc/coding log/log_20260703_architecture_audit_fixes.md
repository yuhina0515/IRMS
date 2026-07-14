---
tags: [coding-log]
date: 2026-07-03
summary: "v2 架構審查修復 8 項缺陷:BLE 指令尾端 \\n 使韌體比對失效(硬體回饋全滅)、重連去重快取回歸、協定切換選取殘留等"
---

# 2026-07-03 變更日誌 — v2 全面架構審查與 8 項缺陷修復

> **相關文件**:[[HOME|導覽首頁]] · [[PROJECT_STATUS|開發進度]] · [[OPTIMIZATION|優化待辦]]

## 🎯 目的

使用者回報「許多地方都不如預期」。對 v2 App(main/preload/shared/renderer 全部)與
ESP32 韌體進行逐檔審查,比對 BLE 協定契約,找出並修復執行期缺陷
(typecheck 原本就全過,問題皆為行為層)。

## 🔍 審查發現與修復

### 🔴 嚴重
1. **BLE 指令附加 `\n` → 硬體回饋全滅**(`bluetooth.ts send()`)
   韌體 `onWrite` 以 `data == "CMD:GOAL"` 精確比對;App 每個指令尾端加 `\n`,
   導致 LED_ON/OFF、GOAL 達標音、ALARM_ON/OFF **全部靜默失效**。
   修復:App 端移除 `\n`;韌體端加 `data.trim()` 防禦(**需重新燒錄**)。
2. **重連後指令去重快取未重置**(`sessionController.ts`,舊版審計 Fix 8 回歸)
   斷線後 ESP32 GPIO 狀態未知,但 `lastLed/lastAlarm` 殘留,重連後第一次
   LED_ON/ALARM_ON 被去重吃掉。修復:訂閱 `isConnected` 轉 false 時歸零快取。

### 🟠 中度
3. **切換協定後 `selectedActionId` 殘留他協定動作**(store)
   下拉框顯示與狀態不符、Start 按鈕死鎖。修復:新增 `reconcileSelection`,
   於 `setSettings`(協定變更)與 `setCustomActions`(清單變動/刪除)自動校正選取
   並帶入動作參數;Session 進行中不動選取。
4. **未開始 Session 也累計 Reps + 觸發達標音**(`sessionController`)
   修復:`onRepCompleted` 以 `session.running` 閘門;未開始時只保留區間 LED 回饋。

### 🟡 輕度
5. **裝置不在場時 `requestDevice` 永久卡住**(`main/index.ts`)
   `select-bluetooth-device` 從不呼叫 callback。修復:15 秒掃描逾時後 `callback('')`,
   renderer 顯示 Device not found。
6. **骨架圖目標弧位置錯誤**(`AngleVisualizer`)
   三種 triggerType 的弧皆未對齊實際肢段螢幕角度。修復:
   elevation→`target`、extension→`-target`、joint_angle→`180 - thigh + target`。
7. **「同步至 ESP32」為無效操作還報成功**(SettingsView)
   現行韌體未實作 `CMD:SYNC`/Profile 解析(僅舊版 `IRMS_Sensor_Full.bak` 有 NVS/Task_Logic)。
   修復:移除按鈕(校準本就全在 App 端);快速歸零擴充涵蓋 Roll;
   `buildSyncCommand`/`buildProfilePayload` 標記 `@deprecated`。
8. **Malformed 封包日誌洗版**(`bluetooth.ts`)
   節流誤用 `packetCount`(壞封包不會遞增它,`0 % 50 === 0` 恆真)。改用獨立計數器。
   另:`actionsRepo.delete` 回傳對齊 `{success:true}` 型別契約。

## 📐 文件/架構圖同步

- 韌體與文件不符:README/PROJECT_STATUS 描述的 Task_Logic、NVS 持久化、
  10Hz 推播皆非現行韌體行為(實際:無 Task_Logic、無 NVS、40ms≈25Hz 推播)。
  已修正 `doc/IRMS_架構圖.canvas`;README §3/§4 待對齊。

## ✅ 驗證方式

- [x] `npm run typecheck`(node + web)通過
- [x] `npm run build`(main/preload/renderer)通過
- [ ] BLE 實機驗證(需裝置;**韌體加了 trim,建議重新燒錄**)

## 📝 後續待辦

- README/PROJECT_STATUS 韌體章節與現況對齊(或決定把 Full.bak 的 Task_Logic/NVS 加回來)
- 實機驗證 8 項修復,特別是 CMD 指令與重連流程
