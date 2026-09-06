---
tags: [coding-log, release]
summary: 發布 1.1.0-beta.2,累積 09-05/09-06 全部 UI 工作;OTA 硬體驗證仍待 Harold
date: 2026-09-06
---

# 2026-09-06 變更日誌 — 發布 1.1.0-beta.2

> **相關文件**:[[HOME|導覽首頁]] · [[irms-project-conventions|beta 發版慣例]]

## 🎯 目的

使用者要求檢查目前進度,若無問題就發下一個 beta。`1.1.0-beta.1`(09-04 發布)
完全不含 09-05/09-06 這兩天做的所有 UI 工作,累積夠多、且 `npm run ci` 全綠、
working tree 乾淨,判斷符合發版條件。

## 🔧 動作

- 確認 working tree 乾淨、`npm run ci`(typecheck + 285 tests + build)全綠。
- `package.json` 版本 `1.1.0-beta.1` → `1.1.0-beta.2`,commit。
- 依 [[irms-project-conventions]] 的正確發版指令:
  `GH_TOKEN=$(gh auth token) npx electron-builder --publish always -c.publish.releaseType=prerelease`
  ——一次產生檔名一致的 `.exe`/`.exe.blockmap`/`latest.yml` 並發布到 GitHub Release,
  確認 `gh release view v1.1.0-beta.2` 三個 asset 都在。
- 補上 release notes(功能清單 + OTA 尚未實機驗證的免責聲明)。
- 用 `--user-data-dir` 指向隔離的暫存資料夾,直接執行
  `release/win-unpacked/IRMS Dashboard.exe` 做快速煙霧測試(非完整 6 輪壓力測試,
  beta 版按慣例只需要這一步):DB migration 全部乾淨套用、`Checking for update` →
  `Update for version 1.1.0-beta.2 is not available (latest version: 1.1.0-beta.2,
  downgrade is disallowed)`——確認打包後的 App 真的能看到自己剛發布的 release
  並正確判斷「已是最新版」。

## 📐 決策

- 這次累積的變更全是 UI/UX(標題列、動畫、自適應版面、側邊欄),**不含**任何 OTA
  韌體相關的程式碼變動——release notes 裡的「尚未完成實機驗證」免責聲明沿用
  beta.1 的既有措辭,原封不動,不是新增的疑慮,只是提醒讀者這個缺口還在。

## ✅ 驗證

- `npm run ci` 全綠(285 tests)。
- `gh release view v1.1.0-beta.2`:三個 asset(`.exe`/`.exe.blockmap`/`latest.yml`)
  齊全,檔名一致。
- 隔離 `--user-data-dir` 啟動打包後的 exe,確認無崩潰、DB migration 正常、
  auto-update 檢查邏輯正確判定「已是最新版」。

## Self-review

檢查情境:「這次發版沒有重新驗證 OTA 相關功能(B4/D1/D2 硬體步驟),是否有可能
不小心把一個半成品的 OTA 狀態發布出去,誤導使用者以為 OTA 已可用?」——確認
`doc/OPTIMIZATION.md`/`doc/HOME.md` 現有文件與這次 release notes 都明確標注
OTA 尚未實機驗證,且本次累積的 commit 範圍(`ab8b3df..HEAD`)沒有任何一筆碰到
`IRMS_Sensor`(韌體端)或 OTA 相關的 App 程式碼——PASS,純 UI 變更,OTA 功能狀態
與 beta.1 相比沒有任何退化或誤導性的改變。
