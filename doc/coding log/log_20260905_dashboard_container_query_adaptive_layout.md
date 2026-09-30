---
tags: [coding-log, ui, dashboard, layout, gemini]
summary: Dashboard 改用 CSS Container Query 驅動的三段式自適應版面（依 Gemini 04 號簡報實作），過程中發現並修掉五個真實 CSS bug
date: 2026-09-05
---

# 2026-09-05 變更日誌 — Dashboard Container Query 自適應版面

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260903_dashboard_no_scroll_layout|前次無捲軸版面]] · `doc/gemini-handoff-20260905/04-adaptive-layout.md`

## 🎯 目的

使用者在 09-03 版面（vh/min()/clamp() 手調）之後回報：換到更小的視窗尺寸（1093×614、
1024×600）版面仍然爆版，且每次都要手動重調常數很累，希望「一套可以自適應的系統」。
按 [[feedback_irms_ui_design_delegated_to_gemini|既定慣例]] 把這個問題交給 Gemini
的 04 號簡報處理，Gemini 回覆建議改用 CSS Container Query（依容器實際尺寸而非
viewport 尺寸响应），本篇記錄依該回覆直接實作的結果。

## 🔧 變更內容

- **`.dashboard-workspace`**(`DashboardView.tsx` + `tailwind.css`)新增
  `container-type: size; container-name: dashboard`,取代舊的「猜視窗大小」寫法。
- **單一 `.dashboard-grid`** 取代舊的兩個獨立 grid(摘要列 + cockpit 列),用具名
  `grid-template-areas` 在三個 preset 間切換:
  - 預設:`'gauge ring' 'chart pose'`(或無 3D/2D 時 `'chart chart'`)
  - `@container dashboard (max-height: 450px)`:三欄 `'gauge ring chart' 'gauge ring pose'`
  - `@container dashboard (max-height: 385px)`:折疊圖表與姿態,改用永遠掛在 DOM 裡的
    `.dash-cell-numeric` 數值卡片後備區,`display:none`→`flex` 切換可見度(不 remount)。
- **`DashboardView.tsx`** 抽出 `DetailStatsGrid` 元件,讓「一般 tab 內容」與「最窄
  preset 的數值後備區」共用同一份 6 張 `<Stat>` 卡片標記,不重複維護。
- **`SessionControlPanel.tsx`**:Target/Tolerance/Hold 三欄改 `flexWrap:'wrap'` +
  每欄 `minWidth:84`,避免在窄的 ring 欄位被壓到數字看不清。

## 🐛 過程中發現並修掉的五個真實 bug

這些都是重建+用 Playwright 量測實際 `scrollHeight`/`clientHeight` 後才抓到的,不是
單靠看程式碼發現的:

1. **Tailwind 3.4.19 的 `@layer components` 會吃掉 `@container` 的 prelude**——
   `@container dashboard (max-height:450px) {...}` 經過 `@layer` 處理後,編譯出來的
   CSS 變成裸的 `@container {}`(condition 整段被砍掉),語意上等於「永遠命中」。
   檢查編譯後的 `out/renderer/assets/index-*.css` 才確認。**修法**:把兩段
   `@container` 規則整段搬到 `tailwind.css` 檔尾,完全不放在任何 `@layer` 裡
   (unlayered CSS 的 cascade 優先權本來就高於 layered CSS,語意也正確)。
2. **`grid-template-rows: minmax(0,1fr) auto`** 讓 `auto` 那一列的高度被內容撐開,
   在 375px 高的容器裡把版面撐到 800px——正是 Gemini 簡報点名要避免的反模式。
   **修法**:兩列都改成 `minmax(0, Nfr)`。
3. **grid item 缺 `min-width:0`/`min-height:0`** 造成窄 preset 下橫向溢出(用
   `document.querySelectorAll` 找最寬元素的診斷腳本追到 `.field`)。**修法**:所有
   `.dash-cell-*` 補 `@apply min-w-0 min-h-0`,`.field` 補 `min-w-0`。
4. **`container-type:size` 會把子孫的 `overflow:visible` 強制算成 `overflow:clip`**
   (CSS Containment 規格規定 size containment 與 visible overflow 不相容)——沒被
   容器吃下的內容(Hold 欄位、多出來的卡片)完全不見,連捲軸都沒有,無法觸及。
   **修法**:`.dash-cell-ring`、`.cockpit-content` 明確補 `overflow-y-auto`。
5. **`justify-content:center` 在可捲動 flex 容器上會裁掉開頭**——加了捲軸之後最上面
   一排卡片仍然視覺上被切掉一截,因為置中運算發生在捲動位置 0 建立之前。**修法**:
   `.cockpit-content` 改成 `justify-content:flex-start`。

## 📐 決策

- **Container query 閾值重新校準,不用 Gemini 建議的原始數字**:簡報建議
  700px/620px(依視窗尺寸推算),但實測 `.dashboard-workspace` 的真實高度是:
  1600×900→677.7px、1280×820(預設)→597.7px、1093×614→392.0px、1024×600(地板)
  →377.7px——連「寬」情境都低於簡報自己建議的閾值。改用實測值校準為 450px/385px,
  並在程式碼註解記下 tight-laptop(392px)與 floor(377.7px)之間只差約 14px 這個
  先天脆弱點。
- **核心系統驗證完成即收尾,細部視覺留給 Gemini 的視覺設計 pass**:最窄 preset 下
  仍有小型內部捲軸、tab 切換文字略擠等視覺密度問題,判斷這些屬於視覺設計層次(01-03
  號簡報的範圍),不屬於「絕不 page-scroll」這個結構性保證,因此不在本輪繼續往下修。

## ✅ 驗證

- `npm run ci`(typecheck + test + build)全綠:26 個測試檔、285 個測試全過,build
  成功(`out/renderer/assets/index-DX8JHQzw.css` 77.29 kB、`index-CZNrTA27.js`
  1,866.48 kB)。
- Playwright 隔離 profile 啟動,量測 `.main` 的 `scrollHeight`/`clientHeight`/
  `scrollWidth`/`clientWidth`,在 1280×820、1093×614、1024×600(先前兩個未解決的
  尺寸)、1600×900 四種視窗尺寸下,搭配 `showTrendChart`/`show3D2DPose` 開關的所有
  組合,確認皆為零 page-level overflow(高與寬皆完全吻合,無捲軸)。
- 驗證完成後清除所有暫時性 `_scratch_*.mjs`/`_scratch_*.png` 腳本與截圖,並解除安裝
  暫時安裝的 `playwright-core`(專案本身不依賴它)。

## Self-review

檢查情境:「數值後備區 `.dash-cell-numeric` 永遠掛在 DOM 裡,只靠 CSS
`display:none`↔`flex` 切換——如果 `show3D2DPose` 開啟但視窗縮到最窄 preset,`.dash-cell-pose`
(依 `show3D2DPose` 條件式 render)與 `.dash-cell-numeric`(永遠 render)是否會同時出現在同一個
`grid-template-areas` 裡造成衝突?」——確認最窄 preset 的 `@container` 規則本身就把
`.dash-cell-chart`/`.dash-cell-pose` 都設為 `display:none`,且該 preset 的
`grid-template-areas`(`'gauge ring' 'gauge numeric'`)根本沒有 `chart`/`pose` 這兩個
area 名稱,兩者不會同時佔用網格,結果:PASS(已在四組視窗尺寸 × `show3D2DPose` 開/關的
組合驗證中涵蓋這個情境,零溢出)。
