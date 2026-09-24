---
tags: [coding-log, ui, design, tauri]
summary: 使用者裁定 D-1——設計稿改由 Claude Code 或 GPT 6 Astra 產出(Gemini 退出設計角色)。改寫 AI_CODING_RULES §1.1,並產出第一版設計語言規格 doc/UI_DESIGN_LANGUAGE_V2.md:雙主題色票(全部經腳本實算通過 WCAG AA)、狀態色與系列色分離、字級(主指標 104px / 專注模式 160px)、動效 token、Dashboard 12 狀態構圖與病患專注模式。仍只有文件,未改程式碼。
date: 2026-09-24
---

# 2026-09-24 變更日誌 — 設計權責改定 + 設計語言 v2 規格

> **相關文件**:[[HOME|導覽首頁]] · [[UI_DESIGN_LANGUAGE_V2|設計語言 v2]] · [[UI_REDESIGN_V2_PLAN|UI 大改版計畫]] ·
> [[log_20260924_ui_redesign_plan|同日稍早:改版計畫]]

## 🎯 目的

使用者回覆計畫的 D-1:「現在設計稿可以由你或 GPT 6 Astra」。據此解除 §1.1 對本角色的設計限制,
並直接填入計畫 P2/P3 的 🎨 設計輸入槽。

## 🔧 變更內容

1. **`AI_CODING_RULES.md` §1.1 改寫**:設計來源 = Claude Code 或 GPT 6 Astra,使用者最終裁決;
   Gemini 退出設計角色(09-11~09-24 的委任期保留為歷史)。保留「可驗證事實一律實算」紀律,
   並新增交叉審閱規則(兩方衝突且無法以事實裁定 → 交使用者)。
2. **`doc/UI_DESIGN_LANGUAGE_V2.md`**(新):設計理念三原則(狀態先於數據/遠看得懂/安靜直到需要注意)、
   雙主題「日間/低光」完整 token、狀態語意規則、字級與距離可讀依據、間距/圓角/邊框、動效 token 與
   警報動效安全限制、外殼、Dashboard 12 狀態優先序與構圖、專注模式、其他三個工作區、給 GPT 6 Astra
   的交叉審閱範圍。
3. **`doc/design-v2/contrast_check.py`**(新):對比度實算腳本。兩主題所有文字 × 背景 ≥ 4.5:1、
   系列線/accent/`control-border` ≥ 3:1,全部通過(`FAIL` 計數 = 0)。
4. **計畫 `UI_REDESIGN_V2_PLAN.md`**:D-1 標記已裁定,連到設計規格。

## 🧭 設計方代為裁定的計畫決策

- D-3 病患專注模式:**要**。
- D-5 雙主題:**保留**,預設跟隨系統。
- D-4 介面語言:**提案**全面繁中(技術縮寫除外),因會改動測試斷言,**待使用者確認**。
- D-2 合併時程:非設計範疇,**仍待使用者裁決**。

## 🐛 順帶指出的既有語意問題

beta8 的 `--color-thigh = --color-warning`、`--color-shin = --color-success`:圖表的大腿線與「警告」
同色、小腿線與「達標」同色。v2 將系列色與狀態色完全分開,灰階下另以線型區分。

## ✅ 驗證方式

- [x] `python3 doc/design-v2/contrast_check.py`:0 個 FAIL
- [x] 深色主題 danger 上的白字實算僅 2.68:1 → 規格改用深色字 `on-danger`(6.98:1)
- [ ] 視覺效果:尚無實作,需 P1 截圖基建完成後以實際畫面審閱
- [ ] 無程式變更,未跑 `npm run ci`

## 📝 後續待辦

- 使用者審閱設計規格;需要時交 GPT 6 Astra 交叉審閱(規格 §10)。
- 使用者裁決 D-2、確認 D-4。
- P1(零視覺差異地基整理)可開工。
