---
tags: [coding-log, release, tauri, beta, architecture, ci]
summary: "發布 v1.2.0-beta.6：交付架構修復、Tauri 韌體選檔安全邊界、CSP、零 npm audit 漏洞與前後端 CI，並更新 beta-latest。"
date: 2026-09-15
---

# 2026-09-15 變更日誌 — Tauri v1.2.0-beta.6 發布

> **前置工作**：[[log_20260915_architecture_repairs_phase1|架構修復 Phase 1]] ·
> [[log_20260915_architecture_technical_audit|架構與技術稽核]]

## 發布結果

- GitHub prerelease：<https://github.com/yuhina0515/IRMS/releases/tag/v1.2.0-beta.6>
- tag `v1.2.0-beta.6` 指向 `ef624b10286c51a4c856b761e63ce885d2125bd6`。
- 功能修復提交：`e8a824f3c350261d90f80095f931987619a02b41`。
- CI runner action 更新提交：`ef624b10286c51a4c856b761e63ce885d2125bd6`。
- 已覆寫固定 `beta-latest/latest.json`，現指向 beta6 安裝包與對應 updater signature。

## 發布資產

- `IRMS.Dashboard_1.2.0-beta.6_x64-setup.exe`（3,830,272 bytes）
- `IRMS.Dashboard_1.2.0-beta.6_x64-setup.exe.sig`
- `latest.json`
- 安裝包 SHA-256：`1de1004e2542e32a43f1a1eb99c04c2d6e63b8ba6f9b1df3b28cab51a59fef7d`

## 品質閘門

- 本機 `npm run ci`：27 個 Vitest files / **285 tests**、TypeScript typecheck、Vite build、
  Rustfmt、Clippy warnings-as-errors、**60 Rust tests** 全數通過。
- `npm audit`：0 vulnerabilities。
- signed `npm run tauri build`：NSIS installer 與 updater signature 產出成功。
- GitHub Actions run `34916079919`：Windows / Node 24 / stable Rust 全數通過。
- release tag、prerelease 狀態、三項資產、固定 beta manifest 與遠端 tag commit 均已核對。

## 本版重點

- 補齊 Tauri 原生 `.bin` 選檔、Rust 端路徑與檔案驗證、4 MB 上限、MD5 與 IPC 型別轉換。
- main window 僅授予 dialog open 權限；renderer 加入 production/dev 分流的最小 CSP。
- DB mutex poison 不再 panic，改由既有錯誤邊界回傳；新增回歸測試。
- 統一前端與 Rust CI，並升級 Vite/Vitest/React plugin 以清除已知 npm audit 漏洞。
- GitHub Actions 升級至 Node 24 runner 相容的 `checkout@v7` / `setup-node@v7`。

## 仍需實機驗證

- 原生 dialog 實際點選 `.bin` 的人工煙霧測試。
- OTA 真實 BLE 傳輸、更新後重連/GATT cache、途中斷電與斷連復原。
- GPIO、超限警報、斷線 session 收尾與 abandoned recovery 的硬體 E2E。
- `Leg3D` lazy chunk 約 548 kB 的既有 build warning 屬效能後續項，不阻斷本次 beta。
