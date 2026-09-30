---
tags: [coding-log, status]
date: 2026-08-01
summary: "專案現況全面解析(v1.0.1 後、最後一次提交 2026-07-17):程式碼規模盤點、8 個測試檔 74 tests 實測全綠、ROADMAP Phase 0–5 完成度對照、6 項結構性缺口(無 lint / 無 ErrorBoundary / 無 DB migration / 韌體未重燒 / 實機 E2E 未跑 / 文件速記過期)"
---

# 2026-08-01 專案現況解析 — IRMS

> **相關文件**:[[HOME|導覽首頁]] · [[ROADMAP|架構與代碼計畫]] · [[OPTIMIZATION|優化待辦]] ·
> [[log_20260801_meeting_app_review|後續:App 全面檢視會議]]

## 🎯 目的

自 2026-07-17 最後一次提交後,專案已靜置兩週。本文以**實測而非文件轉述**的方式盤點現況,
作為後續 App 全面檢視會議([[log_20260801_meeting_app_review]])的共同事實基礎。

---

## 1. Repo 組成

| 目錄 | 內容 | 規模 |
|---|---|---|
| `IRMS_App/` | Electron + Vite + React 18 + TS 5.6 + better-sqlite3 桌面端 | `src/` 6,333 行(含 CSS 1,070 行) |
| `IRMS_Sensor/` | ESP32 韌體 v3(模組化:`.ino` + `config.h` + `imu.h`) | 452 行 |
| `I2C_Scanner/` | 硬體除錯輔助工具 | — |
| `doc/` | Obsidian vault(HOME/ROADMAP/OPTIMIZATION/README/Canvas + 31 篇 coding log) | — |

- Git:`main` 分支,11 個提交,最後一次 `92f52e6`(2026-07-17)。
- 未追蹤檔案 1 個:`doc/coding log/log_20260716_meeting_discord_server_structure.md`(未 commit)。
- 已發布 **v1.0.1**(GitHub Release,附 Windows 安裝檔)。

### App 內部結構(依行數排序前段)

```
global.css              1070   ← 單檔 CSS,佔全 App 17%
store/useStore.ts        310   ← Zustand 單一狀態源(persist v3)
components/CalibrationWizard.tsx  277
services/sessionController.ts     272
components/LiquidKnob.tsx         240
views/ActionsView.tsx             198
main/db.ts                        194
services/bluetooth.ts             184
```

分層清楚:`main/`(DB + IPC + BLE 配對)/ `preload/`(contextBridge)/
`renderer/{components,views,services,store}` / `shared/`(型別 + 協定 + 預設值)。
判定邏輯全在 `services/` 純函式層,故可測試性良好。

---

## 2. 測試與建置(本次實測)

```
npm run test  →  Test Files 8 passed (8) · Tests 74 passed (74) · 415ms
```

測試檔涵蓋:`triggerEngine` / `calibration` / `movementMetric` / `guidance` /
`smoothing` / `uiThrottle` / `protocol` / `useStore`。

**覆蓋分布不均**:8 個測試檔全部集中在 `services/` 與 `store/` 的純邏輯層。
`main/db.ts`(194 行 SQL 存取)、`main/ipc.ts`、`preload/`、以及**全部 React 元件與 view
一律零測試**——沒有安裝 `@testing-library/react`,也沒有 jsdom 環境設定。

---

## 3. ROADMAP 完成度對照

| Phase | 狀態 | 說明 |
|---|---|---|
| **Phase 0** 驗證與安全收尾 | 🟡 2/3 | ERR 主動關回饋 ✅、斷線 Session 收尾 ✅、**📡 實機 E2E ❌ 未跑** |
| **Phase 1** 文件對齊 | ✅ 完成 | README 已改為 App-Driven 現況 |
| **Phase 2** 測試與品質基建 | 🟡 1/4 | Vitest ✅(74 tests);**ESLint/Prettier ❌**、**ErrorBoundary ❌**、**DB migration ❌** |
| **Phase 3** 效能 | 🟡 1/2 | UI 節流 ✅(80ms 尾緣,2026-07-11);**History 大 Session 分頁/抽樣 ❌** |
| **Phase 4** 功能補完 | 🔴 0/4 | Record Pose 回補、復健評分模型、Roll 曲線切換、i18n 全未動 |
| **Phase 5** 泛化與發布 | 🟡 1/3 | electron-builder 打包 + Release ✅;多關節泛化 ❌、韌體 Standalone ❌(選配) |

**已驗證的缺口(逐項 grep 確認,非推測):**

- `grep -rn "user_version" src/` → 0 命中。`db.ts` 仍是 `CREATE TABLE IF NOT EXISTS`,
  **schema 無法演進**;ROADMAP D4 決策已定但未實作,而 Phase 4 的 `qualityScore` 欄位
  正是它的第一個消費者 → 評分模型被這個缺口卡住。
- `grep -rn "ErrorBoundary" src/` → 0 命中。任一 view 拋錯 = 整個 App 白屏。
- `package.json` devDependencies 無 `eslint` / `prettier`;`npm run ci` = typecheck + test + build,
  無 lint 關卡。

---

## 4. 近期開發軌跡(最後 5 篇日誌)

| 日期 | 主題 | 性質 |
|---|---|---|
| 07-17 | 外展校正判斷邏輯改造(roll invert 逐軸解耦、stdDev 4°、verified 旗標 persist v3) | 演算法/可用性 |
| 07-17 | 外展校正多代理會議裁決 | 決策 |
| 07-16 | Discord 伺服器架構會議 | 非程式(未 commit) |
| 07-14 | v1.0.1 發布 / logo + 上下 bar 內縮 / 打包 exe + Release | 發布與外觀 |
| 07-14 | 發布前文件清理(雙軌工作紀錄整合) | 文件治理 |

**趨勢觀察**:07-12 至 07-14 共 6 篇日誌集中在視覺(Liquid Glass、桌布、logo、無邊框視窗、
導覽列改版),與同期 ROADMAP Phase 2/4 的功能與品質項零進展形成明顯對比。07-17 回到
演算法正確性,是健康的修正。

---

## 5. 現況風險清單

| # | 風險 | 嚴重度 | 根據 |
|---|---|---|---|
| R1 | **韌體 v3 從未燒錄**,App 端所有行為僅對「假設中的韌體」驗證過 | 🔴 高 | HOME.md 註記「未燒錄請先重燒」(trim + FILTER_ALPHA);ROADMAP Phase 0 📡 未打勾 |
| R2 | **實機 E2E 從未跑**(達標音/超限長鳴/ERR/斷線收尾/精靈 round-trip) | 🔴 高 | Phase 0 唯一未完成項,且是後續所有行為變更的信心基礎 |
| R3 | 外展校正放寬(3°→4°、逐軸解耦)僅有單元測試,**未經真人驗證** | 🟡 中 | log_20260717 驗證段最後一項未勾 |
| R4 | 無 DB migration → 任何新欄位都得砍檔重建,已發布 v1.0.1 使用者資料會有風險 | 🟡 中 | 本次 grep 實測 |
| R5 | 無 ErrorBoundary → 單一 view 例外造成整個 App 白屏,已在使用者手上 | 🟡 中 | 本次 grep 實測 |
| R6 | UI/元件層零測試,而近期最大改動量正是 UI | 🟡 中 | 測試檔清單 |
| R7 | 文件速記過期:HOME.md「目前狀態速記」停在 v1.0.1,未含 07-16/07-17 兩篇 | 🟢 低 | 本次比對 |

---

## 6. 一句話總結

**IRMS 是一個工程結構健康、測試層次清楚、已能打包發布的專案,但它的最大問題不在程式碼:
整條硬體迴路(韌體 v3 + 實機 E2E)從未在真實裝置上驗證過,而過去一個月的開發重心
明顯偏向視覺打磨。** 目前的 74 tests 全綠所給的信心,只覆蓋到 BLE 封包進入 App 之後的路徑。

---

## ✅ 驗證

- [x] `npm run test` 實跑:8 files / 74 tests 全綠(415ms)
- [x] `grep -rn "user_version\|ErrorBoundary" src/` → 0 命中,確認兩項缺口為事實而非推測
- [x] `package.json` 逐行確認無 eslint/prettier
- [x] `git log --oneline | wc -l` = 11、`git status` 確認 1 個未追蹤檔案
- [ ] 未驗證:本文未實跑 `npm run build` 與 `electron-vite dev`(僅引用 07-17 日誌的
      `npm run ci` 全綠紀錄);未接實機。
