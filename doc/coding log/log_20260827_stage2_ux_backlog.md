---
tags: [coding-log]
summary: "清空 P2 使用者體驗 backlog(Stage 2):重連進度改用結構化 store 欄位——原本寫進 statusText 的計數器會被下一行 connectGATT 的『Connecting...』蓋掉,自 2026-06-27 起從來沒有被看見過,而這條路徑要拔電池才重現得了,測試以注入假裝置驅動私有重連迴圈;內外翻曲線走獨立右側軸(帶符號、量級只有矢狀面的十分之一,共用刻度會被壓成貼底直線),新增 Settings 欄位一併把 persist version 4→5,因為 migrate 只在版本落後時才會跑;動作查詢抽成純函式 actionQuery.ts,並把『沒有動作』與『搜尋不到』拆成兩種出口;鍵盤快捷鍵走與按鈕完全相同的守衛,handler 為 null 時不掛 listener。過程中發現 contenteditable 守衛在 jsdom 下形同虛設(jsdom 未實作 isContentEditable),改為同時查最近的 contenteditable 祖先。253→281 tests,npm run ci 全綠。"
date: 2026-08-27
---

# 2026-08-27 變更日誌 — Stage 2:P2 使用者體驗 backlog

> **相關文件**:[[HOME|導覽首頁]] · [[OPTIMIZATION|優化待辦]] · [[PROJECT_STATUS|開發進度]] ·
> [[log_20260827_ingest_seam_simulator_demo_mode|同日 Stage 1:ingest 接縫與示範模式]]

## 🎯 目的

Stage 1 建好無硬體演練基建之後,把 [[OPTIMIZATION]] 的 🟢 P2 清單清空。
四項全部是「坐在桌前就能做」的,依專案規則 #3 不佔用 issue。

## 🔨 變更

### 2.1 重連進度

**這不只是新功能,是修一個從來沒被發現的缺陷。** `attemptReconnect` 自 2026-06-27 起
就會寫 `setStatus('Reconnecting (n/5)...')`,但它下一行呼叫的 `connectGATT()` 開頭就是
`setStatus('Connecting...')`——**計數器在同一次嘗試內就被自己蓋掉**,從來沒有被看見過。
`setConnection` 另外還會無條件覆寫 `statusText`。

改用結構化欄位 `useStore.reconnect: { attempt, max } | null`,成功/耗盡/手動斷線時清空。
`TopHeader` 畫確定性軌道而不是無限旋轉的 spinner:spinner 只說「正在忙」,
而使用者要判斷的是「還會不會好、還是該去看裝置」,那取決於還剩幾次。

**這條路徑此前無法驗證**——重現得真的把 ESP32 電池拔掉,而裝置不在手邊。
測試以注入假裝置驅動私有的重連迴圈(`BluetoothService` 是無 DI 的模組單例,
那是 ingest 接縫刻意的取捨,`device` 是它唯一的外部依賴)。其中一個測試直接釘住
原缺陷:一拍之後 `statusText` 已經是 `'Connecting...'`,但結構化欄位仍說得出是第 1/5 次。

### 2.2 內外翻(Varus/Valgus)曲線

`Settings.showKneeRoll`,預設關閉。只畫 `kneeRoll` 而非三條 roll 全上:
`kneeRoll` 是帶符號的 `shinRoll − thighRoll`(正=外翻、負=內翻),也就是臨床上
真正被判讀的量;個別肢段的 roll 只是它的組成成分。

**走獨立的右側 y 軸**:它是帶符號、量級只有 ±15° 的量,和 0–150° 的矢狀面角度
共用刻度會被壓成一條貼底的直線——看起來像「沒有變化」,而那正好是內外翻最需要
被看見的時候會說的謊。隱藏時仍持續 push 資料,打開切換立刻有歷史曲線。

提示文字明寫**不參與達標與超限判定**,免得有人把一條純顯示的線讀成判定依據。

**persist version 4→5。** bump 才是修正,而且理由與直覺不同:`migrateSettings` 是
`{...DEFAULT_SETTINGS, ...rest}`,本來就補得了新欄位——但 `migrate` **只在 persisted
version 落後時才會被呼叫**。版本不動就不會跑,zustand 預設的淺層 merge 會拿舊的
`settings` 物件整個蓋掉初始值,新欄位變成 `undefined`,而 UI 上的表現是
「開關永遠打不開而且沒有錯誤訊息」。已補迴歸測試。

### 2.3 動作搜尋 / 排序 / 分組

抽成純函式 `services/actionQuery.ts`。`ActionsView` 已 306 行(新增/編輯 Modal、
Record Pose 即時取樣、還原預設、刪除確認),再塞一個查詢狀態機進去,
唯一能驗證它的方式就只剩「把 app 開起來一個一個點」。

兩個關於「可信」而非「正確」的細節:名稱排序用 `localeCompare('zh-Hant')`,
因為動作名稱是中文,碼位排序會得到看起來像隨機的順序;目標角度相同時退回名稱排序,
否則兩個 90° 的動作每次重繪順序都可能不同,而**清單自己在跳會被讀成資料變了**。

UI 端把此前混為一談的兩種空狀態拆開:「此協定尚無動作」給的是載入範本,
「搜尋不到」給的是清除搜尋。混成同一句會讓使用者按下一個幫不上忙的按鈕。

### 2.4 鍵盤快捷鍵

`useGlobalShortcut` 比照 `useEscapeKey` 的單一 listener 紀律。三道硬性讓路條件:
焦點在可輸入元素、有 modal 開著(重用 `escapeStackDepth()`,不另外維護一份狀態)、
沒有 Ctrl/Cmd。單鍵快捷鍵在這個 app 不安全——畫面上永遠有數值輸入框,
而且患者可能正在療程中,誤觸的代價是中斷一場正在錄的 session。

Ctrl+K 連線切換、Ctrl+Enter 開始/結束 Session。**兩個呼叫端都走與按鈕完全相同的
守衛**,不可用時傳 `null` 讓 hook 根本不掛 listener。快捷鍵若自己再判斷一次條件,
兩邊遲早分歧,而分歧方向通常是快捷鍵比較寬鬆——在這裡就是繞過未支援協定的封鎖
(產生資料與標籤對不上的紀錄)或在示範模式下連上真實裝置。

## ✅ 驗證

- **`npm run ci` 全綠**:typecheck + **281 tests / 25 files** + build(Stage 1 結束時 247)。
- **突變測試**:拿掉 `setReconnect` 呼叫,重連測試轉紅 2 個。
- **實機執行**:重新打包後以隔離 `--user-data-dir` 啟動,乾淨開機、無 console 錯誤、
  migration 1–7 全數套用。使用者真實資料庫 md5 前後相同。

## 🔍 自我審查

**場景:守衛在測試環境裡是不是真的有作用?**

`contenteditable` 的測試第一次就紅了,追下去發現原因不是程式錯,而是
**jsdom 沒有實作 `isContentEditable`**。也就是說,如果我當初把那個測試寫成通過
(或乾脆不寫),那道守衛在測試裡永遠是 false 分支,**測試會綠而守衛從未被驗證過**——
一個給出假信心的綠燈。

改為同時走 `closest('[contenteditable]')`:兩個環境都可靠,而且順帶涵蓋
「焦點在 contenteditable 的內層子元素」與明確寫 `contenteditable="false"` 兩種情況,
比原本只查 `isContentEditable` 更正確。

## ⚠ 尚未驗證

- **UI 仍未經目視驗收**(與 Stage 1 相同的限制:本次環境無法截圖)。
  重連進度軌道、內外翻曲線的右側軸、分組標題、搜尋空狀態都只由元件測試涵蓋。
- **實機**:issue #3 完全未動。
- 內外翻曲線的右側軸範圍(±20°)是依 `SEGMENT_KNEE_MAX` 等既有常數推估的,
  **未經真實內外翻資料驗證**;拿到裝置錄到實際 roll 之後應重新檢視。

## 📌 下一步

[[OPTIMIZATION]] 的 🟢 P2 清單已清空。桌面端剩下的都是被會議明確延後的大項
(i18n、ESLint、簽章、多關節泛化)或需要實機的 issue。
**下一個真正有價值的動作是拿到裝置跑那份 ~30 分鐘的驗證腳本**
(見 [[log_20260827_ingest_seam_simulator_demo_mode|Stage 1 日誌]]),
以及在有螢幕存取時把兩批 UI 改動一次目視驗收完。
