---
tags: [coding-log, tauri, migration, refactor]
summary: Phase 2a 完成——IRMS_App 收斂出單一 platform-adapter 模組，過程中揪出一個測試隔離的潛在 bug
date: 2026-09-07
---

# 2026-09-07 變更日誌 — Tauri 遷移 Phase 2a(platform-adapter 重構）

> **相關文件**:[[HOME|導覽首頁]] · [[TAURI_MIGRATION_PLAN|完整轉移計畫]]

## 🎯 目的

使用者裁示「P2重構後再搬移」——這篇記錄 Phase 2a:在 `IRMS_App`(仍是 Electron,
完全沒碰 Tauri)裡把所有直接呼叫 `window.irms.*` 的地方收斂到單一模組,讓之後
Phase 2b 真正搬到 Tauri 時只需要換一個檔案的實作,不是散在各處逐一修改。

## 🔧 動作

- **盤點**:`grep -rn "window.irms" IRMS_App/src/renderer/src` 找出 8 個檔案、
  26 個呼叫點(`main.tsx`、`App.tsx`、`TopHeader.tsx`、`UpdateBanner.tsx`、
  `SettingsView.tsx`、`HistoryView.tsx`、`ActionsView.tsx`、`sessionController.ts`)。
  `test/irmsStub.ts`/`test/setup.ts` 也命中,但那是**寫入** `window.irms` 的測試
  基礎設施,不是要遷移的呼叫點。
- **新增 `src/renderer/src/platform/irmsApi.ts`**——過程中發現直接
  `export const irms = window.irms` 會踩到一個真實的測試隔離 bug(見下方決策),
  改用六個 getter(對應 `IrmsApi` 的六個命名空間)取代單純的值重新匯出。
- **遷移全部 26 個呼叫點**到 `import { irms } from '.../platform/irmsApi'`。
- **驗證**:`npm run typecheck` 乾淨、`npm run test` **286/286 全過**、
  `npm run build` 乾淨,產物 chunk 大小完全不變(純重構,沒動任何邏輯)。

## 📐 決策

- **用 getter 而非 `export const irms = window.irms`**:動手前盤點測試基礎設施時,
  發現 `test/irmsStub.ts` 的 `installIrmsStub(overrides)` 會在某些測試中途被
  **再呼叫一次**,把 `window.irms` 整個換成一個新的 stub 物件(用來覆寫單一方法
  在該測試裡的回傳值)。如果 adapter 是「模組第一次載入時把 `window.irms` 的值
  存下來」,那個存下來的參照會是第一個 stub,後續測試中途換掉全域變數這件事
  adapter 完全看不到——所有透過 adapter 呼叫的地方會靜靜地繼續打舊的 stub,
  覆寫值形同失效,而且不會有任何錯誤訊息,只會讓某些測試斷言到不符預期的資料。
  改成 getter(每次存取都重新讀取當下的 `window.irms`)徹底避開這個問題,而且
  已經被 286 個測試(含會中途覆寫的那幾個)實測驗證過確實正常。
- **命名 `platform/`,不是 `adapter/` 或 `bridge/`**:跟 `TAURI_MIGRATION_PLAN.md`
  裡「the platform-adapter approach」的既有措辭一致,之後 Phase 2b 要在
  `IRMS_App_Tauri` 裡放一份對應的 Tauri 版實作時,資料夾名稱不需要重新決定。

## ✅ 驗證

- `npm run typecheck`:乾淨。
- `npm run test`:26 個測試檔、**286 個測試全過**,含會中途呼叫
  `installIrmsStub(overrides)` 換掉全域 stub 的測試案例——這些正是「如果用了
  naive 的重新匯出寫法,理論上會壞但可能悄悄壞掉沒被抓到」的案例,實測結果是
  用 getter 寫法之後這些測試維持全綠,間接證實了設計選擇是對的,不是紙上談兵。
- `npm run build`:乾淨,產物 chunk 大小與重構前完全一致。

## Self-review

檢查情境:「除了 `test/irmsStub.ts` 明確會重新指派 `window.irms` 之外,還有沒有
其他地方也會在執行期改變 `window.irms` 這個全域變數,而這次的 getter 設計沒有
考慮到?」——`grep` 整個 renderer 原始碼確認除了 `irmsStub.ts` 本身(測試專用)
之外,只有 `preload/index.ts` 透過 `contextBridge.exposeInMainWorld('irms', api)`
在應用程式啟動時寫入一次,之後不會再被任何正式程式碼改變——PASS,getter 設計
涵蓋了唯一一個真實會動態改變 `window.irms` 的情境(測試替身),生產環境路徑下
getter 每次都讀到同一個值,效果等同直接參照,沒有額外開銷疑慮。
