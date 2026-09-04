---
tags: [coding-log, firmware, ble, ota, app]
summary: "裝置韌體 BLE OTA 更新:設計研究(Phase A)+ 韌體與 App 端實作(Phase B/C)全數完成並通過 npm run ci;實機驗證(Phase B4 燒錄、D1 E2E、D2 斷電復原)需要實體硬體,留給使用者執行"
date: 2026-09-04
---

# 2026-09-04 變更日誌 — 裝置韌體 BLE OTA 更新

> **相關文件**:[[HOME|導覽首頁]] · [[OPTIMIZATION#⚪ P4 — 打包與部署|OPTIMIZATION P4]]

## 🎯 目的

2026-09-03 記錄的構想(使用者先前以照片提議,細節不確定)在 2026-09-04 使用者對三個
開放問題(傳輸方式、partition table、更新失敗復原)給出方向性回覆後,以 `/goal`
設定「依序完成計劃書所有任務、不中斷」,從設計研究一路做到實作。本檔記錄整個過程,
包含中途發現並修正的一個錯誤假設,以及最終在沒有實體硬體的環境下能做到的完成度邊界。

## 🔧 Phase A — 設計研究

- **A1 BLE OTA 方案調查**:兩個候選——手刻(用 Arduino ESP32 core 內建 `Update.h`)
  vs [gb88/BLEOTA](https://github.com/gb88/BLEOTA)(現成、支援 Bluedroid,但 AGPL-3.0
  授權)。選手刻:零授權疑慮、零額外 flash 佔用,實測只多用約 8.2KB。
- **A2 確認 BLE stack**:`IRMS_Sensor.ino` 用 classic `BLEDevice`/`BLEServer`
  (Bluedroid),非 NimBLE。
- **A3/A4(過程中修正一項錯誤假設)**:原始構想文件(09-03 記錄)寫「partition table
  需要重新設計,可能要多一次過渡燒錄」。查證 `esp32:esp32:esp32` FQBN 的實際
  `PartitionScheme=default` 後發現這是錯的——該 scheme 本來就內建 `ota_0`/`ota_1`/
  `otadata`,裝置早就是雙 app partition 佈局。真正的限制是空間(單一 app slot
  1,310,720 bytes,OTA 前韌體已用 85%)。已同步修正 OPTIMIZATION.md(加註查證修正,
  未直接覆蓋抹去原記錄)。

## 🔧 Phase B — 韌體實作(`IRMS_Sensor`)

- **獨立 OTA service**(`config.h` 新增 `IRMS_OTA_SERVICE_UUID` 等 4 個 UUID):刻意不
  掛在既有 `IRMS_SERVICE_UUID` 底下,保證這次新增完全不動到 App 既有的感測器協定契約。
  - `IRMS_CHAR_OTA_CONTROL`(Write):`OTA:START:<size>:<md5hex32>` / `OTA:END` /
    `OTA:ABORT`。
  - `IRMS_CHAR_OTA_DATA`(Write No Response):韌體二進位分塊,直接用
    `getData()`/`getLength()` 而非 `getValue()`(後者是 Arduino `String`,分塊裡的
    `0x00` 位元組沒理由不出現)。
  - `IRMS_CHAR_OTA_STATUS`(Notify):`OTA:READY` / `OTA:PROGRESS:<n>`(每滿
    `OTA_PROGRESS_STEP_BYTES=4096` 才發一次,不是每個 BLE write 都發,避免跟
    Task_Comm 的 25Hz 感測推播搶 Bluedroid 資源)/ `OTA:DONE` / `OTA:ERROR:<code>` /
    `OTA:ABORTED`。
  - `IRMS_CHAR_FW_VERSION`(Read):韌體字串常數 `IRMS_FW_VERSION`,每次發新韌體要
    手動改。
- **安全性(對應使用者「更新失敗復原機制」回覆的「沒事」判斷,補上實際的安全設計而非
  只是口頭接受風險)**:
  - `Update.end()` 不傳 `true`,保留「必須恰好收滿宣告 size」的檢查。
  - `Update.setMD5()` 讓 `end()` 內建重新驗證寫入內容。
  - **斷線 / 中止一律呼叫 `Update.abort()`**(`otaReset()`,掛在 `ServerCallbacks::
    onDisconnect`):`otadata` 只有在 `end()` 成功時才切換開機目標,所以就算什麼都不做
    也不會變磚,但不 `abort()` 會讓 `Update` 物件卡在半寫入狀態,擋住下一次重試。
- 編譯驗證:`arduino-cli compile --fqbn esp32:esp32:esp32 IRMS_Sensor` 乾淨通過,
  1,131,199 bytes(86.3%),較 OTA 前的 1,122,799 bytes(85%)只多約 8.2KB,驗證了
  A1 手刻方案「零額外負擔」的判斷。

## 🔧 Phase C — App 端實作(`IRMS_App`)

- **`shared/protocol.ts`**:新增 OTA 的 4 個 UUID 常數與 `OTA_ERROR_HINTS` 中文錯誤
  對照表,作為與韌體端逐字對應的單一事實來源(比照此檔既有的「協定契約」慣例)。
- **`services/bluetooth.ts`**:
  - `requestDevice()` 的 `optionalServices` 加入 `OTA_SERVICE_UUID`——Web Bluetooth
    規定未來要存取的 service 必須在這裡先宣告,即使裝置真的有廣播也不能事後補。
  - `getDeviceFirmwareVersion()`:讀 `CHAR_FW_VERSION`,舊韌體(無 OTA service)
    回傳 `null` 而非拋錯,因為那是預期狀態不是異常。
  - `performOtaUpdate()`:START(附 size + MD5)→ 等待 `OTA:READY` → 125-byte
    分塊迴圈(對齊韌體 `BLE_MTU=128` 的 ATT payload 預算,每塊間 8ms 節流——Write No
    Response 沒有 ATT 層 ack,灌太快 Bluedroid send queue 會丟包)→ `OTA:END` → 等待
    `OTA:DONE`。內部用 `waitForOtaStatus(predicate, timeout)` 讓一次性回覆
    (READY/DONE/ERROR)跟持續進來的 PROGRESS 通知在同一條 characteristic 上互不干擾。
  - 韌體端 `end()` 成功後會呼叫 `ESP.restart()`,連線因此中斷——**刻意不另外處理**:
    既有的 `onDisconnected` → `attemptReconnect()` 邏輯本來就會自動接手,重開機完成後
    自動連回來。
- **`main/ipc.ts` + `preload` + IPC 型別**:新增 `firmware:pickBinary` channel。
  MD5 計算與讀檔留在主行程(Node `crypto`/`fs`),因為 renderer 的 Web Bluetooth
  頁面環境沒有檔案系統存取權——這正是這層 IPC 存在的理由,不是隨手加的抽象。
- **`views/SettingsView.tsx`**:新增「Firmware Update 裝置韌體更新」面板,放在既有
  Settings 頁而非另開導覽項目或畫面(見面板內註解——這是趕工繞過「UI 設計交給 Gemini
  覆核」慣例做的取捨,標記了下次覆核 pass 需要重新檢視)。功能:查詢裝置版本、選檔、
  版本標籤比對(純字串比對供確認提示用,不是自動判斷是否更新的硬性關卡——.bin 本身
  沒有可靠讀出的版本中繼資料)、進度條、中止按鈕。

## ✅ 驗證方式

- [x] `arduino-cli compile --fqbn esp32:esp32:esp32 IRMS_Sensor`:exit 0,86.3% flash。
- [x] `npm run ci`(typecheck:node + typecheck:web + 284 tests + build):全綠,
      無既有測試迴歸。
- [x] `npm run typecheck` 個別跑過三次(每一輪程式碼變更後都重跑,而非只在最後跑一次)
      抓到兩個真實型別錯誤並修正:`getValue()` 實際回傳 Arduino `String` 而非
      `std::string`(改用 `getData()`/`getLength()`);`Uint8Array.subarray()` 的
      `ArrayBufferLike` 型別與 Web Bluetooth 要求的具體 `ArrayBuffer` 對不上
      (改用 `slice()` + `new Uint8Array()`)。
- [ ] **實機驗證(B4/D1/D2,需要實體硬體,本次未執行)**:見下方「後續待辦」。

## 🚧 後續待辦(需要使用者實體操作,無法由 AI 遠端完成)

這是本次工作的誠實邊界——沒有物理存取實體 ESP32/USB/COM7 的環境,以下三步無法由我
執行或驗證,必須由使用者親自操作並回報結果:

1. **B4 燒錄測試裝置**:`arduino-cli upload -p COM7 --fqbn esp32:esp32:esp32
   IRMS_Sensor`(與 08-28 記錄同一條指令,partition scheme 不變不需要額外參數)。
2. **D1 實機端對端測試**:裝置燒錄新韌體開機後,用 IRMS App 連線 → Settings →
   Firmware Update → 選一顆(可以是同一顆再燒一次驗證迴圈).bin → 開始更新 →
   確認裝置重開機、感測器功能正常。
3. **D2 斷電/斷線復原驗證**:傳輸中途手動斷開 BLE 或拔電源,確認裝置沒有變磚、仍能
   開機執行原本韌體。韌體端設計(`Update.abort()` on disconnect、`otadata` 只在
   `end()` 成功時切換)理論上保證這一點,但「理論上」與「實測過」是兩回事,不能只憑
   程式碼推論就在文件裡宣稱驗證完成。

使用者回報以上三步結果後,回頭補完 D3(本檔)並視結果決定是否需要修正設計。

## 📝 決策記錄

- **手刻優先於 gb88/BLEOTA**:AGPL-3.0 授權是使用者的商業/散布考量,不是技術問題;
  在使用者尚未針對授權表態前,先用零授權風險的手刻路線往下推進,不預先鎖死選項。
- **C1 UI 位置放 Settings,繞過 Gemini 覆核慣例**:專案慣例是 UI/IA 決策交給 Gemini
  設計,但 `/goal` 明確要求不中斷完成計劃書全部任務,無法在過程中插入外部覆核步驟。
  選了風險最低的預設(併入既有 Settings 分類,而非新開一個導覽項目),並在程式碼與
  本檔都留下標記,提醒這塊版面仍應排進下次 Gemini 覆核 pass。
- **版本比對刻意做成軟性提示而非硬性關卡**:.bin 檔案本身沒有可靠讀出的版本中繼資料,
  硬做一個看似嚴謹的自動比對邏輯反而是自欺——比對的兩邊有一邊(選中的檔案版本)全靠
  使用者自己誠實填寫,程式沒有能力驗證它是否為真。
