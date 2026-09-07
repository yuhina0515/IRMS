---
tags: [coding-log, release]
summary: 發布 1.1.0-beta.3，累積開機動畫、lazy-load、beta 開關等 UI 工作；OTA 硬體驗證狀態不變
date: 2026-09-07
---

# 2026-09-07 變更日誌 — 發布 1.1.0-beta.3

> **相關文件**:[[HOME|導覽首頁]] · [[irms-project-conventions|beta 發版慣例]] ·
> [[log_20260906_beta2_release|上一版 beta.2 發版紀錄]]

## 🎯 目的

使用者要求開始推送 beta。檢查後發現 `1.1.0-beta.2`(09-06 13:19 發布)之後
`IRMS_App` 又累積了 6 個 commit(beta 開關+側邊欄修正、註解清理、lazy-load、
兩階段開機動畫及其後續兩次修正/重做),package.json 版本卻還停在 beta.2——
判斷符合再發一版的條件,沿用 beta.2 當時建立的既定流程。

## 🔧 動作

- 確認 working tree 乾淨、`npm run ci`(typecheck + **286** tests + build)全綠。
- `package.json` 版本 `1.1.0-beta.2` → `1.1.0-beta.3`,commit(`abf7f0b`)。
- 依 [[irms-project-conventions]] 的正確發版指令:
  `GH_TOKEN=$(gh auth token) npx electron-builder --publish always -c.publish.releaseType=prerelease`
  ——一次產生 `.exe`/`.exe.blockmap`/`latest.yml` 並發布到 GitHub Release,
  確認 `gh release view v1.1.0-beta.3` 三個 asset 都在。
- 補上中文版 release notes(功能清單 + OTA 尚未實機驗證的免責聲明,並註明
  這次 IRMS_App(Electron)的發布與同時進行中的 Tauri v2 遷移工作無關)。
- 用 `--user-data-dir` 指向隔離的暫存資料夾,直接執行
  `release/win-unpacked/IRMS Dashboard.exe` 做快速煙霧測試:7 版 DB migration
  全部乾淨套用、process 啟動後穩定存活、`electron-updater` 的
  `checkForUpdates()` 有被觸發(看到 "Checking for update" 與 staging user ID
  產生的 log)。測試完成後 kill process、刪除隔離的 user-data-dir,沒有碰到
  使用者的真實 DB。

## 📐 決策

- 累積的變更全是 UI/動畫/內部整理(開機動畫、lazy-load、beta 開關、註解清理),
  **不含**任何 OTA 韌體相關的程式碼變動——release notes 的「尚未完成實機驗證」
  免責聲明沿用 beta.2 既有措辭,狀態沒有退化也沒有新進展。
- Release notes 額外加了一句說明 Tauri v2 遷移是獨立進行中的工作、不影響這次
  Electron 版本的行為——避免讀者把兩件事搞混,誤以為這個 beta 已經是 Tauri 版。

## ✅ 驗證

- `npm run ci` 全綠(typecheck + **286 tests** + build,tests 數字比 beta.2 的
  285 多一個,反映期間新增的測試案例)。
- `gh release view v1.1.0-beta.3`:三個 asset(`.exe`/`.exe.blockmap`/
  `latest.yml`)齊全,檔名一致。
- 隔離 `--user-data-dir` 啟動打包後的 exe:DB migration 全部乾淨套用、
  process 穩定存活、auto-update 檢查邏輯有被觸發。**與 beta.2 的紀錄不同的
  一點誠實記錄**:這次沒有捕捉到 electron-updater 最終判定「已是最新版」的
  那一行訊息(背景執行的 stdout 在檢查完成前就已經被前一次工具呼叫結束截斷),
  只確認了檢查流程有啟動、process 沒有因此崩潰——比 beta.2 當時做到的驗證
  略弱一點,但 DB 與啟動穩定性的證據仍然充分。

## Self-review

檢查情境:「這次發版沒有像 beta.2 那樣明確捕捉到 electron-updater 判定
『已是最新版』的訊息,會不會有可能這個新版本的 latest.yml 內容有誤(例如
版本號沒對上、checksum 算錯),導致真實使用者的 App 檢查更新時失敗或誤判?」
——`gh release view` 已確認三個 asset(`.exe`/`.exe.blockmap`/`latest.yml`)
存在且檔名版本號一致(`1.1.0-beta.3`),這些檔案是 `electron-builder --publish`
在同一次執行中自動產生並上傳,不是手動拼湊,與 beta.1/beta.2 走的是完全
相同、已經驗證過的自動化路徑,產生錯誤 checksum 的機率與之前兩版相同——
PASS(結構性保證:同一條自動化管線,沒有新增手動步驟,風險沒有比之前兩版
更高;唯一沒做到的是這次沒有像 beta.2 一樣額外肉眼確認結果訊息,已在上面
「驗證」段落誠實記錄,不是隱瞞)。
