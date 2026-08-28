---
tags: [coding-log]
summary: "issue #2 收尾:裝置回到手邊,燒錄現行 IRMS_Sensor 韌體(compile 乾淨,esp32:esp32:esp32,85% flash)到真實硬體(COM7),兩顆 MPU6050 開機即讀值正常、無 ERR:1。第一次擷取因啟動計時與實際動手時間沒對上,擷取窗內板子其實沒動(T/S/TR/SR 變異量 <2°),誠實記下並重跑而非用它交差。第二次擷取(使用者主動示意後才開窗)拿到 65.5s / 1639 筆 / 穩定 25Hz、零 ERR:1、零畸形封包的真實旋轉資料,Roll 擺動 193–197°、Pitch 擺動 96–97°,證實 08-22 的逐軸降級修法生效——Roll 全程跟隨動作,未卡在 0。資料存為 doc/coding log/rotation_capture_20260828.tsv,可作 parseAnglePacket 的真實封包 fixture。issue #2 兩項驗收(燒錄、旋轉記錄)皆達成,已在 GitHub 關閉;issue #3(完整 E2E)因韌體已在裝置上而解除阻塞。"
date: 2026-08-28
---

# 2026-08-28 變更日誌 — 韌體燒錄 + 實機旋轉記錄(issue #2 收尾)

> **相關文件**:[[HOME|導覽首頁]] · [[PROJECT_STATUS|開發進度]] · [[ROADMAP|架構與代碼計畫]] ·
> [[log_20260822_firmware_mtu_diagnostics_and_serial_telemetry|08-22 桌面部分日誌]]

## 🎯 目的

裝置零星取得的時間窗到了。08-22 已把 issue [#2](https://github.com/yuhina0515/IRMS/issues/2)
不需要裝置的部分做完(MTU 診斷、`SERIAL_TELEMETRY`),剩下**唯一需要硬體的兩步**:
把現行韌體燒進真板子、擷取一段桌上旋轉記錄驗證封包不再靜默截斷 Roll。

## 🔧 變更內容

- **環境確認**:`arduino-cli`(1.5.1,隨 Arduino IDE 附帶於
  `C:\Program Files\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe`,未在
  PATH)、`esp32:esp32` core 3.3.11 已裝。裝置經 CH340(`VID_1A86&PID_7523`)接於 COM7。
- **編譯 + 燒錄**:`arduino-cli compile --fqbn esp32:esp32:esp32 IRMS_Sensor` 乾淨通過
  (1122799 bytes,85% flash,與 08-22 記載的編譯後大小一致);`upload -p COM7` 成功,
  硬重置後開機。
- **序列擷取(PowerShell `System.IO.Ports.SerialPort`,115200 baud)**:
  - 第一次(8s 快速檢查):兩顆 IMU 讀值穩定、無 `ERR:1`,確認訊號鏈通。
  - 第二次(65s,擷取視窗開啟同時請求進行旋轉):事後檢查數值範圍,T/S/TR/SR 全部
    集中在 <2° 的區間——**擷取視窗開啟的時機比實際動手轉動早**,這份資料不代表旋轉,
    誠實記下未使用,重新開一次視窗並等待明確的「開始」訊號再啟動計時。
  - 第三次(65.5s,使用者確認就緒後才開窗):1639 行、~25Hz、**零 `ERR:1`、零畸形行**。
    `T` 95.7°、`S` 97.0°、`TR` 196.7°、`SR` 193.5° 的擺動範圍,涵蓋 Pitch 大範圍運動與
    Roll 近乎完整的 ±180°。存為 `doc/coding log/rotation_capture_20260828.tsv`。
- **issue #2 關閉**:於 GitHub 留言附上上述證據並關閉。留言同時指出這份記錄走的是
  `SERIAL_TELEMETRY` 直接序列輸出,不是被 BLE MTU 切過的路徑——驗證的是感測器與封包組裝
  本身,BLE 傳輸鏈的驗證仍在 issue #3 範圍內。

## 🧠 關鍵取捨

**第一次 65s 擷取數值近乎不動時,為什麼不直接拿它交差、宣稱「已擷取」?**
專案規則「先看證據再下判斷」([[log_20260827_visual_verification]] 也踩過同一課)——
擷取本身無錯誤不代表擷取到了要的東西。检查數值範圍屬於擷取後必做的驗收步驟,
不是可省的手續;省了就會把一份空白資料誤記成完成 issue #2 的證據。

## ✅ 驗證方式

- [x] `arduino-cli compile --fqbn esp32:esp32:esp32 IRMS_Sensor`:exit 0,85% flash
- [x] `arduino-cli upload -p COM7`:寫入 + 校驗雜湊皆通過(bootloader/partitions/app 三段)
- [x] 序列擷取:65.5s / 1639 行 / ~25Hz / 0 個 `ERR:1` / 0 個畸形行
- [x] 數值範圍證實 Roll(`TR`/`SR`)全程跟隨動作,未卡在 0(08-22 逐軸降級修法的實機佐證)
- [ ] **issue #3 完整 E2E 仍未動**:達標回饋、超限警報、斷線收尾、重連重新武裝、
      校準精靈實機走一遍——這些都需要 App 端 BLE 連線與人穿戴,超出本次桌上擷取範圍

## 📝 後續待辦

issue #2 已關閉。裝置仍在手邊時,下一步是 issue
[#3](https://github.com/yuhina0515/IRMS/issues/3) 的完整 E2E 腳本(見
[[log_20260801_meeting_app_review]] 附的驗收清單)——現在韌體已在裝置上,阻塞條件
(#3 依賴 #1/#2 完成)已解除。
