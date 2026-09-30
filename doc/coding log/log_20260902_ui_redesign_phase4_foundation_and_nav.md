---
tags: [coding-log]
date: 2026-09-02
summary: "craft-ui-designer Phase 4,第一批(基礎元件層 + 新導覽)。tailwind.css 新增 @layer components,把舊 global.css 的 class 詞彙(panel/glass/btn/field/dialog/toast/tabs...)用新的深色/bento token 重新定義,絕大多數畫面零改動就套上新外觀。建了新的 SegmentedControl 取代 BottomBar(重用 useLiquidKnob 的量測/拖曳邏輯,只換外觀),順手刪除已無用的 BottomBar.tsx/NavIcons.tsx。npm run ci 全綠,隔離啟動+CDP 截圖驗證 Dashboard/Actions/History 三頁的外殼與分段切換器都正確渲染,並修掉截圖中發現的一個真實 bug(BottomBar 沒有 position:relative 導致滑動指示塊絕對定位跑出容器,撐成一條貫穿全螢幕的青色色塊)。"
---

# 2026-09-02 變更日誌 — UI 重建 Phase 4(一):基礎元件層 + 新導覽

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260901_ui_redesign_phase3_layout|Phase 3 版面藍圖]] ·
> `doc/UI_REDESIGN.md`

## 🎯 請求

使用者:「開始計畫,逐一解決 tasks。」— Phase 4(元件重建)正式開始。

## 🔧 已完成

### 策略決定:重新定義舊 class 詞彙,而非逐檔案改 JSX

盤點 renderer 底下所有 `className` 出現頻率,`btn`(37)、`row`(21)、`glass`(21)、
`field`(15)、`panel`(13)... 這些高頻通用類別如果要求每個檔案改用新的 Tailwind
utility 組合,會是一次橫跨 50+ 檔案的巨大改動。改成在新的 `tailwind.css` 用
`@layer components` + `@apply` 把**同樣的 class 名稱**重新定義成新 token 組成的樣式
(`.panel`/`.glass` → `bg-surface border border-border rounded-card`、`.btn-primary` →
`bg-accent`...),絕大多數既有 JSX 完全不用改就套上新外觀。真正需要動 JSX 的只有**形狀
真的變了**的部分(這批的新導覽、之後的各頁面 bento 排版)。

具體涵蓋:shell(`.app`/`.main`)、版面輔助(`.row`/`.grid`/`.cards`/`.page-header`)、
卡片(`.panel`/`.glass`/`.glass-elevated`)、頂列(`.top-header`/`.dot`)、按鈕全系列
(`.btn-primary`/`.btn-secondary`/`.btn-danger`/`.btn-danger-ghost`/`.btn-sm`/`.btn-block`)、
表單(`.field`/`input`/`select`/`placeholder`)、對話框(`.overlay`/`.dialog`)、
`.toast`/`.toast-host`、次要視覺化的內部分頁(`.tabs`/`.tab-btn`)。

**按鈕形狀刻意改成直角**(`rounded-control` = 8px)取代舊版 999px 膠囊——膠囊形狀本身
就是 Apple 語系的視覺記號之一,既然 Phase 1 已經定調不再走那條路,連帶把這個形狀語言
換掉,不是只換顏色。

### 新導覽:SegmentedControl 取代 BottomBar

依 `doc/UI_REDESIGN.md` 外殼藍圖,新建 `SegmentedControl.tsx`——**重用**
`useLiquidKnob`(量測目前選中項位置+拖曳物理,與外觀無關的純邏輯 hook),只是滑動指示塊
外觀從「軟性玻璃膠囊」換成 `.segmented-item.active` 的直角 cyan 色塊。渲染位置從畫面底部
移到 `TopHeader`正下方(見 `App.tsx`)。舊的 `BottomBar.tsx`/`NavIcons.tsx` 確認全專案
無其他引用後**直接刪除**,不留 dead code。

## 🧠 關鍵決策

**發現即修,不留給下一批**:視覺驗收 Dashboard 時看到一條貫穿全螢幕高度的青色色塊,
追下去發現是舊 `BottomBar`(即將被取代,所以這次 Phase 4a 沒特地幫它補樣式)的
`liquid-knob-track`(`position:absolute`)因為容器 `.bottom-bar` 沒有
`position:relative` 而失去定位錨點,絕對定位往上找到了下一個有定位的祖先,撐滿了那個
範圍。這其實預告了新 `SegmentedControl` 若忘記給 `.segmented` 設 `position:relative`
會踩到同一個坑——寫的時候已經在 `.segmented` 加上 `relative`,screenshot 驗證確認
指示塊確實正確地跟著 `.segmented` 容器定位,不是巧合躲過。

## ✅ 驗證

- [x] `npm run ci`:typecheck 綠、**284 tests(26 files)全綠**(刪除 BottomBar/NavIcons
      未影響任何測試,兩者本來就不在測試覆蓋範圍——純 UI 元件)、build 成功
- [x] `.grid` 這個自訂 component class 撞到 Tailwind 自己的 `grid` utility 名稱,
      `@apply grid` 觸發 PostCSS 的 circular dependency 錯誤——改回寫原生 CSS
      (`display:grid`)繞過,不透過 `@apply`
- [x] 隔離 `--user-data-dir` 啟動封裝產物 + 暫裝拋棄式 `playwright-core` 連 CDP:
      Dashboard/Actions/History 三頁截圖確認——`TopHeader` 正確渲染為深色卡片、
      `Connect Device` 按鈕直角+cyan、`SegmentedControl` 四個分段正確顯示且點擊切換時
      滑動指示塊正確跟隨移動到對應分段,無殘留的舊 BottomBar 視覺瑕疵
- [x] 驗收腳本、`playwright-core`、截圖用完即刪,`git status` 只剩預期中的檔案異動

## 🔎 自我審查

**檢查情境:刪除 `BottomBar.tsx`/`NavIcons.tsx` 前,有沒有漏查其他隱藏引用(例如測試檔案
或 storybook 之類的獨立進入點)?**——`grep -rln "BottomBar"` 掃全 `src/` 目錄,結果只有
它自己的檔案(刪除前)、新寫的 `SegmentedControl.tsx` 註解提及、以及 `tailwind.css`
的說明註解,三者都不是「使用」是「提及」。`NavIcons` 同樣只有 `BottomBar.tsx` 自己引用。
刪除後 `npm run ci` 的 typecheck 階段全綠,若有漏查的引用會在這裡直接編譯失敗,不是
只靠 grep 一次性確認。**Pass**。

## 📝 後續待辦

- Phase 4 剩餘工作(依 `doc/UI_REDESIGN.md`):bento 卡片基礎元件 + 各頁面 grid 排版
  (Settings → Actions → History 列表化確認 → Dashboard),重建順序尚未逐一排定,
  下一批繼續。
- Settings 頁面重建時記得**一併刪除 Appearance/styles profile 死系統**
  (`applyStyleProfile.ts`、`styles/profiles/`)——新方向是固定深色主題,不再需要可切換
  的風格設定檔,這是 Phase 4 順手清掉的技術債,不是新範疇。
- `global.css` 本身仍在 repo 未刪(見 09-01 teardown 日誌),待所有頁面重建完成、
  確認沒有殘留引用後再整批清除。
