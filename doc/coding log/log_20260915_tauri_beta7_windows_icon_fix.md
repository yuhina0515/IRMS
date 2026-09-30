---
tags: [coding-log, release, tauri, windows, icon, beta]
summary: "修正 Tauri Windows 版仍使用預設圖示，重新生成完整 IRMS 品牌資產並發布 v1.2.0-beta.7；同時統一 beta Release 顯示名稱。"
date: 2026-09-15
---

# 2026-09-15 變更日誌 — Tauri beta7 Windows 圖示修正

> **前一版**：[[log_20260915_tauri_beta6_architecture_repairs_release|v1.2.0-beta.6 發布]]

## 問題

使用者回報已安裝的 Tauri `1.2.0-beta.1` 在 Windows 工作列與 App 清單沒有顯示 IRMS
圖示。追查 `src-tauri/icons` 後確認，`tauri.conf.json` 的 icon 路徑本身正確，但該目錄
內容仍是 Tauri 預設黃／藍圖示，因此 EXE 與 NSIS 捷徑都忠實打包了錯誤資產。

## 修正

- 使用舊 Electron 專案已驗證過的透明 IRMS 純圖標 `IRMS_App/build/icon.png` 作為來源，
  透過 Tauri CLI 重新生成 PNG、ICO、ICNS 與 Windows Appx 尺寸資產。
- `icon.ico` 包含 16、24、32、48、64、256px 六種 32-bit 圖示，涵蓋檔案總管、工作列、
  開始功能表與高 DPI 顯示需求。
- App、Cargo 與 Tauri bundle 版本同步升至 `1.2.0-beta.7`，避免覆寫 beta6 已發布資產。
- 將 beta6 GitHub Release 顯示名稱由 `v1.2.0-beta.6` 改為 `1.2.0-beta.6`；tag 仍維持
  專案一貫的 `v1.2.0-beta.6`。beta7 同樣使用「tag 帶 `v`、顯示名稱不帶 `v`」。

## 驗證

- 本機 `npm run ci`：27 個 Vitest files / **285 tests**、TypeScript、Vite build、Rustfmt、
  Clippy warnings-as-errors、**60 Rust tests** 全數通過。
- signed `npm run tauri build` 成功產出 NSIS installer 與 updater signature。
- 從 release EXE 提取 40×40 associated icon；像素統計為 IRMS 藍／青色，黃色像素為 0，
  確認不是舊 Tauri 預設圖示。
- GitHub Actions run `34929383890` 全數通過。
- prerelease、tag commit、三項資產與 `beta-latest/latest.json` 均已核對。

## 發布

- Release：<https://github.com/yuhina0515/IRMS/releases/tag/v1.2.0-beta.7>
- tag `v1.2.0-beta.7` 指向 `593e4ba8e9cd318f00c5958c10070443c719f31e`。
- 安裝包：`IRMS.Dashboard_1.2.0-beta.7_x64-setup.exe`（3,837,864 bytes）。
- SHA-256：`b0c27813bbcded85651072fc61d8df5557f8442b2e08048e2c8741249043566b`。
- 固定 `beta-latest/latest.json` 已更新至 beta7，且 signature 與產物一致。

## 安裝後注意

Windows 可能沿用舊版已釘選捷徑的 icon cache。若安裝 beta7 後工作列仍暫時顯示舊圖，
先取消釘選舊項目，再從開始功能表的 `IRMS Dashboard` 重新釘選；這是 Windows 捷徑快取，
不代表 beta7 EXE 仍含錯誤圖示。

硬體 OTA、GPIO 與斷線復原 E2E 的既有實機缺口不因本次純打包資產修正而改變。
