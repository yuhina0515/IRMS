---
tags: [coding-log, docs, doc-01]
summary: Added prominent current-architecture corrections to README.md and PROJECT_STATUS.md pointing at Tauri/HOME.md; did not rewrite the Electron-era detail wholesale (too much surface area to re-verify safely in one offline session).
date: 2026-09-16
---

# DOC-01: point README/PROJECT_STATUS at the current Tauri architecture

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260916_status_and_task_plan|任務計畫 DOC-01]]

## 🎯 目的

今晚第三項離線任務。`doc/README.md` 與 `doc/PROJECT_STATUS.md` 仍完整以 Electron 為主敘事
(架構圖、技術棧、安裝步驟、v1.0.5 版本號),但 `IRMS_App_Tauri` 自 09-10 起才是現役桌面實作,
manifests 已在 `1.2.0-beta.10`。

## 🔧 變更內容

**`doc/README.md`**:
- 第 1 節系統概述後加現況更正:指出現役是 `IRMS_App_Tauri`,Electron 章節屬 v2 世代歷史文件,
  連結到 `IRMS_App_Tauri/README.md`。
- 第 3 節架構圖前加提示:3.2/4.2/5.3 小節(原 5.2)描述的是已被取代的 Electron 架構。
- 新增 5.2「應用端(現役,Tauri App)」:摘要開發指令(`npm run tauri dev`、`npm run ci`)與
  技術棧,內容直接取自 `IRMS_App_Tauri/README.md`,未自行推測未驗證過的實作細節。原本的
  5.2(Electron 安裝步驟)改為 5.3,標題加註「v2 世代,保留供尚未除役前參考」。

**`doc/PROJECT_STATUS.md`**:
- 更新日期區塊加警語:全文含「一句話現況」與 v1.0.5 版本號寫於 Tauri 遷移之前,不代表現況,
  現況請見 HOME.md 與 coding log,並如實標註「本檔按原文保留作為 Electron v2 階段的歷史快照,
  尚未依決策 D2 重寫」——沒有動內文本身。

## ⚠️ 為什麼沒有整篇重寫

`PROJECT_STATUS.md` 內文有數百行 Electron 時代的細節主張(測試數量、DB schema 驗證狀態、
真機驗證逐項清單等),逐項核對是否仍適用於 Tauri 現況需要獨立的完整審查,不是今晚離線這一批
可以安全完成的範圍(誤把過時主張改寫成看似現況但其實還沒驗證過的新主張,风险跟不改一樣,甚至
更隱蔽)。今晚做的是「讓讀者知道要去哪裡找現況」而非「重寫現況本身」——後者仍是 DOC-01
任務表上的完整範圍,需要之後有意識地逐節核對再動筆。

## ✅ 驗證方式

- [x] `doc/README.md` 5.1/5.2/5.3 章節編號與內文交叉引用(「3.2、4.2、5.3」)手動核對一致。
- [x] 純文件變更,無程式碼影響,未跑 CI(不涉及)。

## 📝 後續待辦

- 若要完成 DOC-01 的完整範圍:逐節核對 `PROJECT_STATUS.md` 的測試數量、DB schema、真機驗證
  清單等主張是否仍適用於 `IRMS_App_Tauri`,直接改寫內文(而非只加警語),並同步核對
  `TAURI_MIGRATION_PLAN.md` 的退場條件描述是否仍準確。
