---
tags: [coding-log]
date: 2026-09-02
summary: "實作使用者從 Gemini 拿回來的兩套設計 mockup(Direction A 深色/B 淺色)。使用者裁定「兩個都走」(重新引入雙主題,取代 09-01 移除的舊風格系統)+「採用側邊欄+頂部雙層導覽」。實作:CSS variable 雙主題架構(tailwind.config.js 改用 rgb(var(--x))、tailwind.css 定義 :root/.theme-light 兩組 token)、新 Sidebar.tsx(還原封存分支的 NavIcons.tsx)與 SegmentedControl 同步驅動同一個 view 狀態、深色限定的發光效果(active 元件)、自架 JetBrains Mono 字體套用到數值輸入。過程中量出 Gemini 淺色規格裡多個顏色未過 WCAG(text-muted 2.34:1、accent 2.43:1、danger 3.76:1、success 2.54:1),對應加深一階修正;並在截圖驗證時抓到一個真實 CSS specificity bug(.btn-secondary 文字色被 button.btn 蓋掉,主題切換鈕在淺色模式下整個看不見)。npm run ci 全綠,雙主題+側欄截圖驗證通過。"
---

# 2026-09-02 變更日誌 — 實作 Gemini 設計 mockup:雙主題 + 側邊導覽

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260902_design_handoff_pivot|09-02 轉向外部設計支援]] ·
> [[log_20260902_unlock_dark_theme_constraint|09-02 解除深色鎖定]] ·
> `doc/gemini-handoff-20260902/`(本次實作的設計來源)

## 🎯 請求

使用者帶回 Gemini 的設計產出:兩套完整 mockup(Direction A「Data-Console Dark」精修深色、
Direction B「Precision Lab Light」全新淺色),附具體色票/圓角/間距/字體規格,以及四項
「兩套主題都適用」的關鍵變更建議(數值全面改 mono 字體、側邊欄+頂部雙層導覽、Settings
真正的階層分組、Dashboard 以關節角度視覺化為主)。

先發現 mockup 多了一個先前明確排除的側邊欄導覽,且 mockup 圖片本身文字是 AI 生成的亂碼佔位,
提出兩個問題讓使用者裁定,而不是自己選一個或悄悄接受變動範圍:

1. **走哪個方向?** 使用者:**兩個都走**——代表要重新引入可切換主題,不是二選一。
2. **側邊欄要採用嗎?** 使用者:**採用,側邊欄+頂部雙層導覽**——雙套導覽介面共同驅動
   同一個畫面切換狀態,不是互斥的兩套系統。

## 🔧 已完成

### 主題架構重寫:固定色票 → CSS variable 雙主題

`tailwind.config.js` 的 `colors` 全部改用 `rgb(var(--color-x) / <alpha-value>)`(保留
Tailwind 透明度修飾語法),實際色值移到 `tailwind.css` 的 `:root`(預設,深色)與
`.theme-light`(淺色覆寫)兩組 `--color-*` 變數。`applyThemeMode(mode)`(取代舊版
`applyStyleProfile()`,見 `services/theme.ts`)切換 `<html>` 的 `theme-light` class。

**新設定欄位**:`useStore.ts` 的 `Settings.styleProfileId: string`(09-01 移除的舊系統,
本來計劃留到「之後整批清理」)換成 `themeMode: 'dark' | 'light'`,persist version 7→8。
順手把 `applyStyleProfile.ts`/`styles/profiles/` 整批刪除(不是留著當死碼,這次是真的
被新機制取代,不是「還沒空間」);`theme.ts` 的 `chartTheme()` 一併修好指向新 token 名稱
(原本讀 `--accent`/`--thigh`等舊命名,teardown 後就已經是空字串,這次順便修正,詳見下方
「未修的部分」)。

**主題切換 UI**:`TopHeader.tsx` 新增 sun/moon icon 按鈕(緊鄰 Connect Device 左側),
`onClick` 寫回 `settings.themeMode`,持久化。

### 雙層導覽:Sidebar + SegmentedControl 並存

從 `legacy-ui-liquid-glass` 封存分支 `git show` 取回 `NavIcons.tsx`(純線條圖示,判定
與 Apple 語系無關,值得留用,不必重畫)。新建 `Sidebar.tsx`,與既有 `SegmentedControl.tsx`
**共用同一個 `useUiStore` 的 `view` 狀態**——點任一邊都會同步更新兩邊的 active 狀態,
不是各自獨立的導覽來源。`App.tsx` 外殼從垂直 flex 改水平 flex:`Sidebar` 固定寬度在左,
右側 `.app-column` 包 `TopHeader`/`SegmentedControl`/`main`。順手清掉两段已確認無人引用的
死 markup(`.bg-scene` blob 背景 div、`glass-warp-filter`/`liquid-gooey-filter` 兩個
SVG 濾鏡定義)——這些是 Liquid Glass 時代的裝飾,新 CSS 早就不再引用,只是還沒被清掉。

### 「發光」效果(深色限定)

Gemini 規格:「active/ON 的元件套一層柔和 cyan/emerald 模糊,看起來像發光元件而非扁平色塊」。
新增 `shadow-glow-accent`/`shadow-glow-success`(`tailwind.config.js` boxShadow),套用在
`.liquid-knob-shape`(segmented/tabs 的滑動指示塊)、`.sidebar-item.active`、`.dot.on`
(BLE 已連線指示燈)。**只在深色主題生效**(`html:not(.theme-light) ...`)——白底上的發光
只會看起來像模糊瑕疵,不是儀器指示燈的效果,這點是判斷不是照抄規格(規格沒特別排除淺色,
但淺色 mockup 本身也沒有畫發光,判斷這是深色限定的設計語言)。

### 數值讀數改 mono 字體

自架 `@fontsource-variable/jetbrains-mono`(跟 Inter 同一套模式,`main.tsx` 引入 `wght.css`),
`tailwind.config.js` 的 `mono` token 從「先占位、字體檔案未接上」正式接上真正的字體檔案。
套用到 `input[type='number']`(Settings 的 Chart Max Points/Flush Interval/校準數值輸入
都吃到)。Dashboard 的即時讀數(角度、次數)尚未存在對應元件,留給 Dashboard 重建時套用。

## 🔍 修正 Gemini 規格:WCAG 對比度

`craft-ui-designer` skill 的 Phase 5 本來就要求「用真的相對亮度公式驗對比度,不是用眼睛看」。
拿到淺色規格的色票逐一算過,**多個值算出來不過 WCAG AA**(4.5:1 一般文字 / 3:1 大字或
UI 元件):

| Token | Gemini 原值 | 對比度 | 修正值 | 修正後對比度 |
|---|---|---|---|---|
| `text-muted` | `#94a3b8`(slate-400) | 2.34:1 ❌ | `#64748b`(slate-500) | 4.34–4.76:1 |
| `accent`(當文字色) | `#06b6d4` | 2.43:1 ❌ | `#0e7490`(cyan-700) | 5.36:1 |
| `danger`(當文字色) | `#ef4444` | 3.76:1 ❌ | `#dc2626`(red-600) | 4.83:1 |
| `success`(白字按鈕底色) | `#10b981` | 2.54:1 ❌ | `#047857`(emerald-700) | 5.48:1 |
| `warning`(預防性,尚未實際用作文字) | `#f59e0b` | 2.15:1 ❌ | `#b45309`(amber-700) | 5.02:1 |

深色主題的規格本身全數過關,不需要修正。這是「忠實實作」跟「盲目照搬」的分界線——版面/
間距/字體/圓角方向全部照 Gemini 給的規格落地,顏色數值在量出來確實不過這個專案已經對深色
主題堅持的無障礙門檻時修正,而不是為了「跟 mockup 長得一模一樣」硬留一個量得出來會失敗的值。
每個修正值都還是錨定在 Tailwind 官方調色盤上真實存在的色階(同色相往深一階),不是自己
發明的顏色。

## 🐛 截圖驗證抓到的真實 bug

**`.btn-secondary` 文字色被蓋掉**:切到淺色主題後,主題切換鈕(用
`btn btn-secondary btn-sm`)整個看起來是空白方塊——月亮圖示完全看不見。量
`getComputedStyle` 發現 `color: rgb(255,255,255)`(= `--color-canvas`,淺色下是純白),
不是預期的 `--color-text`。根因:CSS 選擇器特異度——`button.btn`(element+class,
特異度 0-1-1)設了 `text-canvas`,`.btn-secondary`(單純 class,特異度 0-1-0)設
`text-text` 想覆寫,但特異度較低,不論寫在檔案裡的順序在後面都贏不了。這正是封存分支
自己的舊註解警告過的同一個坑(`.btn-danger-ghost` 當時已經用 `button.btn-danger-ghost`
選擇器繞過),Phase 4(一)那批只修了 `.btn-danger-ghost`,漏了 `.btn-secondary`——直到
今天第一次真的截圖看到一個用 `.btn-secondary` 的按鈕(之前的截圖剛好都沒碰到這個 class)
才發現。修法比照舊有precedent:改成 `button.btn-secondary` 選擇器追平特異度。

## ✅ 驗證

- [x] `npm run ci`:typecheck 綠、**284 tests(26 files)全綠**(themeMode 欄位替換未影響
      任何既有測試斷言)、build 成功,`jetbrains-mono-*.woff2` 正確出現在建置產物
- [x] 對比度**實際算過**(見上表),深色維持原有全數通過的紀錄,淺色五個失敗值修正後
      全數 ≥4.34:1
- [x] 隔離啟動 + 截圖:深色 Dashboard/Settings 確認側邊欄與頂部分段切換器同步反映
      active 狀態、發光效果正確顯示;切換到淺色後截圖確認色彩系統正確切換、
      月亮圖示(`.btn-secondary` 修好後)清楚可見、字級對比清晰
- [x] `getComputedStyle` 交叉驗證按鈕文字色數值(修復前 `rgb(255,255,255)`、修復後
      `rgb(2,6,23)`),不只是肉眼判斷「看起來變好了」

## 🔎 自我審查

**檢查情境:這次量出來的 WCAG 失敗值,會不會只是單一背景組合下的個案,換一個實際使用情境
(例如卡片底色而非純白 canvas)反而過關,我修正得太保守/沒必要?**——逐一核對每個失敗值
實際套用的元件:`text-muted` 出現在多處常規內文(field-hint、標籤),量測時特意連
`surface`(#f1f5f9,比 canvas 更常見的卡片底色)都測過,一樣不過;`accent`/`danger` 是
明確存在的 `text-accent`/`text-danger` 用法(dropdown 選中項、ghost 按鈕文字),不是
假設性的;`success` 是 `.btn-success` 白字按鈕底色,`CalibrationWizard.tsx` 確認真的在用
(「Apply」按鈕)。**Pass**——四個修正都對應到真實會被渲染出來的組合,不是杞人憂天。

## 📝 後續待辦

- Phase 4 剩餘:Actions/History/Dashboard 依 `doc/UI_REDESIGN.md` 藍圖 + 這次的雙主題/
  側欄/mono 字體/發光效果規範繼續重建。
- `chartTheme()`(`LiveChart.tsx`/`HistoryView.tsx` 消費)雖已修好指向新 token 名稱,
  但 `Leg3D.tsx`(3D 姿態)直接呼叫 `themeToken()` 讀取一批舊命名 CSS 變數
  (`--leg3d-bg`/`--thigh`/`--accent` 等),且 `THREE.Color()` 建構子吃不下新系統的
  RGB triplet 格式字串(需要 `#rrggbb` 或 `rgb(r,g,b)` 逗號語法)——**這是 teardown
  以來就存在的既有缺陷,今天沒修**,留給 Dashboard 重建時一併處理(3D 視圖本來就是那批
  工作範圍)。
- `doc/UI_REDESIGN.md`/`ROADMAP.md` D5 附近的「單一固定深色主題」相關敘述需要同步更新
  為雙主題現況(上一份日誌已鬆綁「不鎖深色」,這份補上實際落地的雙主題架構)。
