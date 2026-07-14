---
tags: [coding-log]
date: 2026-06-11
summary: "架構審計:發現 onWrite 阻塞 BLE、陀螺儀 Pitch/Roll 軸向交叉接錯、I2C 重連 dt 突增三項重大缺陷"
---

# AI Coding Log - 2026-06-11 01:36:00 (Architecture & Logic Audit)

## 目的 (Objective)
以「質疑與批判」的角度對 IRMS 專案當前硬硬體架構進行深度的邏輯審查，找出潛在的執行緒阻塞、演算法交叉接線、突波噪訊及資料庫防護問題。

## 動作記錄 (Action Log)
1. **規則登錄**：
   - 於 [AI_CODING_RULES.md](file:///c:/Users/Yuhina/Documents/IRMS/doc/AI_CODING_RULES.md) 第一章中寫入「持續運行與架構質疑 (Continuous Execution & Architectural Questioning)」硬性規範。
2. **架構邏輯審查**：
   - 審查 [IRMS_Sensor.ino](file:///c:/Users/Yuhina/Documents/IRMS/IRMS_Sensor/IRMS_Sensor.ino) 原始碼，共發現三項重大邏輯缺陷：
     - **缺陷 A**：BLE 特徵值寫入回呼 `onWrite` 內部同步調用 `vTaskDelay` 阻塞 NimBLE 工作執行緒達 550ms，具有引發藍牙連線逾時斷線與即時通知阻塞的風險。
     - **缺陷 B**：`readMPU6050` 內 Pitch (圍繞 Y 軸旋轉) 使用了 `gx`（X軸角速度），而 Roll (圍繞 X 軸旋轉) 使用了 `gy`（Y軸角速度），陀螺儀角速度軸向分配交叉接錯，會導致動態濾波在動作時產生極大誤差。
     - **缺陷 C**：I2C 斷線重連的 1000ms 延遲會導致重連成功後第一個週期的時間差 `dt` 暴增，放大陀螺儀積分噪訊，形成數值突波。
   - 審查 [app.js](file:///c:/Users/Yuhina/Documents/IRMS/IRMS_App/public/app.js) 前端代碼：
     - 確認了雖然使用了批量數據寫入 (Batch Insert) 減少磁碟壓力，但需提防網絡重試時大陣列拼接對瀏覽器效能的潛在衝擊。
