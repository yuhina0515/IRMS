---
tags: [coding-log]
date: 2026-09-02
summary: "使用者糾正:「不要執著深色」——拿掉先前 Phase 1(09-01)定下的「固定深色主題,不再需要淺色」這條鎖死條件。更新 doc/gemini-handoff-20260902/README.md 與 doc/UI_REDESIGN.md,把深色從「已定調範圍」移到「開放給外部設計判斷」;現有 tailwind.config.js 的深色 token 維持不動(仍是目前實際實作),但不再被文件宣稱為終局答案。本次純文件修正,無程式碼變更。"
---

# 2026-09-02 變更日誌 — 解除「固定深色主題」的鎖定

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260902_design_handoff_pivot|同日稍早:轉向外部設計支援]] ·
> `doc/gemini-handoff-20260902/README.md` · `doc/UI_REDESIGN.md`

## 🎯 請求

使用者:「不要執著深色。」

## 🔍 背景

2026-09-01 的 Phase 1 發現階段(見 [[log_20260901_ui_redesign_phase1_phase2]])把「單一
固定深色主題,不再需要可切換的風格設定檔」記成已確認方向,並據此在 Phase 4 移除了
Settings 的 Appearance 面板(見 [[log_20260902_ui_redesign_phase4_settings_and_logo_fix]])。
這次使用者糾正:深色不該被當成鎖死的終局答案。

## 🔧 已完成

- `doc/gemini-handoff-20260902/README.md`:「已定調不可逆」清單移除「Single fixed dark
  theme」一條,改成明確說明「淺色/深色是開放問題,截圖是深色只因為目前剛好是這樣實作,
  不代表深色就是答案」。同時在色彩 token 表格前加註:目前實作是深色,但這不是對外部設計
  產出的限制。
- `doc/UI_REDESIGN.md`:Phase 1 方向清單的「Tone」拿掉「dark」字眼,並在 Token 段落補充
  警語——`tailwind.config.js` 現有的深色 token 仍是**目前的實作**,但淺深色選擇現在是
  外部設計 handoff 的開放輸入項,不是已鎖定的限制,Phase 4 後續工作不該在沒看到外部設計
  產出前就自行把深色重新鎖死。

**沒有改動的部分(刻意)**:`tailwind.config.js` 的實際色彩數值、`SettingsView.tsx` 移除
Appearance 面板的決定——這兩者都是「目前的實作狀態」,不是這次要修正的對象。這次修正的是
**文件對未來方向的宣稱**,不是回頭重做已經完成的程式碼變更;等外部設計產出真正帶回來,
才是決定要不要恢復可切換主題、或改成別的淺色系統的時機。

## 🧠 關鍵決策

**不順勢恢復 Appearance 面板/風格切換系統**:使用者這句話糾正的是「深色被鎖死當終局答案」
這個過早的定案,不是在要求「立刻做出淺色版本」或「立刻恢復切換功能」——那會是在還沒有
外部設計方向的情況下,又一次靠自己的判斷往前蓋。正確的回應範圍是把文件裡過早鎖死的宣稱
鬆開,讓外部設計輸入進來時有空間被採納,而不是搶先實作一個可能整個被推翻的方案。

## ✅ 驗證

純文件修正,無程式碼變更,不適用 `npm run ci`。

## 🔎 自我審查

**檢查情境:鬆開「深色」這個鎖定,會不會連帶不小心也鬆開了其他其實使用者沒有要重新討論的
已定調項目(例如 bento 方向、不用 Apple 語系)?**——逐一核對 `gemini-handoff-20260902/
README.md` 的「已定調」清單,只移除了深色這一條,「No more Apple/Liquid Glass anything」
「Bento-grid card layout」「Single-page shell」三條原文照留未動。**Pass**——修正範圍精準
對應使用者這句話實際指出的那一項,沒有過度延伸。

## 📝 後續待辦

- 與 [[log_20260902_design_handoff_pivot]] 相同:等待使用者帶回外部設計工具的產出後再繼續
  Phase 4 剩餘工作與 Phase 5,現在多了一項開放輸入——淺色/深色(或兩者皆備)由外部設計
  判斷決定,不預設答案。
