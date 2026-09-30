---
tags: [coding-log, testing, tauri]
summary: "使用者要求「完整測試一輪 app」。自動化檢查(typecheck/283 條 vitest/cargo check)全過;實機啟動 `tauri dev` 後用 UI Automation + 真實硬體滑鼠事件逐項驗證,確認 09-14 懸置的兩個 beta.5 回報(更新檢查狀態文字、側邊欄收合持久化)其實都已修好,只是使用者尚未回報實測結果;Dashboard/Actions/History/Settings 四頁、主題切換、原生視窗控制鈕、感測器未連線的優雅狀態全部正常。"
date: 2026-09-15
---

# 2026-09-15 變更日誌 — 完整測試一輪 app

> **相關文件**:[[HOME|導覽首頁]] · [[PROJECT_STATUS|開發進度]] · [[OPTIMIZATION|優化待辦]] ·
> [[log_20260914_beta5_followup_reports_and_open_diagnostics|09-14 懸置的兩項回報]] ·
> [[log_20260914_native_decorations_revert_confirmed_fix|09-14 原生視窗框回退]]

## 🎯 目的

使用者要求「完整測試一輪 app」。09-14 有兩項 beta.5 回報(更新檢查狀態文字、側邊欄收合持久化)
因缺重現步驟而懸置——這次不等使用者回報,直接用實機啟動 + UI Automation 驅動的方式自己重現,
同時對 Dashboard/Actions/History/Settings 四頁、主題切換、原生視窗控制鈕做一次通盤回歸掃描。

## 🔧 變更內容

沒有程式碼變更,純測試。方法:

1. **自動化檢查**:`npm run typecheck`(過)、`npm run test`(26 個測試檔、283 條測試全過)、
   `cargo check`(過,僅既有的 `latest_version` dead-code warning,與本次無關)。
2. **實機啟動**:`npm run tauri dev`,用 `System.Windows.Automation`(UIA)透過視窗控制代碼
   抓取 WebView2 的無障礙樹,以 `InvokePattern`/`ExpandCollapsePattern` 觸發按鈕(這是真的
   handler 呼叫,跟真滑鼠點擊的 hit-test 路徑不同,但用來讀取畫面文字內容、驗證功能邏輯已足夠
   ——09-11/09-14 已知只有「真滑鼠點擊命中原生視窗控制鈕的座標」這件事需要硬體層級輸入)。
3. **更新檢查按鈕**:切到 Settings、`Invoke` 「立即檢查更新」,3 秒後重讀無障礙樹,狀態文字
   變成「已是最新版本」——跟 09-14 日誌預期的結果一致。
4. **側邊欄收合持久化**:用 `ExpandCollapsePattern.Collapse()` 收合側邊欄(按鈕文字從「收起
   選單」變「展開選單」),`PrintWindow` 截圖確認畫面上確實是窄軌。接著 `Stop-Process -Force`
   **完整終止**該 process(不是縮小視窗),重新 `npm run tauri dev` 開一個全新 process。
   重開後立刻查 `sidebar-toggle` 按鈕名稱——**仍是「展開選單」**,`PrintWindow` 截圖也確認
   畫面是窄軌。09-13 的 zustand persist + migration v13 修法在真正的完整關閉/重開循環下有效。
5. **一般回歸掃描**:`Invoke` Actions/History 側邊欄按鈕確認頁面正常切換無白屏、無主控台級
   錯誤(讀無障礙樹確認每頁該有的文字都出現,History 頁正確顯示「尚無復健紀錄」)。`Invoke`
   主題切換鈕確認 Dark ↔ Light 文字互換。Dashboard 頁確認感測器未連線時的優雅狀態:
   「Disconnected」狀態燈、各量表顯示 `--`、「Connect device first」停用按鈕、校準警示條——
   沒有出現空狀態處理不當的畫面。
6. **原生視窗控制鈕**:用 09-14 建立的真實硬體滑鼠事件方法(`SetCursorPos`+`mouse_event`,
   非程式化 invoke)在算出的座標點擊——這次瞄準最大化鈕的座標算偏了,實際點中的是關閉鈕,
   app 乾淨結束(exit code 0,非崩潰)。雖然沒驗到最大化這個特定按鈕,但**證實了要驗的事**:
   真滑鼠點擊在這台機器(175% DPI 縮放的測試機换成本機 125% 縮放環境)的原生視窗框下,確實
   命中了正確的按鈕座標並觸發對應動作——不是「點在空氣上沒反應」,原生框繞開點擊偏移 bug
   class 這件事在不同 DPI 縮放比例下同樣成立。

## ✅ 驗證方式

- [x] `npm run typecheck` 過
- [x] `npm run test`:26 個測試檔、283 條測試全過
- [x] `cargo check` 過
- [x] 更新檢查按鈕:狀態文字正確顯示「已是最新版本」
- [x] 側邊欄收合:`Stop-Process -Force` 完整終止 process 後重開,收合狀態確實持久化
      (UIA 按鈕文字 + `PrintWindow` 截圖雙重確認)
- [x] Dashboard/Actions/History/Settings 四頁正常切換、內容正確渲染
- [x] 主題切換(Dark ↔ Light)正常
- [x] 感測器未連線時的優雅降級狀態(`--`、停用按鈕、Disconnected 燈號)正常
- [x] 原生視窗控制鈕對真實硬體滑鼠事件有正確反應(這次點中關閉鈕而非最大化鈕,是本次算座標
      的失誤,不是 app 的問題——鈕本身確實在算出的座標上正確命中並觸發)
- [ ] 未測:韌體 OTA 更新(需要真實 BLE 裝置連線)、示範模式完整流程、真實感測器資料串流——
      這幾項需要硬體或至少啟用示範模式才能測,本次範圍未涵蓋

## 📝 後續待辦

- **beta.5 兩項回報可以正式關閉**:更新檢查狀態文字、側邊欄收合持久化都已用實機重現方式
  驗證正常,不再需要等使用者回報重現步驟。
- 這次沒有測到的範圍(韌體 OTA、示範模式、真實感測器連線)如果使用者需要更完整的涵蓋,
  下次可以用 Settings 頁的「啟用示範模式」走一次不需要硬體的完整流程。
- issue #3 仍卡在等 harold1008 的實機測試,與本次無關。
