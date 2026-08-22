---
tags: [coding-log]
summary: "issue #2 的兩塊硬體阻塞各拆掉一塊,韌體改動已由 arduino-cli 編譯驗證(未燒錄)。App 端 parseAnglePacket 從『整包缺 Roll 就整包丟棄』改為逐軸降級——T:/S: 在 20 bytes 的 MTU-23 切點下必定存活而判定只讀 Pitch,丟整包會讓一條臨床正確的資料流變成空白;新增 hasRoll/truncated 旗標,校準精靈外展步驟與 Settings 快速歸零依此可見地示警,不再靜默把 Roll 讀成 0。韌體端補上 onMtuChanged 印出實際協商到的 MTU、config.h 算出封包需要的最小值,並把封包組裝與 BLE notify 解耦,開啟預設常駐的 Serial 遙測——此前 60 秒旋轉記錄必須先有 App 連線才拿得到資料,而 App 連線正是這份記錄要驗證的東西。163→173 tests,`npm run ci` 全綠;`arduino-cli compile --fqbn esp32:esp32:esp32` 兩次(改動前後)皆 exit 0、85% flash。issue #2 唯一剩下的是實機旋轉記錄本身。"
date: 2026-08-22
---

# 2026-08-22 變更日誌 — MTU 截斷診斷 + 韌體序列遙測(issue #2 桌面部分)

> **相關文件**:[[HOME|導覽首頁]] · [[PROJECT_STATUS|開發進度]] · [[ROADMAP|架構與代碼計畫]]

## 🎯 目的

issue [#2](https://github.com/yuhina0515/IRMS/issues/2) 列出兩件「不需要患者、只需要桌上兩塊板子」就能推進的事:
驗證 MTU 是否真的協商到 128、拒絕靜默降級。兩者都是桌面工作,不需要人上身,
所以在拿到裝置前先把能做的部分做完——第二部分實際發現的問題比原先設想的更值得動手修。

## 🔧 變更內容

### App 端:`parseAnglePacket` 從整包丟棄改為逐軸降級

讀 issue 原文時它假設的修法方向是「偵測到截斷就整包丟棄」。實際看 `computeMetricSample`
才發現這個方向是錯的:判定只讀 Pitch(`thigh`/`shin`/`knee`),完全不碰 Roll。而 6 軸封包
滿刻度 `T:-180.0,S:-180.0,K:360.0,TR:...` 前 18 bytes 就是 `T:`/`S:`,在 MTU-23 → 20 bytes
的切點下**必定完整存活**。整包丟棄會把一條臨床上仍然正確的 Pitch 資料流變成什麼都不顯示——
比原本的缺陷(靜默 Roll=0)矯枉過正。

於是改成:
- T/S 缺席或不合法 → `malformed`(判定來源不可信,必須拒絕)
- 尾端欄位被切碎(如 `K:`、`TR:` 缺對應的 `SR:`)→ 丟掉該欄、升起 `truncated`
- 中段就壞掉(不是切在尾端)→ 仍是 `malformed`,那是亂碼不是截斷
- `hasRoll` 與 `truncated` 分開:前者答「這封包本來有沒有 Roll」(3 欄舊封包 hasRoll=false
  但 truncated=false),後者答「Roll 有沒有真的送達」(MTU 截斷兩者皆 true)。切點剛好落在
  數值邊界時兩者無法區分,`truncated` 回報 false——寧可漏報也不誤報。
- `Number('')` 是 `0` 不是 `NaN`,只看 `isFinite` 會讓 `K:` 這種截斷殘骸過關,故另外檢查空字串。

`hasRoll`/`truncated` 接到兩處實際會用到 Roll 的地方:
- 校準精靈步驟 5(外展,只影響顯示方向)在 `linkTruncated` 時顯示警告並停用捕捉按鈕——
  對著恆為 0 的 Roll 校方向會得出一份看似成功、實則無意義的校準。
- Settings 快速歸零仍照常套用(Pitch 那一半是真的),但 toast 文字從「已套用快速歸零校準
  (含 Roll)」改為視 `linkTruncated` 誠實區分,不再宣稱做了沒做到的事。

### 韌體端:MTU 診斷 + Serial 遙測

- `config.h`:算出 `PACKET_MAX_BYTES = 54`、`MTU_MIN_REQUIRED = 57`(ATT notify 承載 =
  MTU − 3),供 `onMtuChanged` 判斷用。
- `ServerCallbacks::onMtuChanged`:印出實際協商到的 MTU,並在低於門檻時明講「TOO SMALL」。
  `BLEDevice::setMTU(128)` 只是請求,真正生效值由對端協商,原本韌體完全不回報協商結果,
  故障只能靠症狀(Roll 恆 0)反推成因——這是最難查的一種。
- `Task_Comm` 與 `IRMS_CHAR_ANGLE_TX` notify 解耦:原本封包組裝與 BLE 推播綁在同一個
  `if (deviceConnected)`,導致**唯一的資料出口是 BLE**——但 60 秒旋轉記錄的目的正是驗證
  BLE 這條鏈路本身,先決條件卻是它已經工作,邏輯上循環。新增 `SERIAL_TELEMETRY`(預設
  開啟)後,封包在「已連線」或「開了序列遙測」任一條件下就組裝,同一個字串同時送 BLE
  notify(若已連線)與 Serial(若開啟遙測,格式 `<millis>\t<封包>`)。送出的是組裝完的
  完整封包,不是被 MTU 切過的結果——序列代表感測器算出什麼,BLE 代表 App 收到什麼,
  兩者原本就該分開看。
  - UART0 在 115200 baud、25Hz × 約 65 bytes ≈ 16 kbps,是真 UART 不是 USB CDC,沒有讀取端
    也不會阻塞,佔用可忽略。

## 🧠 關鍵取捨

**為何不索性把 MTU 檢查做成拒絕連線?** 沒有那個必要也沒有那個手段——`BLEServer` 拿不到
「協商失敗就拒絕」的掛勾,而且即使協商到 23,Pitch 仍然可用,拒絕連線反而讓能用的部分也不能用。
選擇「診斷可見 + App 端優雅降級」而非「韌體端強制」。

## ✅ 驗證方式

- [x] App:`npm run ci` 全綠(typecheck + vitest + build)。**163 → 173 tests**。10 個新增的
      MTU 截斷測試在舊版 parser 上跑會失敗(已用 `git stash` 驗證,9 個失敗)。
- [x] 韌體:`arduino-cli compile --fqbn esp32:esp32:esp32 IRMS_Sensor`,**改動前後各跑一次**,
      皆 exit 0。改動前 1122179 bytes(85%),改動後 1122799 bytes(85%),成長 620 bytes。
- [ ] **尚未實機驗證**:`onMtuChanged` 的實際輸出、Serial 遙測的真實資料格式、
      MTU 是否真的卡在 23——這些都需要真裝置,留給 issue #2 剩下的旋轉記錄步驟。

## 📝 後續待辦

issue #2 剩下且唯一需要硬體的部分:拿到裝置後燒錄本次韌體,直接看 `onMtuChanged` 的
Serial 輸出確認協商結果,再做 ~60 秒的雙板 ±180° 旋轉,`SERIAL_TELEMETRY` 讓這次不必先
連上 App 就能擷取。記錄下來後可直接餵 App 的 `parseAnglePacket` 當測試 fixture。
