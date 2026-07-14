---
tags: [coding-log]
date: 2026-07-04
summary: "韌體 v3 重寫:模組化 config.h/imu.h、GOAL 音改旗標制、斷線即靜音安全機制、dt 夾限;BLE 協定 100% 相容,需重新燒錄"
---

# 2026-07-04 變更日誌 — ESP32 韌體 v3 重寫(底層代碼與邏輯)

> **相關文件**:[[HOME|導覽首頁]] · [[ROADMAP|架構與代碼計畫]] · [[log_20260703_architecture_audit_fixes|前置:審查修復日誌]]

## 🎯 目的

依 ROADMAP 決策 **D1(App-Driven)** 重寫韌體底層:舊版單檔 440 行、全域變數散落、
GOAL 音借用系統狀態機、斷線後蜂鳴器可能永久長鳴。重寫為職責清晰的模組化結構,
**BLE 協定(UUID/封包/CMD)與腳位 100% 不變**。

## 🔧 新結構

| 檔案 | 職責 |
|---|---|
| `config.h` | 腳位/位址/UUID/濾波與時序參數,單一組態來源 |
| `imu.h` | `Mpu6050` 類別(begin/read/calibrate)+ `ComplementaryFilter` 類別 |
| `IRMS_Sensor.ino` | BLE 服務、CMD 解析、Task_Sensor / Task_Comm / Task_LED |

## 🛠 邏輯修正(相對 v2 韌體)

1. **斷線即靜音(新安全機制)**:BLE `onDisconnect` 強制關 GPIO25/26——App 斷線後
   無人能下 `ALARM_OFF`,舊版蜂鳴器會卡在長鳴。
2. **GOAL 雙響改旗標制**:`goalBeepRequest` 由 Task_LED 消費,不再把 `STATE_GOAL_REACHED`
   塞進系統狀態機(舊版:雙響期間發生 ERR/斷線會被 beep 結尾覆寫回 CONNECTED)。
3. **警報狀態恢復**:雙響結束後蜂鳴器恢復 `alarmActive` 對應電位,不再蓋掉進行中的長鳴。
4. **dt 夾限 0.2s**(`ComplementaryFilter.update`):任何停頓後系統性防積分尖峰,
   取代舊版散落的 `lastTime` 手動重設。
5. **init 失敗跳過校準**:舊版感測器不在時仍空跑 2 秒校準迴圈。
6. **熱路徑零 Arduino String**:`snprintf` 直接 `setValue`,無堆積碎片化。
7. 保留:50Hz 取樣、α=0.85 互補濾波、I2C 自動復原(復原後靜態角重設濾波)、
   25Hz 推播、MTU 128、`trim()` 指令防禦、審計修正的 gy/gx 軸向。

## ✅ 驗證方式

- [x] 程式審閱:協定字串/腳位/任務優先權與 v2 一致
- [ ] 📡 **需以 Arduino IDE 編譯並重新燒錄**(無 arduino-cli,無法本機驗編譯)
- [ ] 📡 重燒後重跑 E2E 清單(重點:斷線時蜂鳴器必須立即停)

## 📝 後續待辦

- 舊版備份 `IRMS_Sensor_Full.bak` 已無參考價值(Standalone 需求列 Phase 5 選配),可考慮刪除
