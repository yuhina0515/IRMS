---
tags: [coding-log, ui, gemini-handoff, tauri]
summary: 逐項核對前次整理出的 bug/待處理清單——側邊欄遮擋內容確認已於 09-12 修好(非仍待處理的已知限制)、TopHeader 點擊偏移套用 shadow:false 嘗試修正但無法自動化驗證、beta.5 回報的兩項程式碼複查無新發現(仍缺重現步驟)、issue #3 仍卡在 harold1008。另外備妥完整的 IRMS 專屬設計語言重新設計 brief 交給 Gemini,但 CLI 撞到 Gemini API 免費額度上限,尚未拿到設計回覆。
date: 2026-09-14
---

# 2026-09-14 變更日誌 — Bug 逐項排查 + Gemini 設計語言重新設計 brief

> **相關文件**:[[HOME|導覽首頁]] · [[PROJECT_STATUS|開發進度]] · [[OPTIMIZATION|優化待辦]] ·
> [[log_20260914_beta5_followup_reports_and_open_diagnostics|今天稍早的 beta.5 回報日誌]]

## 🎯 目的

使用者要求「逐步解決所有 bug」+「已知限制改用其他方案代替」+「用 Gemini 重新設計 IRMS 專屬的
設計語言並做出來」。本次針對前一輪整理出的 bug/待處理清單逐項處理。

## 🔧 變更內容

1. **側邊欄遮擋內容「已知限制」——實測後確認已修好,非仍待處理項**:用 `npm install --no-save
   playwright` 臨時裝、`page.addInitScript` mock `__TAURI_INTERNALS__`,對著 vite dev server
   量測 Dashboard/Actions/History/Settings 四頁在展開/收合兩種狀態下的真實 bounding box——
   `.sidebar` 右緣與 `.page-header`/`.main` 左緣穩定維持 12px 間距,四頁四種狀態下皆無重疊。
   09-12 的 `padding-left` 偏移修法確實生效,**不需要另外的替代方案**。用完卸載 playwright、
   刪除拋棄式腳本與截圖,不進版控(僅四張留用截圖搬進 `doc/gemini-handoff-20260914/` 供
   Gemini 參考)。
2. **TopHeader 視窗控制鈕點擊偏移——套用一個有根據但無法自行驗證的修正**:查證
   tauri-apps/tauri 上游 issue(#12285、#11345、#11788)確認 `decorations:false` +
   window shadow 同時啟用時,Windows 上會出現內部視窗尺寸/座標計算誤差,官方 issue #12285
   明確建議「先關掉 shadow 當暫時解法」。本專案自己的 `splash.rs` 早就對 splash 視窗設了
   `.shadow(false)`(當時是為了全螢幕透明疊層的視覺原因,非同一個 bug),但**主視窗
   `tauri.conf.json` 從未套用同一個設定**——補上 `"shadow": false`。`cargo check` 確認編譯
   通過。**這個修正無法自動驗證**:09-11 的既有記錄已經證實這類座標錯位連 UI Automation
   都測不出來(程式化呼叫看得到效果,只有真滑鼠點擊在同一座標點不到),Playwright/CDP
   的合成點擊很可能同樣測不出真正的 bug,所以沒有嘗試用它來「證明修好了」。需要使用者下次
   拿到真機或至少重新打包後,自己實際點一次最小化/最大化/關閉鈕確認。
3. **beta.5 回報(更新檢查、側邊欄收合持久化)——複查程式碼,未發現新缺陷**:`update.rs`
   已有 09-14 稍早補上的 30 秒逾時;`useStore.ts` 的 persist migration `version: 13` 與
   `sidebarCollapsed` 欄位補齊邏輯核對正確。**兩項回報目前仍缺確切重現步驟**(見稍早日誌),
   程式碼複查沒有找到新線索,需要使用者提供才能繼續。
4. **GitHub issue #3——查詢現況**:自 09-11 指派給 `harold1008` 後,issue 上沒有新留言,
   仍卡在需要隊友實機測試這個閘門上,無法從這裡推進。
5. **Gemini 設計語言重新設計 brief——已備妥並送出,但撞到 API 額度上限**:寫了
   `doc/gemini-handoff-20260914/01-design-language-redesign.md`,說明 IRMS 的真實情境
   (病患復健時穿戴著感測器邊看邊做動作、治療師事後回顧),點名現有「Data-Console」風格
   讀起來像通用 SaaS 儀表板而非為這個情境設計,並指向該讀的原始碼位置(`tailwind.css`、
   `DashboardView.tsx` 等)與六張新截圖(雙主題)。用 `gemini --skip-trust -p` 呼叫,
   Gemini 開始讀取 brief 與原始碼後,撞上 Gemini API **免費額度**(`gemini-3.5-flash`
   每日限 5–20 次請求)雙重觸發(`generate_content_free_tier_requests` 與
   `_input_token_count`),最終回傳 `TerminalQuotaError: You have exhausted your daily
   quota`,**沒有拿到任何設計回覆**。

## ✅ 驗證方式

- [x] 側邊欄重疊:Playwright 對 4 個視圖 × 2 種收合狀態量測真實 DOM bounding box,截圖佐證
      (`_tmp_shot_default*.png`,已刪除,非版控產物)
- [x] `cargo check`:`shadow:false` 設定後編譯通過(僅既有無關的 dead-code warning)
- [ ] TopHeader 點擊修正的實際效果——**未驗證,需使用者真機手動測試**(見上方說明,已知
      這類 bug 連 UI Automation 都測不出來,自動化驗證不可靠)
- [x] `update.rs`/`useStore.ts` 程式碼複查(讀碼確認邏輯正確,非執行測試)
- [ ] Gemini 設計回覆——**未取得**,撞到 API 額度上限

## 📝 後續待辦

- **TopHeader 點擊偏移**:等使用者下次測試 `shadow:false` 是否解決;若沒解決,需要考慮更大的
  替代方案(例如改回原生 decorations 但用 Windows 11 DWM caption 顏色 API 客製外觀),但那會
  推翻現有自訂標題列的設計方向,動工前須與使用者確認。
- **beta.5 兩項回報**:需要使用者提供確切重現步驟(是否已用 App 內建「檢查更新」按鈕測過
  beta.5、是否測過「收合→關閉→重開」完整循環)才能繼續診斷。
- **issue #3**:繼續等待 harold1008。
- **Gemini 設計語言 brief**:`doc/gemini-handoff-20260914/` 已備妥,等額度重置後重新呼叫
  `gemini --skip-trust -p`,或改用登入付費層級/其他模型,或退回人工貼網頁版的舊流程
  ——三個選項需要使用者決定要走哪一條。拿到回覆後才能進到「實作 Gemini 設計語言」這一步。
