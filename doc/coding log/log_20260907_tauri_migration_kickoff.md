---
tags: [coding-log, tauri, migration]
summary: 依使用者指示啟動 Tauri v2 遷移——建好可跑的專案骨架、完整移植並測試封包解析邏輯、寫出完整 BLE 傳輸層(編譯通過,實機驗證仍待硬體)
date: 2026-09-07
---

# 2026-09-07 變更日誌 — 啟動 Tauri v2 遷移

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260907_meeting_tauri_v2_evaluation|Tauri 評估會議記錄]]

## 🎯 目的

使用者在看過三方會議的裁決(建議先做範圍精確的 BLE 可行性驗證,不要貿然全面
遷移)、以及後續 Gemini 給的框架比較之後,明確下指示:「現在開始以 Tauri 為主軸
進行開發」。這是使用者的決定權限範圍內的判斷(要不要接受風險),不是需要我再
勸退的事——會議裁決給的是資訊,不是否決權。這篇日誌記錄啟動遷移的第一批實際
工作,並且仍然誠實標注哪些部分還沒有(也不可能由我)驗證過。

## 🔧 動作

- **建立 `IRMS_App_Tauri` 專案**(`E:\Monitoring-and-IoT\IRMS\` 下與 `IRMS_App`
  並列的新資料夾,同一個 git repo):用 `create-tauri-app` 建骨架(React + TS
  模板),版本刻意對齊現有 `IRMS_App`(React 18.3.1、Vite 5.4.11、TS 5.6.3,
  而非 scaffold 預設的 React 19/Vite 8),降低之後搬前端程式碼時的摩擦。
  `productName`/視窗初始尺寸(1280×820,minWidth 1024/minHeight 600)也直接對齊
  `IRMS_App` 既有慣例。
- **驗證整條工具鏈能在這台機器上跑通**:`npm run tauri build -- --debug` 第一次
  就成功產出 MSI 與 NSIS 兩種安裝包,`.exe` 直接啟動也確認 process 存活——
  Rust/Cargo 工具鏈、WebView2、WiX/NSIS 打包工具全部在這台機器上正常運作,
  環境本身不是風險。
- **完整移植 `shared/protocol.ts` 的 `parseAnglePacket`**(`src-tauri/src/
  protocol.rs`):這是唯一不需要真實硬體就能完整驗證的一塊。逐字對照原本的
  TS 版本(欄位前綴比對順序、截斷降級邏輯、`hasRoll`/`truncated` 語意),把
  `protocol.test.ts` 的 18 個案例原封不動搬成 Rust 單元測試,`cargo test` 全過。
- **寫出完整的 BLE 傳輸層**(`src-tauri/src/ble.rs`,取代 `bluetooth.ts` 對
  Web Bluetooth API 的直接呼叫,因為 WebView2 完全沒有這個 API——見會議記錄):
  - 用 `btleplug` 掃描 + 依名稱前綴("IRMS")自動配對,逾時比照 Electron 主進程
    現有的 15 秒設計。
  - 訂閱角度特徵值通知,解析後透過 Tauri event(`ble:packet`)推給前端。
  - OTA 完整流程(`OTA:START` → 分塊 Write-Without-Response → `OTA:END`),
    分塊大小/節流延遲數字原封不動沿用(125 bytes / 8ms),透過
    `tokio::sync::broadcast` 讓 `perform_ota_update` 等待特定 OTA 狀態回覆,
    對應 TS 版的 `waitForOtaStatus`。
  - `cargo check`/`cargo build` 全部一次過關,沒有型別或 API 誤用的編譯錯誤。

## 📐 決策

- **沒有現在就去接真實硬體驗證,而是先確保程式碼在「假設硬體行為與 Web
  Bluetooth 一致」的前提下是正確、可編譯、邏輯對得上原版的**。原因很直接:
  這個環境裡沒有實體 ESP32 感測器可以配對,BLE 驗證本質上需要使用者(或有硬體
  存取權的人)親自跑——這跟現有的韌體 OTA 硬體任務(B3/B4/D1/D2)一直卡在「等
  硬體」是同一個處境,不是我沒去做,是這件事本來就不是遠端可以做到的。
- **`ble.rs` 的模組層註解與 self-review 都明確點出兩個還沒驗證、正是會議交叉
  詰問揪出來的風險**:`OTA_CHUNK_DELAY_MS` 這個節流數字在 `btleplug` 的 WinRT
  後端底下是否還夠用,以及韌體版本跳動後重新連線能不能正確拿到新的 GATT
  table——沒有在程式碼或這篇日誌裡假裝這兩件事已經解決。
- **前端(React/Zustand/three.js/chart.js)這次完全沒動**——`IRMS_App_Tauri`
  目前還是 scaffold 自帶的示範頁面,不是真的 IRMS UI。這是刻意的排序:BLE
  傳輸層是整個遷移風險最高、最可能讓計畫整個喊卡的一塊,先把它寫出來、至少
  確保編譯得過,比先搬 UI 更早知道「這條路走不走得下去」。
- DB 層(`better-sqlite3` → `rusqlite`)這次沒有動手,只留在 pending——時間
  分配上優先把 BLE 這塊(風險最高、也最能用 protocol.rs 這種可測試的方式先
  交出一部分實質進度)做完整,DB 層留到下一輪。

## ✅ 驗證

- `npm run tauri build -- --debug`:成功,產出 MSI + NSIS 安裝包。
- 直接啟動打包出的 `.exe`,`Start-Process` + 3 秒後確認 process 仍存活
  (`Get-Process`)——PASS,不是「編譯過」就假設「跑得起來」,有實際啟動確認。
- `cargo check`:整個 workspace(含新增的 `ble.rs`/`protocol.rs`)零錯誤零警告。
- `cargo test --lib protocol`:18/18 全過,逐一對應 `shared/protocol.test.ts`
  的每個案例(6 軸封包、TR/SR 前綴不被 T/S 誤吃、ERR 封包、malformed、MTU 23
  截斷的每一種降級情境、hasRoll/truncated 語意)。

## Self-review

檢查情境:「`ble.rs` 寫了一整套看起來完整的 BLE 邏輯,會不會讓人誤以為這已經
『可以用』,而實際上一行都沒有跟真正的裝置對過話?」——特意在檔案最頂端的
模組註解、以及這篇日誌的「決策」段落都明講:這只通過了 `cargo check`,沒有
拿真正的 ESP32 測過任何一個位元組。新增的 task #55(「Validate Tauri BLE
module against real ESP32 hardware」)明確標成待硬體,且複製了會議裁決點名的
兩個具體驗證項目(25Hz 長時間穩定性、OTA 後 GATT cache),不是一句籠統的
「之後再測」——PASS,寫作與任務追蹤都沒有把「編譯通過」講成「可以用」。
