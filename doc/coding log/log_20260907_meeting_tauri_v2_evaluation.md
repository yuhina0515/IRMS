---
tags: [coding-log, meeting, architecture]
summary: 三方會議評估 IRMS_App 是否該從 Electron 遷移到 Tauri v2 — 裁決是先花幾天做 BLE 可行性驗證,而非直接全面遷移或直接否決
date: 2026-09-07
---

# 2026-09-07 會議記錄 — 評估 Tauri v2 的技術變更

> **相關文件**:[[HOME|導覽首頁]]

## 問題

IRMS_App(Electron + Vite + React + TS 桌面 App,透過 Web Bluetooth 與自製 ESP32
穿戴式感測器溝通,含即時 25Hz 角度串流與 BLE OTA 韌體更新)是否應該從 Electron
遷移到 Tauri v2?若該遷移,遷移路徑與成本是什麼;若不該,理由是什麼、有沒有更好
的替代方案?

## 與會者與立場

- **遷移倡議者(pragmatist)**:主張遷移,但誠實標出代價——Web Bluetooth 在
  WebView2/Tauri 完全不存在,BLE 層(`bluetooth.ts`,~450 行)必須整段改寫成
  Rust + `btleplug`(透過 `tauri-plugin-blec`)。給出六階段遷移計畫,估計 ~85%
  程式碼(React UI、Zustand store、three.js/chart.js、protocol 解析、session 邏輯)
  可原封不動沿用。自評最弱點:拿一個已驗證好用的瀏覽器 BLE stack,換成一個
  維護者明講「Tauri 相關問題不歸我們管」的小眾 Rust crate。
- **風險分析師(status-quo advocate)**:主張不遷移,除非出現具體觸發條件
  (例如真的要出 macOS/Linux,或 WebView2 真的原生支援 Web Bluetooth)。核心論點:
  這是純 Windows 專案,沒有跨平台需求,現有 pipeline(`electron-updater` +
  NSIS + GitHub Releases)已經在跑,遷移等於重寫最關鍵的子系統卻換不到任何新能力。
  自評最弱點:DB 遷移成本被高估(migrations.ts 已經是 driver-agnostic 介面,
  已經測過 `node:sqlite`),且如果 WebView2 或 btleplug 生態成熟,論點會弱化。
- **硬體整合/獨立維護者觀點**:主張不遷移。聚焦在 BLE/OTA 是全 App 最難、風險最高
  的一塊,而這塊在 Tauri 完全沒有官方對應方案。估計整個遷移對這個同時維護四個
  其他系統(Discord bot、遊戲伺服器、路由器專案等)的獨立開發者是 2-3 個月的
  投入,換不到任何實際需要的能力。自評最弱點:拖延本身會讓未來遷移成本越滾越大
  (連當天才上線的開機動畫都會變成新的遷移負擔)。

## 交叉詰問關鍵發現

- **遷移方 → 風險分析師**:在程式碼裡找到一個風險分析師沒注意到的事實
  ——`main/index.ts` 的 `WINDOW_HAS_CUSTOM_TITLEBAR` handler 註解明講「留給未來
  行動/平板/穿戴平台(使用者規劃中的 Android/iOS/iPadOS/watchOS)」。這直接打臉
  風險分析師「沒有觸發條件」的說法:Electron 完全不可能做手機/平板/手錶版,
  Tauri v2 從 2.0 穩定版起把 iOS/Android 列為官方一級目標。同時指出「Bluedroid
  丟包」其實是 ESP32 韌體端的緩衝區問題,不是 Windows 端的 BLE stack 差異——
  Chromium 的 Windows BLE 後端跟 `btleplug` 一樣都走 WinRT,兩者用的底層可能是
  同一套,原本「換 stack 就沒有保證」的說法有點誇大。
- **硬體整合方 → 遷移方**:抓到遷移方 Phase 0 驗證範圍(1-2 天,單次配對+訂閱+
  OTA)沒有涵蓋兩個真正致命的風險:(1)GATT cache 在韌體版本更新後失效
  ——這是 WinRT BLE 後端已知的跨平台老問題,而這個 App 的 OTA 服務本身就是後來
  才加進韌體的,代表真實裝置的 GATT table 形狀已經變過一次;(2)25Hz 持續串流
  20-45 分鐘、疊加新增的 Rust→IPC→React 這道橋接層,從沒被驗證過長時間穩定性。
  也指出 Phase 2「thin client」的說法低估了範圍——auto-pairing 逾時/權限合約
  在 `btleplug` 完全沒有對應機制,是藏在裡面的第二個從零重寫。
- **風險分析師 → 硬體整合方**:指出「2-3 個月」是從通用 Electron→Tauri 遷移
  文章套來的籠統區間,不是針對 IRMS 這個具體 App 算出來的數字,文獻裡的實際
  分佈差異極大。更關鍵的是:硬體整合方自己已經點名唯一真正該驗證的未知數
  (btleplug 撐不撐得住這個 App 的 25Hz+OTA 負載),而遷移方提議的 Phase 0
  驗證本來就是用幾天成本回答這個問題——硬體整合方的論述完全沒提到這個驗證選項,
  是一個論證缺口。另外指出「BLE 留在 Electron、其餘搬去 Tauri」這種折衷方案
  聽起來便宜,實際上因為 BLE 目前跑在 renderer(`navigator.bluetooth`),要做到
  這件事得同時跑兩個 runtime(Electron sidecar + Tauri UI)——不是省了工作量,
  是疊加了工作量,還把 Tauri 唯一驗證過的好處(體積/RAM)直接抵銷。

## 裁決

**不做全面遷移。但也不永久關閉這個選項——先花幾天做一個範圍精確的 BLE 可行性
驗證,再決定。**

理由:
1. 三方獨立查證後一致確認同一個事實:Tauri v2/WebView2 完全沒有 Web Bluetooth,
   任何遷移都等於把這個 App 最關鍵的子系統整段搬到一個年輕的社群維護 Rust
   crate 上——這是真實、不可迴避的技術代價,不是誇大。
2. 但「沒有觸發條件」這個維持現狀的核心論點,被程式碼裡已經存在的「規劃中
   Android/iOS/iPadOS/watchOS」註解打了折扣——如果行動/穿戴裝置版真的是近期
   目標,那是 Electron 結構性做不到、Tauri 已經做得到的能力,跟 BLE 風險是
   完全獨立的另一條理由,值得使用者親自確認這是不是真實意圖,而不是四個月前
   隨手留下的規劃筆記。
3. 遷移方提出的「先做小規模驗證再決定」思路本身是對的,但驗證範圍抓得太窄
   ——沒涵蓋 GATT cache(韌體升級後)與長時間 25Hz 負載這兩個交叉詰問中揪出來的
   真正風險點。裁決是把驗證範圍**擴大**成明確涵蓋這兩項,而不是照单全收遷移方
   原本 1-2 天、單次連線的版本。
4. 「BLE 留 Electron、其餘搬 Tauri」這種折衷/漸進式遷移**不成立**——已被證明
   是雙 runtime、雙倍複雜度、還抵銷掉唯一驗證過的好處,不是一條可行的中間路線。

**具體建議動作:**
- 用幾天時間對著真實 ESP32 硬體做一個獨立的 Rust + `btleplug`(或
  `tauri-plugin-blec`)測試程式,不需要包成完整 Tauri App,只驗證兩件事:
  (a) 25Hz 角度通知 + OTA chunked write(125 bytes/8ms 節流)能不能在至少一次
  完整 session 長度(20-45 分鐘)內穩定不掉包;(b) 對裝置跑一次 OTA、韌體版本
  真的變了之後,重新連線能不能正確看到新的 GATT 特徵值,不需要手動忘記配對。
- 這個驗證結果是 go/no-go 的判準:兩項都過,才回頭認真評估遷移方的六階段計畫
  (但要把硬體整合方抓到的 auto-pairing 合約、updater 斷點成本重新估進去,
  「85% 可沿用」跟「2-3 個月」這兩個數字目前都沒有紮實根據,都需要重新推導);
  任一項不過,就把 Tauri 這個選項擱置,除非 WebView2 未來原生支援 Web Bluetooth
  或這個 crate 生態顯著成熟。
- 獨立於 BLE 驗證之外:請使用者直接確認「規劃中的 Android/iOS/iPadOS/watchOS
  companion app」是不是還在考慮範圍內——如果是,這件事本身就足以讓天秤傾向
  Tauri,不需要等 BLE 驗證結果。

## 留意的異議(最強的反面意見)

即使可行性驗證兩項都過關,也不代表遷移風險已經完全清空——硬體整合方點出的
Phase 2 範圍低估(auto-pairing 逾時/權限合約沒有 `btleplug` 對應機制)與
Phase 5 的更新管道斷點(連開發者自己拿來對真實硬體測試的那台機器,都得在
第一個 Tauri 版本手動重裝,沒有 auto-update 回退路徑)這兩點,都是「驗證會過」
但「真的動手做時間/風險仍然被低估」的執行面風險,不是可行性風險。若使用者決定
往下走,這兩點應該在動手前就先納入時程估算,而不是等到撞上才處理。
