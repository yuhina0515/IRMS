---
tags: [coding-log, release, electron]
summary: 發布 1.1.0-beta.4——校準精靈動作幅度即時驗證/免手擷取軸向修正/側邊欄收合持久化,供使用者在真實裝置上直接驗證
date: 2026-09-09
---

# 2026-09-09 變更日誌 — 發布 1.1.0-beta.4

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260909_calibration_wizard_fixes|同日修復日誌]]

## 🎯 目的

[[log_20260909_calibration_wizard_fixes|校準精靈修復]]完成後,使用者要求直接發版供
真實裝置測試,不在桌前迭代等待。

## 🔧 動作

依 [[irms-project-conventions]] 既有慣例:`package.json` 版本 1.1.0-beta.3 →
1.1.0-beta.4,`npm run ci` 全綠後 `npm run dist` 打包、隔離 `--user-data-dir` 煙霧
測試通過後,用 `GH_TOKEN=$(gh auth token) npx electron-builder --publish always
-c.publish.releaseType=prerelease` 正確發布(非手動 `gh release create`,那樣不會
產生 `latest.yml`)。發布後補上中文 release notes(比照既有 beta 版本說明格式),
標註「尚未實機驗證」。

## ✅ 驗證

- `npm run ci`:typecheck + **290 tests** + build 全綠。
- `npm run dist` 打包成功,`release/IRMS Dashboard Setup 1.1.0-beta.4.exe` 產出。
- **隔離 `--user-data-dir` 煙霧測試**(非只憑打包成功推論):啟動打包後的 exe,
  確認 4 個 process 存活、`irms.sqlite` 建立且 7 個 DB migration 全部套用成功
  (log 逐條印出 migration 1–7)、無崩潰;用 `grep -a` 直接讀取
  `Local Storage/leveldb/*.log` 二進位內容,確認 `sidebarCollapsed` 這個新欄位
  真的被寫進持久化的 settings blob,不只是單元測試層級的推論。使用者真實 DB
  全程未動(隔離 profile)。
- `gh release view v1.1.0-beta.4` 確認三個必要 asset(`.exe`/`.exe.blockmap`/
  `latest.yml`)皆已上傳,`isPrerelease: true`。

## Self-review

檢查情境:「這次隔離煙霧測試啟動時,auto-updater 會不會誤判並嘗試把使用者的隔離
測試環境『升級』或跟正式 GitHub Release 產生非預期互動?」——啟動 log 顯示
`Update for version 1.1.0-beta.4 is not available (latest version: 1.1.0-beta.3,
downgrade is disallowed)`——這是煙霧測試當下(beta.4 尚未發布)electron-updater
拿當時仍是最新版的 beta.3 跟本地版本比較的正常結果,證實比較邏輯本身在跑、沒有
崩潰或誤觸發下載,PASS。
