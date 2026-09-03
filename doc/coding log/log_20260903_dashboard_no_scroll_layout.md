---
tags: [coding-log, ui, dashboard, layout]
summary: Dashboard 重構為固定高度自適應版面——摘要列+Cockpit 兩區共享視窗高度預算,不再需要頁面捲軸
date: 2026-09-03
---

# 2026-09-03 變更日誌 — Dashboard 無捲軸自適應版面

> **相關文件**:[[HOME|導覽首頁]] · [[UI_REDESIGN|UI 重建藍圖]]

## 🎯 目的

使用者看過 Phase 4/5 完成後的截圖後要求:「App 的 UI 可以不用用到滾輪,可以自適應調整
每一個卡片,使每一個卡片都可以正常顯示」。範圍界定為 Dashboard——量表/圖表/3D 姿態是
裝飾性視覺內容,可以合理地依視窗高度縮放;Settings(表單)與 Actions/History(無上限
成長的清單)刻意不納入,捲軸是這兩類畫面的正常、預期行為,硬擠壓表單欄位或清單卡片
反而會犧牲可讀性。

## 🔧 變更內容

- **版面結構**(`tailwind.css` + `DashboardView.tsx`):新增 `.dash-shell`(`flex flex-col
  h-full min-h-0`)包住整個 Dashboard 內容,摘要列 `shrink-0`、Cockpit 改 `flex-1
  min-h-0` 吃掉剩餘高度,不再各自宣告獨立的「理想」尺寸疊加後爆版。`min-h-0` 這個鏈
  是關鍵——flex 子元素預設 `min-height:auto` 拒絕縮到內容尺寸以下,少一層整條鏈就斷。
- **裝飾元素改用 vh 相對單位**:`.metric-gauge svg`(420px→`min(420px,30vh)`)、
  `.ring-wrap`(180px→`min(104px,13vh)`,字級改 `clamp()`)在短視窗上會跟著縮小,
  比照 `.leg3d-viewport`/`.visualizer svg` 既有的 `min(42vh,380px)` 寫法。
- **`LiveChart.tsx`**:拿掉寫死的 `style={{height:280}}`,改成填滿父層
  (`w-full h-full min-h-0`),讓 Chart.js 既有的 `responsive:true` + `maintainAspectRatio:
  false` 真正發揮作用而非被固定高度蓋掉。
- **合併右欄卡片**:ProgressRing 與 SessionControlPanel 原本是兩張分開的
  `.panel glass`,合併成一張,且 ProgressRing 改成 `SessionControlPanel` 新增的
  `ring` prop,顯示在「Designated Action」下拉選單**同一列**而非獨立佔一整列——
  省下一整個卡片的 padding(48px)+ gap(24px)+ ring 自己的整列高度(原約 145px)。
  這是這次能不擠壓表單欄位/卡片內距(那些改動會牴觸 Gemini 既有的 round-2 padding
  規格)的前提下,唯一足夠份量的空間來源。
- **`.cockpit` 加 `min-height: min(260px,30vh)`**:沒有下限時 flex-shrink 會把它壓到
  只剩分頁按鈕、圖表/3D 完全不可見——那不是「自適應縮小」,是被隱藏。
- **修一個過程中發現的真實 CSS Grid 陷阱**:`.dashboard-grid`/`.cockpit` 的
  `grid-template-columns: 1.6fr 1fr` 改成 `minmax(0,1.6fr) minmax(0,1fr)`。
  fr 軌道預設隱含 `min-width:auto`(=內容的 min-content 寬度),某一欄內容想要的寬度
  一旦超過它「應得」的比例份額,就會把整個 grid 撐寬過容器,而且撐寬的軌道自己量出來
  完全不覺得自己溢出(子元素本身 clientWidth==scrollWidth),只有量 grid 容器本身才
  抓得到——這次改高度時新出現的水平捲軸就是這個原因,不是任何單一元素變寬了。
  `.cockpit-panel` 一併補 `min-w-0` 消除格線項目自己的同類陷阱。

## ✅ 驗證方式

- [x] `npm run ci`(typecheck + 284 tests + build)全綠,重構過程沒有動到任何判定/邏輯
      程式碼,只有 Dashboard 的 JSX 結構與 CSS。
- [x] 隔離 `--user-data-dir` 啟動打包後的 app,拋棄式 Playwright 腳本量測
      `.main` 的 `scrollHeight` vs `clientHeight` 並截圖交叉比對:
      - 1280×820(`initialWindowSize()` 算出的實際預設視窗尺寸,不是隨便挑的數字):
        **完全無捲軸**(720/726 → 727/727 完全相等),深色/淺色雙主題都截圖確認。
      - 1600×900(寬螢幕):同樣無捲軸。
      - 850×900(<900px 寬度斷點,既有規則會改單欄堆疊):此寬度下 Dashboard 兩欄
        變一欄堆疊,總高度自然超過視窗需要捲動——這是既有的、原本就存在的寬度斷點
        行為,不是本次高度改動造成的迴歸,判斷為可接受。
      - 1093×614(文件記載的最壞案例筆電——1366×768@125% 縮放後的邏輯解析度,
        剛好只比 Electron 強制的 `MIN_HEIGHT=600` 高 14px):仍需捲動(107px 落差)。
        已在此極端邊界案例上花費合理精力(合併卡片、ring 移入同列等),但 14px 安全
        邊際的視窗要在保留 Gemini 卡片內距規格的前提下完全塞下摘要列+可用的圖表/3D
        區塊,已超出「調整卡片尺寸」的合理範圍,需要更大的資訊架構改動(例如摘要列與
        Cockpit 二選一顯示)才可能做到——記在下方後續待辦,不在本次動工範圍。
- [x] Actions / History / Settings 三頁重新截圖比對,確認未受影響(這三頁本次刻意不改)。

## 📝 後續待辦

- 若使用者需要 1093×614 這個最壞案例也做到零捲軸,需要更大幅的 Dashboard 資訊架構
  改動(例如摘要列與 Cockpit 之間增加可收合/切換機制),而不是延續本次「縮小裝飾元素
  尺寸」的路線——這類 IA 層級決策依現行慣例應交給 Gemini 判斷,而非在此自行決定。
- `SessionControlPanel` 拿掉了自帶的 `.panel glass` 包裝、改由呼叫端(目前只有
  `DashboardView`)提供外層卡片。目前是唯一呼叫點,若未來新增第二個呼叫點,需記得
  該處自行包 `.panel glass`。
