---
tags: [coding-log]
date: 2026-07-12
summary: "Apple 風格雙主題(淺/深跟隨系統):global.css 重寫為語意 token 架構、新增 theme.ts 供 canvas 類解析 token、Chart.js/Three.js 主題切換即時換色;71 tests 綠 + dev 啟動驗證"
---

# 2026-07-12 變更日誌 — Apple 風格雙主題

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260711_ui_throttle_perf|前置:UI 節流]]

## 🎯 目的

使用者想把 app 改成 Apple 風格,選擇「淺/深雙主題、跟隨系統」。

## 🔧 變更內容

1. **`styles/global.css` 全面重寫** — 語意 token 架構:
   - `:root` 定義淺色(iOS systemGroupedBackground 灰白底 #F2F2F7、白卡片、
     Apple 系統色 #007AFF/#34C759/#FF3B30/#FF9500),
     `@media (prefers-color-scheme: dark)` 覆寫深色(#1C1C1E 底、#2C2C2E 卡片、深色系統色)。
   - `color-scheme: light dark` 讓原生控件/捲軸一併跟隨。
   - 所有 tinted 填色(badge、phase 徽章、nav active、focus ring)改用
     `color-mix(in srgb, var(--x) N%, transparent)`(Electron 33 = Chromium 130,支援無虞)。
   - 材質語言:玻璃擬物 → 不透明卡片 + 髮絲線 + 極輕陰影;tabs 改 Apple segmented 樣式;
     按鈕改扁平填色;數字欄位加 `tabular-nums`。
   - class 名與版面 **完全不動**(.glass 沿用,只換材質定義)。
2. **`services/theme.ts`(新增)** — `themeToken()`(getComputedStyle 解析)、
   `onSystemThemeChange()`(matchMedia 訂閱)、`chartTheme()`(Chart.js 共用色組)。
   canvas 類(Chart.js/Three.js)吃不到 CSS 變數,統一經此層解析同一組 token。
3. **元件去寫死色**:
   - MetricGauge/ProgressRing/AngleVisualizer:rgba 寫死 → `var(--gauge-track/--ring-track/--arc-idle …)`。
   - LiveChart:建圖時用 `chartTheme()`,`onSystemThemeChange` 即時重套色。
   - HistoryView 分析圖:建圖時解析(modal 短命,不掛監聽)。
   - Leg3D:背景/網格/肢段/膝點三態色全部 token 化,`applyTheme()` 於主題切換時
     重設材質色並重建 GridHelper。
4. **`main/index.ts`**:BrowserWindow `backgroundColor` 改 `nativeTheme.shouldUseDarkColors`
   判斷(#1C1C1E / #F2F2F7),避免啟動閃色。

## 🧠 關鍵決策

- **canvas token 僅用純色值**(hex/rgba),`color-mix()` 只用於 CSS 端——
  `getComputedStyle` 對未註冊 custom property 回傳原字串,Three/Chart 解析不了 color-mix。
- log-panel 主控台維持深底綠字(兩主題同),終端機語意比硬轉淺色自然。
- 硬體錯誤紅色遮罩維持原樣(安全警示不隨主題淡化)。

## ✅ 驗證

- [x] `npm run ci` 全綠:typecheck + 71 tests + build
- [x] `npm run dev` 啟動正常、無 renderer 錯誤(留給使用者實看)
- [ ] 👀 使用者視覺驗收:淺/深兩種系統主題下逐頁檢查(Dashboard/History/Settings/精靈/Toast)
- [ ] 切換 Windows 深淺主題,確認圖表/3D 即時換色(matchMedia 路徑)

## 📝 後續待辦

- 視覺驗收後微調(間距、字級、色彩對比)依使用者回饋進行
- 若要 in-app 主題切換(不跟系統),再加 `data-theme` 覆寫層 + nativeTheme.themeSource
