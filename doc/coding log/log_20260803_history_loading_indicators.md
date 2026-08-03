---
tags: [coding-log]
date: 2026-08-03
summary: "History 三個無回饋的讀取(session 列表、單場分析圖表、CSV 匯出)補上讀取中指示器;新增 Spinner 元件,AnalysisModal/CSV 匯出補上先前完全沒有的錯誤處理(否則失敗會卡在轉圈圈永不消失);以隔離 user-data-dir + Playwright 驅動實際打包的 Electron 視窗目視驗證,141 tests 全綠"
---

# 2026-08-03 變更日誌 — History 讀取進度指示器

> **相關文件**:[[HOME|導覽首頁]] · [[OPTIMIZATION|優化待辦]] ·
> [[log_20260803_visual_verification_fixes|同日前一批:目視驗收]]

## 🎯 請求

原始指令只有兩個字:「讀取進度」。沒有 issue 編號、沒有其他描述。這不是照
[[log_20260803_meeting_direction_after_visual_pass|同日稍早方向裁決會議]]決定的
順序(合併 → 精靈第 5 步 → ingest 管線 → 元件測試 → 感測器模型測試 → migration 6 →
對比修正)在往下推——是使用者另外開的獨立臨時請求,不是偏離裁決順序。

repo 內找不到任何字面符合「讀取進度」的功能或殘留程式碼(`grep -r` 全 repo 含
git log 皆零命中)。比對 [[OPTIMIZATION]] 與程式碼後,證據指向同一個缺口:

- `OPTIMIZATION.md` P1 原文就是用「**讀取**」這個字——「History 分析:大型 Session
  (數萬筆)**讀取**改分頁 / 抽樣繪圖,避免一次載入」。抽樣(LTTB)已於 2026-08-01
  完成,但「讀取期間要不要有回饋」從未被實作,checkbox 也沒跟著打勾。
- `HistoryView.tsx` 的 `AnalysisModal` 裡有一行舊註解直接寫著:「主進程 LTTB
  抽樣……**會讓這個 modal 明顯卡住**」——開發者早就預見這個問題,但從未接上任何
  提示,IPC 讀取中畫面就是一片空白 canvas。
- 全專案 grep `isLoading`/`Spinner`/`Skeleton` 零命中——沒有任何讀取回饋的基礎設施,
  History 的三個讀取點(session 列表、單場分析、CSV 匯出)全部是靜默等待。
- 相對地,「達標進度環」(`ProgressRing`,復健動作的 reps/hold 進度)與校準精靈的
  步驟指示都已經是完整功能,不是缺口。

判定:「讀取進度」最合理對應的是 History 這三個讀取動作缺乏讀取中回饋,而非其他
已完成或用詞不符的項目(BLE 重連提示在 OPTIMIZATION P2 是另一個獨立、仍未做的
項目,原文用的是「重連進度」而非「讀取」,本次未動)。

## 🔧 已完成

### 新增 `Spinner` 元件

`components/Spinner.tsx`:圓環 + 可選文字標籤,樣式沿用既有的 `--accent` 語意
token,深/淺主題自動切換(與 `.empty` 面板同一套配色邏輯)。CSS 新增
`.spinner-wrap` / `.spinner` / `@keyframes spin`。

### History session 列表

`HistoryView` 加入 `isLoading`(初始 `true`)。首次掛載且尚無資料時顯示 Spinner,
而不是直接判「尚無復健紀錄」——原本的邏輯把「還沒讀到」跟「讀到了、確實是空的」
當成同一種狀態,對真的有歷史資料的使用者是誤導性的空狀態閃爍。

### `AnalysisModal` 圖表讀取

補上 `isLoading` 蓋在 canvas 上方置中顯示 Spinner。同時把原本完全沒有錯誤處理的
`window.irms.sessions.getData` 呼叫包進 `try/catch`,失敗時 `showToast` +
解除讀取中狀態。**這個錯誤處理不是額外加的保險,是加了 loading 狀態後的必要條件**
——沒有它,IPC 失敗會讓 Spinner 永遠轉下去,比原本什麼都不顯示還誤導。

加了 `cancelled` guard:使用者切換 session 或關閉 modal 造成 effect 提前清除時,
不對已卸載的元件呼叫 `setState`。

### CSV 匯出

`exportCsv` 同樣包進 `try/catch/finally`,新增 `isExporting` 狀態,按鈕在匯出中
顯示「匯出中…」並停用,避免使用者對著沒反應的按鈕連點,也避免看不出全量讀取
（未抽樣、可能是 History 三者中最大的一筆讀取)是否真的在跑。

## 🧠 關鍵決策

- **只做讀取中指示,不做百分比進度條**。IPC 呼叫是單次來回(main process 內部一次
  查詢 + 一次 LTTB 抽樣後整包送回),沒有分段回報進度的資料可用;做假的百分比動畫
  會比誠實的「讀取中…」更誤導。真要做百分比需要 main process 端改成分段查詢並
  透過額外 IPC channel 推送進度,超出這次範圍。
- **這次改動影響的是使用者的決定,不是判定引擎的決定**(2026-08-03 方向裁決會議
  的規則調整)。Spinner 不餵給 TriggerEngine 或任何判定路徑——它改變的是使用者
  「要不要繼續等、要不要以為程式當掉」的判斷,尤其匯出鍵在原本設計下連續點擊
  沒有任何阻擋。屬於裁決會議定義下的「真實」而非「裝飾性」UI。
- **OPTIMIZATION.md:79 順手補打勾**。該行文字本身沒有過時(抽樣改分頁的訴求仍
  精準描述了 LTTB),只是完成狀態沒同步;既然這次把「讀取期間回饋」這個殘餘半段
  也做完,一併標記並附說明,而不是留著兩個日期不同的完成事實混在一行未勾選的文字裡。
- **不動 OPTIMIZATION.md:86(重連進度)**。文字用詞不同(「重連」而非「讀取」)、
  對應的是 BLE 連線狀態列而非 History,是另一個獨立待辦,留給未來一次任務处理,
  避免這次的變更範圍模糊掉「讀取進度」實際對應到哪裡的判斷依據。

## ✅ 驗證

- [x] `npm run ci` 全綠:typecheck(node+web)+ **141 tests**(既有測試數不變,
      這次是純 UI 元件變更,沒有新增可被單元測試覆蓋的邏輯層——專案慣例是邏輯層
      才寫 vitest,元件靠目視,見 2026-08-03 稍早的日誌)
- [x] **實際打包後的 Electron 視窗跑過一輪**:用隔離的 `--user-data-dir`(不碰
      使用者真實 DB)+ `node:sqlite` 灌入一場含 6000 筆 sensor_data 的假 session,
      `xvfb-run` 起真正的 app,Playwright `_electron` 自動化點擊 History → 分析,
      確認 session 列表、圖表(1200 點抽樣後)、CSV 匯出鈕全部正常渲染,無 console
      error / pageerror
  - ⚠ 本機 SQLite 讀 6000 列 + LTTB 全部在個位數十毫秒內完成,截圖連拍(0ms/50ms/
    800ms)沒能真的逮到「讀取中」那一幀——這代表正常情況下 Spinner 幾乎不會被
    肉眼看見,只有 IPC 真的變慢(更大的 session、機器負載)時才有感,行為符合預期
    但沒有直接的「轉圈圈畫面」截圈證據
  - [x] **改用獨立靜態頁面補這塊**:把 `Spinner` markup 接上實際打包出的 CSS,
        用 Playwright 一般 Chromium(非 Electron)在 light/dark 兩種
        `prefers-color-scheme` 下截圖,確認圓環配色、置中、字級與其餘 glass 面板
        風格一致

## 📝 後續待辦

- OPTIMIZATION P2「重連進度更明確的視覺提示」仍未做,BLE 連線狀態目前仍只有文字。
- 真正的百分比進度(而非單純轉圈)需要 main process 端分段查詢 + 額外 IPC 進度
  channel,價值取決於未來實機大 session(數萬筆)的實際讀取耗時,目前仍是猜測。
