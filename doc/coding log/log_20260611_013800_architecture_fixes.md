---
tags: [coding-log]
date: 2026-06-11
summary: "修復審計發現的三項韌體缺陷(非阻塞蜂鳴、軸向校正、dt 對齊)+前端緩衝區 2000 點上限防溢出"
---

# AI Coding Log - 2026-06-11 01:38:00 (Architecture & Logic Fixes)

## 目的 (Objective)
針對 `log_20260611_013600_architecture_audit.md` 中指出的三項韌體重大邏輯缺陷與前端記憶體與性能風險進行修復，優化系統的執行緒安全性、感測器物理對位、I2C 斷線重連機制以及前端快取穩定性。

## 動作記錄 (Action Log)
1. **韌體端修復 (ESP32 Firmware)**：
   * 修改 [IRMS_Sensor.ino](file:///c:/Users/Yuhina/Documents/IRMS/IRMS_Sensor/IRMS_Sensor.ino)：
     * **解決缺陷 A**：自 `MyProfileCallbacks::onWrite` 移除同步阻塞 `vTaskDelay` 調用，將蜂鳴器雙短響控制邏輯改移至獨立核心執行的 `Task_LED` 中（於 `STATE_GOAL_REACHED` 分支執行），確保 NimBLE 藍牙接收執行緒完全非阻塞。
     * **解決缺陷 B**：修正 `readMPU6050` 函數，將 Pitch 融合角速度變更為 `gy / 65.5`（繞 Y 軸），Roll 融合角速度變更為 `gx / 65.5`（繞 X 軸），消除原先交叉接錯導致的互補濾波運算大誤差。
     * **解決缺陷 C**：於 `Task_Sensor` 的 I2C 自動復位區塊（當 `i2cFailCount > 5` 且復位成功時），將互補濾波狀態變數直接以當前加速度計靜態讀數初始化，防止突發數值跳躍；並在復位延遲 1000ms 後將時間基準 `lastTime` 更新為 `millis()`，確保後續週期之 `dt` 維持正常，徹底杜絕積分尖峰。

2. **前端優化 (Electron App)**：
   * 修改 [app.js](file:///c:/Users/Yuhina/Documents/IRMS/IRMS_App/public/app.js)：
     * 實作 `restoreDataBuffer(readings)` 輔助函數，在網路異常重試時，改用高效的 `.concat()` 拼接，並對資料緩衝區大小設定上限限制 (`maxBufferSize = 2000`，約 200 秒數據量）。一旦超出上限則拋棄過期數據，保護瀏覽器在長時間斷連下不發生主執行緒阻塞或記憶體崩潰。
