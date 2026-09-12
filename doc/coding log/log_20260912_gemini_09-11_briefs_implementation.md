---
tags: [coding-log, ui, gemini-handoff]
date: 2026-09-12
summary: 裝好 Gemini CLI(取代原本的人工貼網頁流程,可直接非互動呼叫),用它分兩個獨立對話回答 doc/gemini-handoff-20260911/ 的兩份草稿——側邊欄遮擋標題、卡片漸進式資訊密度——並依既有委任慣例直接實作。過程中發現並修正 Gemini 方案本身兩處與實際程式碼不符的地方(假設了不存在的 persisted 欄位、修正範圍只涵蓋標題沒涵蓋整頁內容),都是靠 Playwright 截圖實際跑起來才抓到,不是讀程式碼能發現的。
---

# 2026-09-12 Gemini 09-11 兩份設計草稿實作

> **相關文件**:[[HOME|導覽首頁]] ·
> [[log_20260911_adaptive_layout_verification_and_gemini_briefs|09-11 草稿備妥的日誌]]

## 新工具:Gemini CLI

使用者裝了 `@google/gemini-cli`(`npm install -g`,已是登入狀態)。這取代了此前
「準備截圖+README、使用者手動貼到網頁版、把回覆帶回來」的人工流程
(見 [[feedback_irms_ui_design_delegated_to_gemini]])——現在可以用
`gemini --skip-trust -p "<prompt>"` 非互動呼叫,並讓它自己讀專案內的檔案(它有
自己的 `read_file`/`grep_search` 工具,是一個跟 Claude Code 同類的 agentic CLI)。
兩份草稿分別用**兩次獨立的 `gemini -p` 呼叫**送出,符合 `doc/gemini-handoff-20260911/
README.md` 原本就要求的「不要合併成一個問題」。

## Gemini 的回覆與人工核實

**01-progressive-card-density**:建議 Dashboard Stat 卡片與 Actions 動作卡片套用
CSS Container Query 做漸進式資訊丟棄,History/Settings 排除在外(表格結構+臨床關鍵
標記不能丟、表單應該 reflow 不是丟資訊)。給了完整的 Tier 分層與 CSS/TSX 範例。

**02-sidebar-overlap-with-header**:建議「動態偏移對齊」——標題隨側邊欄展開/收合
同步平滑挪動(`padding-left` transition,時間與 `.sidebar` 自己的展開動畫一致)。

兩份回覆都附了程式碼,但**依 [[feedback_irms_ui_design_delegated_to_gemini]] 的既有
紀律,可查證的技術細節仍要核實,不能照抄**:

1. Gemini 假設側邊欄收合狀態存在 `settings.sidebarCollapsed`(persisted store 欄位)。
   實際上 `Sidebar.tsx` 是刻意的本地 `useState`(程式碼註解:「收合狀態是暫態的畫面
   偏好,不是需要跨重啟記住的設定」)。改用純 CSS 一般兄弟選擇器
   `.sidebar:not(.collapsed) ~ .app-column .main` 達成同樣效果,完全不用把狀態往上
   提升到 App.tsx/store——比 Gemini 建議的方案更簡單,也不用動任何既有的狀態管理決定。
2. Gemini 建議把 Edit/Delete 按鈕轉成純圖示,並引用了 `EditIcon`/`TrashIcon`
   元件——這個專案目前沒有這兩個元件,是 Gemini 憑空假設的。按鈕維持文字,不為了
   這個功能臨時生出一套新圖示資產。

## 靠實際截圖才抓到的一個真實 bug

第一版把 164px 偏移量加在 `.page-header` 上,typecheck/build 都過。**用 Playwright
截圖實際跑起來才看到**:標題確實跟著側邊欄挪動了,但下面的整個頁面內容(警告橫幅、
面板、Stat 卡片列)沒有跟著動——側邊欄展開時,內容第一張卡片被蓋住一截,標題與內容
對不齊,比原本「整段都被蓋住」的舊 bug 還更奇怪。回頭看 `.app-column` 那段既有的
CSS 註解,其實早就寫明「the extra 164px overlays on top of **the content**」——蓋住
的從來就不是只有標題。修法:把偏移量從 `.page-header` 改移到 `.main`(整個視圖內容
的外層容器),標題與底下內容一起挪動。這正是專案自己「先看截圖再下判斷」的既有
教訓(見 08-27 日誌的類似案例)又發生了一次。

## 視覺驗收方法

這個環境沒有 Playwright 官方的 `chromium-cli` skill,改寫拋棄式 Playwright 腳本
(比照專案既有慣例:`npx --yes playwright`、`npm install --no-save playwright`
臨時裝、用完 `npm uninstall` 卸載,腳本與截圖都不進版控)。純瀏覽器(非真正 Tauri
webview)執行時,`window.__TAURI_INTERNALS__` 不存在,`TopHeader` 的
`WindowControls` 元件會整棵樹崩潰(沒有 ErrorBoundary 包住 TopHeader,只有各視圖
各自包一層)——用 `page.addInitScript` 注入最小 `invoke`/`transformCallback`/
`metadata` mock 繞過,`actions_list` 另外回傳假資料才能讓 Actions 頁真的渲染出卡片
可供檢查。驗證了:①側邊欄展開/收合時標題+內容一起平滑挪動,任何狀態下都不重疊
②Stat 卡片與 Action 卡片變窄時漸進丟棄次要資訊,無文字重疊/難看換行。

**觀察但未動的一點**:Actions 頁 3 欄版面在常見的 1280px 視窗寬度下,單張卡片實際
寬度已經落在 Gemini 訂的 320px「compact」門檻以下,意味著安全上限/說明文字在相當
常見的版面下就已經被丟棄,不是只有真的很窄的視窗才會觸發。這是 Gemini 訂的門檻數字
與 `.cards` 既有的 `minmax(150px,1fr)` 網格互動下的結果,門檻本身是設計裁決範圍
(這次沒有擅自調整),記錄下來供之後需要時參考。

## 驗證

- `npm run typecheck` / `npx vitest run`(282 tests)/ `npm run build` 全綠
- Playwright 視覺驗收:標題-內容對齊、漸進式密度斷點,皆截圖確認後才判定完成
