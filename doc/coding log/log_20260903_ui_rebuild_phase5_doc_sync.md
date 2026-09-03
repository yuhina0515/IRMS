---
tags: [coding-log, ui, docs, cleanup]
summary: UI 重建 Phase 5——PROJECT_STATUS/OPTIMIZATION/UI_REDESIGN 三份文件對齊已完成的 Tailwind 重建現況,刪除死檔 global.css
date: 2026-09-03
---

# 2026-09-03 變更日誌 — UI 重建 Phase 5:文件/死碼整頓

> **相關文件**:[[HOME|導覽首頁]] · [[PROJECT_STATUS|開發進度]] · [[OPTIMIZATION|優化待辦]] · [[UI_REDESIGN|UI 重建藍圖]]

## 🎯 目的

使用者要求「開始進行 IRMS App renew 計畫」。專案文件裡沒有既定的「renew」計畫,經
`AskUserQuestion` 確認範圍為:UI 重建 Phase 4(2026-09-02 完成,Gemini 設計委任落地
側欄導覽 + Dashboard Cockpit)之後的 Phase 5 續作。盤點後發現核心文件仍大量描述已於
2026-09-01 拆除的舊版 Apple Liquid Glass / Appearance 風格設定檔系統,依決策 D2(程式
為準,文件不符則修文件)進行一次文件與死碼同步。

## 🔧 變更內容

- 刪除 `IRMS_App/src/renderer/src/styles/global.css`:全文 grep 確認 `main.tsx` 只
  import `tailwind.css`,此檔案已無任何 import 引用,純死碼。
- 修正 `GlassDropdown.tsx`(第 4 行)與 `LiquidKnob.tsx`(第 3、22 行)裡指向
  「詳見 global.css」的過時註解 → 改指向實際定義 keyframes 的 `tailwind.css`。
- `PROJECT_STATUS.md`:
  - 更新日期改為 2026-09-03,註明硬體相關內容自 08-29 起未變。
  - 「應用端版本」列補上 `main` 已領先 v1.0.5 已發布安裝檔的說明(整套 UI 重建 + 移除
    v1.0.5 才新增的 Appearance 面板,尚未包裝發布)。
  - 「外觀」條目全面改寫:Tailwind CSS variable 雙主題(深色 Data-Console / 淺色
    Precision Lab)、bento grid、側欄唯一導覽、JetBrains Mono 數值字型,取代原本描述
    Apple 語意 token / Liquid Glass / Appearance 風格設定檔的段落。
  - 修正一併發現的既有錯誤:韌體檔案清單寫著「待燒錄」,但同檔案別處與 HOME.md 都記錄
    2026-08-07/08-28 已實際燒錄——文件內部自相矛盾,一併修正。
  - 檔案清單的 `styles/global.css` 條目改為 `styles/tailwind.css`。
- `OPTIMIZATION.md`:「外觀風格設定檔系統」P2 項目標記刪除線並加註「⚠ 2026-09-01 移除」
  ——不是被會議否決,是被整批 UI 重建取代;保留紀錄避免「加風格切換」的提案未來被誤判
  成全新點子重新辯論一次(比照專案既有的否決項保留慣例)。
- `UI_REDESIGN.md`(living blueprint,規則是直接改寫、不是疊加歷史):
  - Phase 1「Direction」的雙層導覽敘述與後面 Phase 3 修訂版(側欄為唯一導覽)矛盾,
    改寫為與現況一致的敘述,並說明雙層導覽是嘗試過又被 Gemini 稽核建議拿掉的中間態。
  - Settings 段落的「`applyStyleProfile.ts`/`styles/profiles/` 是死碼,尚未刪除」
    改為「已於本次 Phase 5 一併清除,`theme.ts` 的 `applyThemeMode()` 是唯一主題路徑」。
  - Responsive breakpoints 段落移除「頂部 SegmentedControl 收窄成捲動 pill row」的
    過時敘述(該元件已刪除),改為誠實記錄:`Sidebar.tsx` 目前沒有任何響應式 class,
    窄螢幕行為未定義/未實作(手機版本走獨立 React Native,見 ROADMAP D5,不是這個
    Sidebar 元件的責任)。
  - 「Open for Phase 4」章節改寫為「Phase 4 — complete」+「Phase 5 — doc/dead-code
    sync」,明確標示目前沒有從 Phase 4 延續下來的未決設計問題。
- `HOME.md` 狀態速記新增本次條目。

## ✅ 驗證方式

- [x] `grep -rn "global.css" IRMS_App/src` 刪除後只剩 `tailwind.css` 內部自我說明的
      註解(對比舊系統),無任何實際 import 引用。
- [x] `npm run ci`(typecheck + test + build)全綠:284 tests / 26 files,build 87
      modules transformed,與刪除前一致(比對確認刪除死檔沒有連帶砍掉任何被使用的
      CSS)。
- [x] 自我審查情境:「刪除 global.css 若其實還有隱藏 import,typecheck 不會抓到,只有
      build 會炸」——已用 `npm run build`(Vite)實際跑過並確認成功,不只看 typecheck
      通過就下結論。

## 📝 後續待辦

- 無延續自 Phase 4 的設計待辦;下一步 UI 工作(若有)從使用者的新指示重新開始,見
  `UI_REDESIGN.md`「Phase 5」段落。
- 桌面端功能仍待的是既有 issue #3(實機 E2E 回饋/警報鏈),與本次文件/死碼整頓無關,
  不受影響。
- 尚未包裝發布新安裝檔(`main` 現況 vs 已發布 v1.0.5 的落差已在 `PROJECT_STATUS.md`
  記錄,留待使用者決定何時發版)。
