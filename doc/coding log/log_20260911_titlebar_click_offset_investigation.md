---
tags: [coding-log, bug, tauri-migration]
date: 2026-09-11
summary: "Investigated the user's report that IRMS_App_Tauri's minimize/maximize/close buttons misbehave. Reproduced it precisely: the buttons render at the correct visual position (screenshot-confirmed) but real mouse clicks there do nothing — actual click hit-testing is offset ~28-45px above where the buttons are painted, only reachable near the very top edge of the window. Fixed one confirmed, independently-real bug (drag-region CSS using Electron's -webkit-app-region, unreliable on WebView2) but that did NOT explain this offset. Two candidate fixes for the deeper coordinate mismatch (forcing a resize after show, shadow:false) were tried and both failed to change the measured offset. Root cause is unresolved — matches a known, still-open class of Tauri Windows decorations:false bugs (upstream issues #11296/#14859) rather than anything specific to this app's code."
---

# 2026-09-11 變更日誌 — TopHeader 視窗控制鈕點擊偏移調查

> **相關文件**:[[HOME|導覽首頁]] · [[TAURI_MIGRATION_PLAN]]

## 🎯 目的

使用者回報:「昨天試有很多地方似乎功能異常,例如右上角的縮小、放大、關閉」。這篇記錄
完整的調查過程與目前的真實狀態——包含**已經修好的部分**與**還沒修好、需要繼續調查的
部分**,不誇大也不隱瞞任何一邊。

## 🔧 動作與發現

### 1. 實測重現(不是憑程式碼推論)

啟動 `IRMS_App_Tauri` debug build,用三種獨立方法交叉驗證:

1. **螢幕截圖**:縮小/放大/關閉三顆按鈕視覺位置完全正常,清楚可見。
2. **UI Automation 的 Invoke pattern**(直接呼叫按鈕的無障礙介面,不經過滑鼠):
   成功觸發縮小,視窗真的變成 `IsIconic=true`——代表 `irms.windowControls.minimize()`
   → Tauri command 這條路徑本身沒有問題。
3. **真滑鼠點擊**(`SetCursorPos` + `mouse_event`,模擬使用者真正的操作):在按鈕**視覺上
   看到的座標**點擊,完全沒反應。改成點擊 UI Automation 回報的座標(比視覺位置高約
   28–45px,大半在視窗外)才會觸發。

三者合起來的結論:**按鈕畫的位置是對的,但滑鼠點擊判定的座標系統跟畫面實際渲染的座標系統
對不起來,差了將近一個標題列高度**——這不是「使用者可能沒點準」,是這個座標系統性地錯位,
真人操作幾乎不可能點中。

### 2. 修掉一個真實、獨立成立的 bug:拖曳判定機制

`TopHeader.tsx`/`tailwind.css` 從 Electron 版原封不動搬過來 `-webkit-app-region: drag`
(整條 bar)+`no-drag`(按鈕例外)這組 CSS。這是 Chromium 專有屬性,Tauri 官方文件明講
WebView2 上不可靠,巢狀的 `no-drag` 例外常常失效。改成 Tauri 官方的
`data-tauri-drag-region` attribute(只認滑鼠事件的實際 target 本身,按鈕沒有這個屬性天生
不會被攔截,不需要手動標記例外)。**這是一個真的該修的 bug,獨立於下面那個還沒解決的問題
成立**——即使它不是使用者這次回報症狀的主因,放著不修遲早會在別的地方發作(拖曳整條 bar
本來就沒有真的在動)。

### 3. 兩次嘗試修正座標偏移,都沒有解決

- **嘗試一**:主視窗建立時是 `visible:false`(見 `lib.rs`,故意隱藏到 splash 動畫決定
  何時顯示),猜測「視窗在隱藏狀態下從未真的收到過一次 resize 事件,導致 WebView2 內部
  的 hit-test 邊界跟顯示出來後的實際大小對不上」。在 `splash.rs` 的 `main.show()` 之後
  加一次 no-op 的 `set_size(inner_size())` 強迫 WebView2 重新同步邊界。**重新編譯實測:
  沒有改變偏移量,真滑鼠點視覺座標依然沒反應**。
- **嘗試二**:查到 Tauri 官方 repo 有多筆同類「`decorations:false` 在 Windows 上仍殘留
  原生標題列相關幾何」的懸而未決 issue([#11296](https://github.com/tauri-apps/tauri/issues/11296)、
  [#14859](https://github.com/tauri-apps/tauri/issues/14859)),其中一則提到
  `shadow:false` 組合。在 `tauri.conf.json` 主視窗加上 `"shadow": false` 重新編譯實測:
  **同樣沒有改變偏移量**。

兩次嘗試都已經還原,沒有留下沒有效果的程式碼在 repo 裡(避免之後有人誤以為這是「已修復」
的防線)。

### 4. 目前的結論

這個偏移量(視覺渲染 vs. 滑鼠點擊判定,相差約一個標題列高度)符合 Tauri 在 Windows 上
`decorations:false` 這條路徑一個已知、目前仍未在上游解決的問題類別,不是這個專案自己寫
出來的邏輯錯誤——`ble.rs`/`commands.rs`/`irmsApi.ts` 這幾層都已經個別驗證過(UI
Automation Invoke 成功證明後端指令沒有問題),問題出在 WebView2 embed 進 Win32 視窗、
拿掉原生裝飾之後,滑鼠事件座標系統與繪圖座標系統的同步時機。

## 📐 決策

- **不繼續盲猜第三、第四個修法**——已經用兩個有憑有據的假設(隱藏視窗未觸發 resize、
  已知的 shadow/decorations 組合問題)各試過一次,都用「改前壞、改後測」的方式驗證過
  沒有效果,而不是猜完就假設有效。繼續盲猜下去邊際效益遞減,誠實回報現況、交由使用者
  決定要不要投入更多時間,比自己悶著頭再試三次更負責任。
- **`data-tauri-drag-region` 這個修正照樣進版控**,即使它沒有解決使用者回報的主要症狀——
  它本身是一個獨立成立、有實測根據的 bug 修正(拖曳判定機制在 WebView2 上原本就不可靠),
  不應該因為沒解決「更大」的問題就連小的一起擱置。
- **沒有因此發一個新的 beta 版**——目前這個偏移量仍然存在,發版只會讓使用者以為「這版
  應該修好了」再去重複同一個踩雷。等座標偏移問題真的有解法或決定的因應方式後再一併發版。

## ✅ 驗證

- `npm run ci`(typecheck + test + build)全綠,確認 drag-region 修正沒有破壞既有邏輯。
- `cargo check`:`splash.rs` 還原後與修改前的行為等價(純還原,無 diff)。
- 座標偏移本身:**已重現但未修復**,如上述三方法交叉驗證的結果。

## Self-review

檢查情境:「會不會其實我的測試環境(這台機器目前的螢幕/DPI 設定)才是製造這個偏移量的
原因,使用者自己的正常使用情境根本不會踩到?」——不太可能:使用者昨天在自己實際操作時
就已經回報同一類症狀(縮小/放大/關閉都異常),而這次調查是在同一台機器上獨立重現,兩者
時間點不同、操作者不同(這次是程式化模擬滑鼠,不是使用者手動點擊),卻得到一致的結果。
如果純粹是這台機器某次啟動的巧合,不會兩次都精準對上同一個症狀。**PASS(合理排除環境
偶然性),但這不是可以百分之百排除的證明**——如果之後在使用者自己的機器上這個偏移量的
實際數值(28–45px 這個區間)不一樣或消失,那就要重新檢討是否真的是同一個成因,不能直接
套用這篇的結論。
