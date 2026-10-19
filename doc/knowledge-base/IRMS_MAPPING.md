# 與 IRMS 實作的對照快照

本次源碼檢查固定在 App commit `af65daa2c4eb29b2e296c2023caf07d0e4b4a9e1`，倉庫 [IRMS](https://github.com/yuhina0515/IRMS/tree/af65daa2c4eb29b2e296c2023caf07d0e4b4a9e1)。韌體另讀取 [IRMS-Firmware](https://github.com/yuhina0515/IRMS-Firmware/tree/15c5c709ba12603454449a2311faf3489ac7f96e)，commit `15c5c709ba12603454449a2311faf3489ac7f96e`。查核日 2026-10-03；以下是源碼事實或待研究問題，不是硬體與臨床驗收結果。

| 範圍 | 當前源碼與文件 | 知識庫用途 |
|---|---|---|
| 桌面主程式 | [Tauri README](../../IRMS_App_Tauri/README.md) | 現役為 Tauri／Rust + React；歷史 Electron 分開 |
| 校準 | [calibration.ts](../../IRMS_App_Tauri/src/services/calibration.ts) | 靜止片段、方向、功能框架與設定再現 |
| 關節指標 | [angleMath.ts](../../IRMS_App_Tauri/src/services/angleMath.ts)、[useStore.ts](../../IRMS_App_Tauri/src/store/useStore.ts) | 三種相容路徑分別驗證，Roll 差不能直接宣稱臨床內外翻 |
| 平滑 | [smoothing.ts](../../IRMS_App_Tauri/src/services/smoothing.ts) | EMA 與最短弧、重置及累積延遲 |
| 達標與警示 | [triggerEngine.ts](../../IRMS_App_Tauri/src/services/triggerEngine.ts) | 區間、維持、返回休息與獨立範圍提示 |
| 歷程統計 | [sessionAnalysis.ts](../../IRMS_App_Tauri/src/services/sessionAnalysis.ts) | 全量點、有效時間、缺口與分析語意 |
| 協定 | [protocol.ts](../../IRMS_App_Tauri/src/shared/protocol.ts)、[protocol.rs](../../IRMS_App_Tauri/src-tauri/src/protocol.rs) | 25 Hz 串流、可選向量延伸與有效性 |
| 資料庫 | [db.rs](../../IRMS_App_Tauri/src-tauri/src/db.rs)、[migrations.rs](../../IRMS_App_Tauri/src-tauri/src/migrations.rs) | WAL／外鍵、交易與歷史資料 |
| 模組 | [MODULE_CONTRACT.md](../MODULE_CONTRACT.md)、[modules.ts](../../IRMS_App_Tauri/src/services/modules.ts) | 研究功能需保持獨立操作頁與取消清理 |
| OTA／更新 | [firmware.rs](../../IRMS_App_Tauri/src-tauri/src/firmware.rs)、[firmware_update.rs](../../IRMS_App_Tauri/src-tauri/src/firmware_update.rs) | 程序階段、簽章及裝置版本確認 |
| 遙測 | [telemetry.rs](../../IRMS_App_Tauri/src-tauri/src/telemetry.rs) | 背景傳送與資料品質事件；未核對實際伺服器 |
| 韌體 | [config.h](https://github.com/yuhina0515/IRMS-Firmware/blob/15c5c709ba12603454449a2311faf3489ac7f96e/IRMS_Sensor/config.h)、[imu.h](https://github.com/yuhina0515/IRMS-Firmware/blob/15c5c709ba12603454449a2311faf3489ac7f96e/IRMS_Sensor/imu.h) | 設定感測 50 Hz、推播 25 Hz、互補權重 0.85，實際時序仍需測 |

`applyCalibration` 的完整鉸鏈框架、向量扣零及舊角度相容路徑應用不同條件。`smoothing.ts` 有歷史註解與更新實作並存，因此本庫以函數實際邏輯為準；沒有從舊文字推論所有膝角必定由平滑後的 Pitch 重算。

`RawAngles` 的角度不是完整 ADC／三軸原始 IMU。現有公開封包可用於 parser 與應用邏輯回放，但不足以重新執行所有姿態融合演算法。模擬與單元測試不替代硬體或人體資料。

本次交付只新增知識資產與入口。沒有修改以上運行程式、韌體、資料 schema、預設處方或警報閾值。後續開發仍需按現有測試及 release gate；文獻可幫助形成驗證計畫，不能用來關閉尚未驗收的硬體工作。
