---
tags: [coding-log, decision, design]
date: 2026-09-11
summary: "User instructed that Gemini 3.1 Pro / 3.8 Flash should fully lead all art/UI design going forward, with the AI coding role stepping entirely out of aesthetic judgment. This extends the 2026-09-02 'Gemini's UI decisions are final' delegation to 'this role does not originate design proposals at all.' Documented in AI_CODING_RULES.md new §1.1; no code changed."
---

# 2026-09-11 變更日誌 — 視覺/UI 設計權責全權移交 Gemini

> **相關文件**:[[HOME|導覽首頁]] · [[AI_CODING_RULES]] ·
> [[log_20260902_ui_design_delegated_nav_cockpit|前一次相關決定:UI 設計全權交給 Gemini]]

## 🎯 目的

使用者明確指示:「讓 Gemini 3.1 Pro 或是 Gemini 3.8 Flash 進行主導藝術設計及 UI 設計,讓
你完全脫離這類藝術設計。」這比 09-02 的既有慣例更進一步——09-02 定的是「Gemini 給出的
UI/IA 決定照做,不回頭找使用者裁決」,範圍是「聽誰的」;這次是「這個角色本身不再產生美術
判斷」,範圍是「誰來想」。兩者疊加後,AI 協同開發角色在 IRMS 專案裡對「好不好看」這個維度
完全沒有輸入權,只剩下「查證可驗證的事實」與「忠實實作」兩件事。

## 🔧 動作

- `doc/AI_CODING_RULES.md` 新增 §1.1「視覺/UI/藝術設計權責」,寫入四條具體規則(只實作
  不設計、可驗證事實仍要查證、純工程判斷不受影響、handoff 素材慣例維持不變),明確銜接
  09-02 已有的委任決定,避免讀者以為這是兩條獨立、可能衝突的規則。
- `doc/HOME.md` 補一條狀態速記指向本篇日誌。
- 無程式碼變動——目前沒有進行中的 UI 工作,這次純粹是把權責範圍寫清楚,供下次真的有
  UI/視覺相關任務時依循。

## 📐 決策

- **寫進 `AI_CODING_RULES.md` 而非只存在對話記憶裡**——這條規則會影響所有未來涉及 UI 的
  工作階段,包含未來全新開啟的對話(既有的 09-02 委任決定就是靠寫進這份文件才能在對話之外
  存活,同一個道理適用於這次的擴大版)。
- **不重寫 09-02 的既有文字,新增一節銜接**——09-02 的決定本身沒有錯,只是範圍不夠大;
  刪掉重寫會讓兩次決定的先後脈絡消失,新增一節並明講「延伸範圍」保留了決策歷史的可追溯性。

## ✅ 驗證

不適用——純文件變更,沒有可執行的驗證對象。下一次真的有 UI 相關任務進來時,實際行為
(是否還會主動提出美術意見、是否還會針對 Gemini 的規格做美感層面的質疑)才是這條規則
真正的驗證點。

## Self-review

檢查情境:「這條規則會不會被誤讀成『連事實查核都不用做』,导致 Gemini 算錯的對比度數字
被照單全收?」——§1.1 第二條規則刻意把「可驗證的事實」與「好不好看的判斷」明確拆成兩件
不同的事,並直接引用 09-02 round2 那次真的抓到 Gemini 算錯對比度的先例作為理由。
**PASS**——文字本身已經預先擋掉這個最可能的誤讀方向,不需要額外修正。
