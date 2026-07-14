---
tags: [coding-log]
date: 2026-07-14
summary: "側欄拖拉調寬+晃動、GlassDropdown 取代原生 select(點擊彈出+彈簧晃動)、選單類玻璃扭曲濾鏡(SVG feDisplacementMap,僅套用側欄/下拉面板);自我審查抓出 3 個真實缺陷並修復,71 tests 綠"
---

# 2026-07-14 變更日誌 — 側欄拖拉、下拉選單改版、Liquid Glass 扭曲

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260713_custom_wallpaper|前置:自製向量桌布]] ·
> [[log_20260714_architecture_meeting_winui3|架構會議紀錄(WinUI 3 暫緩)]]

## 🎯 目的

架構會議決議「WinUI 3 暫緩,先驗證 BLE + UI 優化」後,使用者接著指示先做 UI 設計:
側欄改可拖拉並帶晃動、所有選單套「模糊+不規則扭曲」、下拉選單改點擊彈出帶晃動,
並要求找出所有潛在問題修到 0。

## 🔧 變更內容

1. **`components/GlassDropdown.tsx`(新增)**:取代 4 處原生 `<select>`
   (指定動作、預設協定、協定篩選、Trigger Type)。點擊觸發、外部點擊/Escape 關閉、
   彈出面板 `dropdown-pop` keyframe(scale+rotate+translateY 彈簧回彈)。
2. **`Sidebar.tsx` + `useUiStore.ts`**:右緣拖拉把手(Pointer Events + capture),
   180–360px 自由調寬,<110px 門檻吸附收合;拖曳中依瞬時速度寫入 `--wobble`,
   放開後彈簧曲線回正。
3. **`global.css` + `App.tsx`**:新增 `.glass-warp` modifier——背景/blur 移到
   `::before` 套 SVG `feTurbulence`+`feDisplacementMap` 濾鏡,本體(含文字)留在
   未扭曲層。刻意只套在側欄與下拉彈出面板(選單類),不套用到一般卡片。

## 🧠 關鍵決策與教訓(自我審查抓到的 3 個真實缺陷)

1. **多餘的 store dispatch**:`onResizeMove` 原本每次 pointermove 都無條件呼叫
   `setCollapsed()`,即使值未變也觸發全域重繪——正是先前 UI 節流工作要消除的
   問題。改為只在跨越門檻時才 dispatch。
2. **晃動被 transition 吃掉**:`.sidebar` 的 transform transition 沒在拖曳中關閉,
   `--wobble` 的即時值被 0.35s 緩動平滑掉。補上
   `.app.sidebar-dragging .sidebar { transition: none; }`。
3. **把手自己裁掉自己**:`right: -8px` 讓把手一半跨出 `.sidebar` 邊界,但
   `.sidebar` 有 `overflow: hidden` 會裁掉超出部分,可點擊區域只剩一半。
   改 `right: 0`,完全落在右側 padding 內。

## ✅ 驗證

- [x] `npm run ci`(typecheck+71 tests+build)修復前後各跑一次,皆綠
- [x] 瀏覽器面板連 Vite renderer 做 DOM 級驗證(`computer` 截圖本 session 持續
      逾時,改用 `read_page`/`javascript_tool` 結構化驗證):彈出動畫、扭曲濾鏡
      computed style、拖拉寬度/晃動/裁切修復,皆確認命中預期
- [ ] 👀 使用者親眼驗收手感與濾鏡強度

## 🔁 補充修正(同日,使用者提供參考範例後)

使用者找到的範例直接把 SVG 濾鏡串進 `backdrop-filter: blur() url(#filter)`,
且在 `feDisplacementMap` 前先用 `feGaussianBlur` 抹平雜訊。改用此法取代原本的
`::before` 分層:

- **改法**:`.glass-warp` 直接 `backdrop-filter: var(--glass-blur)
  url(#glass-warp-filter)`,不再需要 `::before`/`isolation`/`z-index` —— 反正
  `backdrop-filter` 本來就只處理元素「後方」的內容,文字從一開始就不會被扭曲,
  分層是多餘的保險。
- **濾鏡調整**:`baseFrequency` 0.012/0.018 → 0.008(改單一值、波紋更粗獷),
  新增 `feGaussianBlur stdDeviation="1.5"` 平滑雜訊(液態波動感取代顆粒抖動),
  `scale` 6 → 18(參考範例用 110,考量我們是小尺寸選單元件而非全螢幕藝術效果,
  調低)。
- 瀏覽器驗證:側欄與下拉彈出面板的 computed `backdropFilter` 皆正確顯示
  `blur(20px) saturate(1.8) url("#glass-warp-filter")`;`npm run ci` 71 tests
  仍綠,無 console 錯誤。

## 🔁 補充二:液態黏滯滑動指示器(第三次參考範例)

使用者又找到一個「黏液融合」濾鏡範例(`feGaussianBlur`→`feColorMatrix` 閾值→
`feComposite atop`),用在分段式切換器的滑動指示塊+彈性拉伸。詢問套用範圍後,
使用者選「兩者都做」:Dashboard 次要分頁(趨勢圖/3D/2D/詳細數值)+ 側欄主導覽。

- **新增 `components/LiquidKnob.tsx`**:共用元件,`orientation` 參數決定量測
  left/width(水平,分頁用)或 top/height(垂直,側欄用)。量測用
  `[data-knob-key]` + `getBoundingClientRect`;定位(track,持續 transition)與
  拉伸回彈(shape,一次性 keyframe)刻意拆成兩個元素——這樣「持續滑動」與
  「一次性彈跳」不會搶同一個 `transform` 屬性打架。
- **採用前先修正參考範例裡的一個問題**:原範例用 inline `style.transform` 設定
  位移,同時用 CSS class 設定 `transform: scaleX(1.3)`——inline style 優先權
  永遠贏過 class,不論加入順序,所以拉伸視覺上根本不會生效。改用兩個元素分別
  處理位移(track 的 transition)與拉伸(shape 的 animation)解決。
- **抓到一個真的會蓋住文字的 stacking 問題**:`.liquid-knob-track` 是
  `position:absolute`,而 CSS 堆疊規則是「有定位的元素一律蓋在無定位(static)
  的兄弟之上,不論 DOM 順序」——只有兄弟們「都有定位」時 DOM 順序才決定誰在上。
  原本 `.nav-item`/`.tab-btn` 是預設 `position:static`,knob 會蓋住按鈕文字。
  修法:幫兩者都補上 `position:relative; z-index:1`,讓大家都「有定位」,
  DOM 順序(knob 先渲染)才會正確把它排到按鈕下方。
- 濾鏡數值(`stdDeviation` 12→4、閾值截距 -9→-8)比範例調輕,因為套用對象是
  小尺寸導覽/分頁指示塊,不是大型 blob 動畫。

## 📝 後續待辦

- 依驗收微調晃動幅度(`WOBBLE_MAX_DEG`)、濾鏡扭曲量(`scale`)
- `GlassDropdown` 目前無鍵盤上下鍵選項導覽(僅 Tab+Escape),視需求再補
- 回到會議決議的「驗證優先」30 天計畫:BLE 實機驗證 + Profiler 基線
