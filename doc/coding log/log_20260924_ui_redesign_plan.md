---
tags: [coding-log, ui, plan, tauri]
summary: 使用者要求「IRMS UI 大改版計畫」。盤點 beta.10 現況(1468 行樣式表中約 1170 行是被 beta8 覆寫層蓋住的舊層、三套互相不一致的工作區命名、Dashboard 重複標題、無視覺回歸基準),寫成 doc/UI_REDESIGN_V2_PLAN.md:P0 決策閘門 → P1 零視覺差異地基整理 → P2 設計 token → P3 Dashboard 狀態驅動重構 → P4 其他工作區 → P5 外殼 → P6 實機驗收。依 AI_CODING_RULES §1.1,美術判斷全部留成設計輸入槽,未由本角色決定。只寫計畫,未改任何程式碼。
date: 2026-09-24
---

# 2026-09-24 變更日誌 — IRMS UI 大改版計畫

> **相關文件**:[[HOME|導覽首頁]] · [[UI_REDESIGN_V2_PLAN|UI 大改版計畫]] · [[UI_REDESIGN|現行 UI 規格 (beta8)]] ·
> [[log_20260915_beta8_desktop_workstation_redesign|beta8 重構日誌]] ·
> [[log_20260914_bug_pass_and_gemini_design_language_brief|09-14 Gemini 設計語言 brief]]

## 🎯 目的

使用者要求「IRMS UI 大改版計畫」。本次只產出計畫文件,不動程式碼。

## 🔍 盤點發現(皆為讀碼可查證事實)

1. `src/styles/tailwind.css` 1468 行,第 1172 行起是「Beta 8 layer」,以後蓋前方式覆寫前面約
   1170 行舊規則——再改一次設計若不先拆層,會變成第三層覆寫。
2. `.sidebar-toggle`、`.app-shell` 已無 TSX 引用;`.glass`、`LiquidKnob`、`GlassDropdown` 等
   Liquid Glass 世代命名仍在使用,與現行視覺語言脫鉤。
3. 同一工作區有三套名字:`Sidebar.tsx` 英文(Dashboard…)、`TopHeader.tsx`(即時監測/動作處方/
   療程紀錄/系統設定)、`App.tsx` ErrorBoundary(即時監測/動作設定/歷史紀錄/設定)。
4. `DashboardView` 內的 `Guided Monitoring` page-header 與命令列標題重複。
5. 所有 `*.test.tsx` 以 role/文字查詢,無 `querySelector`/`toHaveClass`——純樣式重構不會打壞
   測試,改文案才會。
6. 沒有常設的視覺回歸基準(09-14 的 Playwright 量測用完即刪)。
7. 09-14 Gemini 設計語言 brief 從未拿到回覆,§1.1 設計權責至今懸置。

## 🧭 計畫重點(詳見 [[UI_REDESIGN_V2_PLAN]])

- **P1 地基整理先做、且要求截圖零差異**:正式化 Playwright 視覺回歸、拆樣式表、刪死碼、中性命名、
  單一工作區標籤表。不依賴設計輸入,可在裁決前開始。
- **P3 Dashboard 改為狀態驅動**:把散在 `hintText`/`tone` 巢狀三元式裡的判斷抽成
  `dashboardState.ts` 純函式(只搬位置、不改結果),12 個狀態各自有可測試的呈現。
- **對比度檢查自動化**:把 09-02 round2 的人工 WCAG 查證變成 `tokens.contrast.test.ts`。
- **邊界**:BLE/判定/session/DB/校準/OTA/updater 不動;原生 decorations 保留;驗收結束前不合併。

## ⚖ 設計權責

依 [[AI_CODING_RULES]] §1.1,計畫中配色、字級、動效、構圖等一律標為 🎨 設計輸入槽,本角色
未提出任何美術方案。誰來填這些槽(恢復 Gemini/使用者/修改 §1.1)列為決策 D-1,交使用者裁決。

## ✅ 驗證方式

- [x] 盤點數字以 `grep`/`wc` 對現行原始碼實際核對(行數、選擇器引用、測試查詢方式、`decorations` 設定)
- [ ] 無程式變更,未跑 `npm run ci`(不適用)

## 📝 後續待辦

- 使用者裁決 [[UI_REDESIGN_V2_PLAN]] §7 的 D-1~D-5。
- D-2 若選「驗收後合併」,P1 可先在 `claude/irms-ui-redesign-38fvnr` 分支上開工。
