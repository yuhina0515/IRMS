---
tags: [coding-log, doc-01, release-prep]
summary: Committed the 09-16/09-17 offline batch (Roll fix, CON-01 IPC nullability fix, CAL-02 decision doc) as a verified baseline after a clean full CI run, then completed DOC-01's PROJECT_STATUS.md section-by-section rewrite to reflect Tauri reality. Flags issue #3 (real-device E2E, assigned to harold1008, unresponsive) as the top risk for next week's acceptance.
date: 2026-09-19
---

# Baseline commit + DOC-01 PROJECT_STATUS.md rewrite

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260917_next_session_task_schedule|09-17 任務排程]] ·
> [[log_20260917_cal02_design_decision]] · [[log_20260917_con01_ipc_layer_contract_audit]]

## 🎯 目的

使用者告知 IRMS 下週驗收(針對裝置與應用場景,非外觀),要求加速進度並與 Codex 分工。
裝置仍不在使用者身邊,雙方協議:使用者稍後將自己的模型用量調到 high 並讓 Codex 處理另一部分,
這個 session 直接接手 09-17 排定的離線任務佇列。

## 🔍 開工前檢查

- `git status`/`git log` 確認沒有其他代理(Codex)留下新的未預期變更——工作樹裡的 27 個未提交
  檔案的最後修改時間全落在 09-16/09-17,與上次 session 記錄的收尾狀態一致,不是今天新產生的。
- 因此「審查 Codex 已完成的東西」與「commit 09-16/09-17 未提交變更」實質上是同一件事:
  沒有第三方新增的內容需要審查,只有上次 session 留下的、已由 coding log 記錄過的工作。

## 🔧 執行內容

1. **驗證並 commit 09-16/09-17 離線批次**:`npm run ci`(frontend:typecheck + 317 tests + build;
   rust:fmt + 50 tests + clippy `-D warnings`)全綠,確認無密鑰/憑證混入 fixtures 與 evidence
   目錄後,以單一 commit(`af6d300`)納入版控——Roll 退化修復、CON-01 IPC 契約稽核修復、
   CAL-02 決策文件、共用 fixture、14 篇 09-15~09-17 coding log。建立乾淨基準點供後續工作與
   Codex 協作參照。
2. **DOC-01:PROJECT_STATUS.md 逐節重寫**:舊版全文寫於 Tauri 遷移前,描述的是已退場的
   Electron v2 世代(`v1.0.5`)。逐節核對現況後重寫:版本號、測試數量(317/50,回頭跑
   `npm run ci` 驗證而非沿用舊數字)、DB schema(user_version=7)、IPC 契約現況(CON-01 稽核
   結果)、校準狀態(CAL-02/CAL-03 現況)、已知風險表(issue #3 真機 E2E 未驗證列為 🔴 最高
   風險並附驗收時程警語)、已完成驗證(拆成 Tauri 世代 vs Electron 世代兩段,避免讀者誤以為
   Electron 世代的實機驗證證明了 Tauri 版本身)、檔案狀態表(路徑改指向 `IRMS_App_Tauri`)。
3. **順帶修正 `IRMS_App_Tauri/README.md` 的一句失真敘述**:CON-01 稽核已發現「`irmsApi.ts`
   是唯一的 IPC adapter」不準確(`bluetooth.ts`/`splash.ts` 也直接呼叫 `invoke()`),上次
   session 記錄了這個落差但留給 DOC-01 處理——本次一併修正敘述本身,未變更程式架構
   (是否收攏成單一 adapter 是獨立的架構決策,不在文件核對範圍內擅自決定)。

## ⚠ 發現的風險(非本次修復範圍,但必須浮出)

追查「Tauri 版實機驗證」現況時,核對 GitHub issue 與 HOME.md 歷史紀錄,確認:

- issue [#3](https://github.com/yuhina0515/IRMS/issues/3)(Tauri 版完整真機 E2E:連線→達標→
  超限→斷線復原)自 2026-09-10 遷移以來**從未在 Tauri 版上驗證過**。
- 2026-09-11 已指派給有裝置存取權的隊友 `harold1008`,附既有 30 分鐘驗證腳本,**截至最近一次
  追蹤紀錄仍無回應**。
- 使用者自己的裝置目前也不在身邊(本次 session 開場確認)。

兩條可能取得真機驗證的路徑目前都卡住。若下週驗收前這個狀態沒有改變,「裝置與應用場景」驗收
會缺少任何一次 Tauri 版完整真機驗證證據——這已寫入 PROJECT_STATUS.md 的「一句話現況」段落
最上方作為警語,並在對話中回報給使用者,不只是埋進文件裡。

## ✅ 驗證方式

- [x] `npm run ci` 全綠(commit 前一次、rewrite 過程未再改動程式碼)。
- [x] PROJECT_STATUS.md 每個數字/宣稱回頭核對:`package.json`/`Cargo.toml` 版本號、
  `migrations.rs` MIGRATIONS 陣列長度、`gh issue list` 實際狀態、CON-01/CAL-02 兩篇 09-17
  log 的具體結論——不是憑印象轉述舊版文字。
- [ ] 真機驗證:不適用,本次全程離線工作。

## 📝 後續待辦

- 離線佇列下一項(依 09-17 排程):CON-01 續完的低優先項(`packets.txt` 統計分析,66,927 筆
  既有 trace,機率不高,排最後)或 Tauri 元件/旅程層測試覆蓋缺口(見 OPTIMIZATION.md §三,
  `DashboardView`/`SettingsView` 尚無 `.test.tsx`)。
- 使用者需決定如何處理 issue #3/Harold 卡住的狀況——這是這個 session 判斷範圍外的人員協調
  決定,已回報但不代它自行聯繫或催促。
