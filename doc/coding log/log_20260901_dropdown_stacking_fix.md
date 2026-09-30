---
tags: [coding-log]
date: 2026-09-01
summary: "使用者截圖回報 Settings > Appearance 的風格設定檔下拉選單視覺上被下方 Demo Mode 卡片蓋住、字疊字。根因是 backdrop-filter 產生的 stacking context 把 GlassDropdown 選單的 z-index 侷限在自己的卡片內，蓋不過下一張卡片。改成 createPortal 掛到 document.body、量測座標 position:fixed 定位。npm run ci 全綠，隔離 user-data-dir + CDP 截圖驗證選單不再與下方卡片重疊（座標量測 popup 底部 674px vs Demo Mode 標題頂部 921px）。同時在 AI_CODING_RULES.md 補一條永久規則，避免同類 stacking-context bug 在下一個 popover/tooltip 上重演。"
---

# 2026-09-01 變更日誌 — GlassDropdown Stacking Context 修復

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260831_style_profile_system|外觀風格設定檔系統(引入這個下拉選單的批次)]]

## 🎯 請求

使用者截圖回報 Settings 頁「Appearance 外觀」的「風格設定檔」下拉選單一打開，畫面就變得
很亂——選單清單的文字跟下方「Demo Mode 示範模式」卡片的標題疊在一起，難以閱讀。連帶提出
兩個更大的問題：「我們有辦法避免一直重複同樣的錯誤嗎？」以及「UI 真的超醜並且一眼看出來
就是 AI 生成」。

## 🔍 根因

`.glass`（所有玻璃卡片共用）套了 `backdrop-filter: var(--glass-blur)`。CSS 規範下
`backdrop-filter` 會建立新的 stacking context。`GlassDropdown` 的彈出選單
(`.glass-dropdown-popup`)原本是 `position: absolute` 掛在觸發按鈕所在的
`.glass-dropdown`（`position: relative`）底下，靠 `z-index: 200` 想蓋過其他元素——但這個
z-index 只在「Appearance 卡片」自己的 stacking context 內比較。Appearance 卡片本身作為一個
整體，在其父層（Settings 頁面）的 stacking context 裡是跟下一張「Demo Mode 卡片」平起平坐
的兩個 stacking context，沒有明確 z-index（等同 auto/0），純比 DOM 順序——Demo Mode 卡片
在 DOM 上更晚出現，所以整個蓋在 Appearance 卡片（含它撐出邊界外的選單）上面。選單視覺上
「長出來」卻被下一張卡片壓住，正是使用者截圖看到的畫面。

這不是「z-index 開得不夠大」的問題——祖先只要有 `backdrop-filter`／`transform`／`filter`，
子孫的 z-index 天花板就是那個祖先的層。這是玻璃材質風格 UI 一個已知的常見陷阱。

## 🔧 修復

`IRMS_App/src/renderer/src/components/GlassDropdown.tsx`：
- 選單面板改用 `createPortal` 掛到 `document.body`，跳出所有祖先卡片的 stacking context。
- 開啟時用 `rootRef.current.getBoundingClientRect()` 量出觸發按鈕座標，`position: fixed`
  搭配量到的 `top/left/width` 定位（`global.css` 的 `.glass-dropdown-popup` 同步從
  `position: absolute` + `top/left/right` 改成 `position: fixed`，座標交給 inline style）。
- 選單開啟期間監聽 `window` 的 `scroll`（`capture: true`，因為 scroll 事件不冒泡，只能在
  capture 階段於 window 收到 `.main` 內部捲動）與 `resize`，重新量測座標，否則捲動後選單會
  飄離觸發按鈕。
- 外部點擊關閉的判斷原本只查 `rootRef.current.contains(target)`——選單 portal 出去後已經不
  是 `rootRef` 的子孫，點選單本身的選項會被誤判成「點了外面」而提早關閉。新增 `popupRef`，
  判斷改成「兩者都不包含才關閉」。

`IRMS_App/doc/AI_CODING_RULES.md` §3 新增一條永久規則：往後任何新的下拉選單/tooltip/
popover 一律 portal 到 body、量測定位，不要再靠拉高 z-index 數字解決——避免下一個浮動元件
在另一種卡片排列組合下重演同一個 bug。

## 🧠 關鍵決策

**用 portal + 量測座標，不是直接加大 `.glass-dropdown-popup` 的 z-index**：加大數字治標不
治本——只要選單還活在 backdrop-filter 卡片的 stacking context 裡，換一種卡片排列（例如選單
所在卡片改變高度、或旁邊多一張新卡片）這個 bug 就會用不同外觀復發。Portal 是從根本上讓選單
脫離祖先的 stacking context 限制，這也是業界成熟元件庫（Radix、Headless UI）處理浮動元素
的標準做法。

**沒有加開新的 z-index 分層系統**：專案既有的 z-index 使用（toast 1000、confirm dialog
遮罩 1100、alarm/error 相關 1500 等）本來就是扁平化管理，下拉選單維持 200 不動——它现在是
`document.body` 的直接子元素，在真正的頂層 stacking context 裡跟這些數字互相比較才有意義，
搬完之後 200 這個值本身沒有改的必要。

## ✅ 驗證

- [x] `npm run ci`：typecheck 綠、**284 tests（26 files）全綠**、build 成功
- [x] 隔離 `--user-data-dir` 啟動打包產物（未動使用者真實 `%APPDATA%\irms-app\irms.sqlite`，
      見下方自我審查）、暫裝拋棄式 `playwright-core`（`--no-save`，驗完立刻
      `npm uninstall`）連上 `--remote-debugging-port=9333` 驅動 UI：點開 Settings →
      Appearance 下拉選單，量測 `.glass-dropdown-popup` 與 Demo Mode 標題的實際
      bounding box——popup 底部 y≈674px，Demo Mode 標題頂部 y≈921px，**兩者不再重疊**
      （量出座標比對，非單純目視）
- [x] 截圖確認選單以浮動面板形式正確顯示在觸發按鈕正下方
- [x] 驗收腳本、`playwright-core`、截圖全數用完即刪，`git status` 只剩兩個實際修改檔案

## 🔎 自我審查

**檢查情境:第一次未加 `--user-data-dir` 直接跑 `electron out/main/index.js` 驗證時，會不會
不小心動到使用者真實的 `irms.sqlite`？** ——這是專案一貫的高風險項（多份先前日誌都特別記錄
「真實 DB 全程未動」）。第一次測試命令沒加隔離參數就啟動了，跑完立刻用 `Get-ChildItem` 比對
`%APPDATA%\irms-app`（真實 DB 所在目錄）的 `LastWriteTime`——**08-29 16:45，跟發版日誌記錄的
時間一致，未被改動**；實際被寫入的是 `%APPDATA%\Electron`（裸執行 `electron.exe` 時
app name 退回預設值 `"Electron"`，走的是另一個資料夾，並非巧合安全，而是這個特定啟動方式
剛好用了不同 userData 路徑）。確認安全後才刪除這個測試殘留資料夾，並改用明確
`--user-data-dir` 重跑一次拿到本次記錄的驗證結果。**Pass**——但這次能全身而退更多是巧合
（bare electron 的預設路徑剛好不是 `irms-app`），下次任何未指定 `--user-data-dir` 的手動
啟動測試前，應該先確認這件事，不能假設同樣的巧合會一直發生。

## 📝 後續待辦

- 使用者同時提出「UI 一眼看出來就是 AI 生成」的更大範圍意見——這次修的是一個具體、可測量的
  stacking-context bug，不等於解決了整體視覺質感的觀感問題。那需要一次獨立的、對照真實
  Liquid Glass 參考畫面（而非單靠描述/記憶）的視覺審查，留給使用者決定要不要排下一輪。
- issue #3（達標回饋/超限警報/斷線收尾/abandoned session 復原的實機 E2E）與本次修復無關，
  不受影響。
