---
tags: [coding-log, layout, sidebar, css]
summary: 側邊欄改為疊層於主內容之上展開,不再推擠 .app-column 版面;整體下移到標題列之下
date: 2026-09-07
---

# 2026-09-07 變更日誌 — 側邊欄改為疊層展開,不再推擠版面

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260906_collapsible_sidebar|收合功能日誌]]

## 🎯 目的

使用者反應:「讓選單整體下移,並且以在上方疊層的方式展開,並且方塊不會無限往下到底,
這樣 UI 就不會亂推擠」。根因是 `.sidebar` 原本是 `.app` 這個 flex row 裡的一般
flex 子項,收合/展開觸發的寬度變化(56px↔220px)會直接改變 `.app-column`(flex-1)
實際拿到的寬度——而 `.dashboard-workspace` 又是 `container-type:size` 的 query
container,寬度在 0.25s 的收合動畫過程中連續變化,會讓 Dashboard 的三種版面預設
(見 [[log_20260905_dashboard_container_query_adaptive_layout|adaptive layout 日誌]])
在動畫過程中跨越 breakpoint、於是各面板忽大忽小地重排——這正是「方塊亂推擠」
的實際成因,不是比喻。另外 `.sidebar` 原本是 `h-screen`,與右側只涵蓋主內容區的
自訂標題列(`TopHeader`)並排,導致選單頂端與視窗左上角齊平,視覺上比標題列高。

## 🔧 動作

- `App.tsx`:把 `<TopHeader />` 從 `.app-column` 內部搬出來,變成 `.app-shell` 底下
  與 `.app`(內含 Sidebar + app-column)同層的手足,而不是只涵蓋右側欄的子元素。
- `tailwind.css`:
  - 新增 `.app-shell { flex flex-col h-screen }`,原本掛在 `.app` 上的 `h-screen`
    移到這裡;`.app` 改成 `flex flex-1 min-h-0 relative`。
  - `.app-column` 加上固定的 `margin-left: 56px`(等於收合寬度),不論 `.sidebar`
    收合或展開都不再變動——這是「不再推擠」的唯一機制。
  - `.sidebar` 從一般 flex 子項改成 `absolute inset-y-0 left-0 z-30`:因為
    `.app` 現在有 `relative`,`inset-y-0` 會相對 `.app` 的高度(也就是扣掉標題列
    之後的剩餘高度)鋪滿,天然對齊到標題列下緣,不需要另外量測標題列高度或寫死
    px 常數。展開到 220px 時,多出的 164px 直接疊在 `.app-column` 內容上方
    (`.sidebar` 本身是不透明背景,天然形成疊層效果),不會讓 `.app-column` 的
    盒子本身變動。

## 📐 決策

- 沒有另外加 box-shadow 標示疊層深度:Gemini 的 nav-rail 規格明確排除裝飾性陰影
  (見 [[log_20260905_sidebar_nav_rail_gemini_round2|round2 日誌]]),現有的
  `border-right` + 與 `--color-surface` 不同色階的 `--sidebar-bg` 已足以區分
  這是獨立的疊層面板,不需要為了這次改動額外開例外。
- 用「把 TopHeader 提升到 `.app` 外層、靠 flex-col 的剩餘空間分配」來讓 `.sidebar`
  自然對齊標題列下緣,而不是量測 `.top-header` 的實際 render 高度寫成 CSS
  變數:前者是結構性的(標題列多高都自動對齊),後者需要額外的 ResizeObserver
  或寫死一個容易在字型/DPI 變動時跑掉的 px 常數,參考
  [[log_20260905_dashboard_container_query_adaptive_layout]] 已經確立的
  「結構性解法優於常數」原則。

## ✅ 驗證

- `npm run typecheck`:通過。
- `npm run test`:26 個測試檔、286 個測試全過。
- `npm run build`:成功。
- 用 Playwright 對打包後的 app(隔離 `--user-data-dir`)實測量測
  `getBoundingClientRect()`:
  - 展開狀態下 `.app-column` 的 `left`/`width` 與收合、再展開後完全相同
    (`left: 56`,`width: 1224`)——PASS,證實推擠問題已消除。
  - `.sidebar` 的 `top`(49.14px)等於 `.top-header` 的 `bottom`(49.14px)——PASS,
    選單確實從標題列下緣開始,不再與視窗左上角齊平。
  - 螢幕截圖確認:展開時選單會蓋住 Dashboard 標題與部分卡片(疊層效果符合預期);
    收合時同一批卡片完整可見且位置與展開時完全一致(未曾被推動過)。

## Self-review

檢查情境:「`.sidebar` 改成 `position:absolute` 之後,會不會因為失去在 flex 版面裡
的參與資格,導致某些依賴它『占版面空間』的既有互動(例如 GlassDropdown 的
`document.addEventListener('scroll', updatePos, true)` 重新定位邏輯)在側邊欄
展開/收合時算錯座標?」——GlassDropdown 用 `capture:true` 監聽 `window` 的 scroll
事件、以及 `resize` 事件來重新量測位置,但側邊欄收合/展開本身不觸發 scroll 或
window resize(它只是同一層裡另一個元素的 CSS transition),而 GlassDropdown 的
觸發按鈕本身位置在這次改動中沒有移動位置(`.app-column` 的 margin-left 固定不變)
——PASS,兩者互不影響;另外用上面同一份 Playwright 腳本額外檢查了
`.app-column` 在三次狀態切換(展開→收合→再展開)中的矩形完全一致,不是只測了
一次性快照。
