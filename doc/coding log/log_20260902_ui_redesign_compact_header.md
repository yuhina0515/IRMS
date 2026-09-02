---
tags: [coding-log]
date: 2026-09-02
summary: "使用者反饋頂部 TopHeader 偏大,收緊尺寸:logo 28px→20px、標題 text-lg→text-sm、連線狀態文字縮小、內距 py-3→py-2/px-5→px-4、header 內的 Connect Device 按鈕另開專屬尺寸(不動全域 .btn,避免波及其他頁面按鈕)。截圖驗證頂列明顯收緊,下方 SegmentedControl 與內容不受影響。"
---

# 2026-09-02 變更日誌 — TopHeader 收緊尺寸

> **相關文件**:[[HOME|導覽首頁]] ·
> [[log_20260902_ui_redesign_phase4_settings_and_logo_fix|Phase 4(二)Settings + logo bug]]

## 🎯 請求

使用者:「上面的 bar 可以考慮做小。」

## 🔧 已完成

`tailwind.css` 的 `.top-header` 系列:logo `28px→20px`、`.logo h1` `text-lg→text-sm`、
`.conn` 連線狀態文字 `text-sm→text-xs`、外距 `py-3→py-2`、`px-5→px-4`。header 內的
`Connect Device`/`Disconnect` 按鈕新增 `.top-header button.btn` 專屬尺寸覆寫
(`px-3 py-1.5 text-sm`),**不改動全域 `.btn`**——頂列需要更緊湊,不代表其他頁面內容區的
按鈕也該跟著縮小。

**追加(同日)**:使用者接著回饋「左右縮」——比照垂直軸的收緊邏輯套用到水平軸:
`.app` 外距 `p-4`(四邊 16px)拆開,水平收到 `px-3`、垂直維持 `py-4`;`.top-header`
內距 `px-4→px-3`。整個外殼(頂列 + SegmentedControl + 內容區,三者都在 `.app` 的
padding 範圍內)左右邊距一起收緊,不是只動 header 一處。

## ✅ 驗證

- [x] `npm run ci`:typecheck、**284 tests**、build 全綠
- [x] 隔離啟動 + 截圖比對:頂列明顯收緊,`SegmentedControl` 與下方內容未受影響(只動了
      使用者指名的「上面的 bar」,範圍沒有溢出)
- [x] 「左右縮」後重新截圖:整個外殼左右邊距一起變窄,`npm run ci` 全綠

## 🔎 自我審查

**檢查情境:縮小 header 按鈕尺寸的選擇器夠不夠精準,會不會不小心波及其他地方的
`.btn`?**——用 `.top-header button.btn`(祖先限定)而非直接改 `.btn`/`.btn-sm` 本身,
截圖確認 Settings/Dashboard 等頁面內的按鈕尺寸維持原樣不變。**Pass**。
