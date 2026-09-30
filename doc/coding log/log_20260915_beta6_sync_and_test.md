---
tags: [coding-log, testing, tauri, beta]
summary: "同步 Codex CLI(§1.2 多代理協作)在本機留下的 v1.2.0-beta.6(架構稽核 + 韌體選檔 + CSP + CI + 工具鏈升級)、實機重新驗證。npm/cargo 兩邊自動化結果與其 release 日誌數字完全一致;dev 與正式 release exe 雙路徑實機啟動都正常,CSP 未擋到字型/圖片/圖示;韌體選檔三顆按鈕在未連線時正確停用(需要真實 BLE 裝置才能測完整 dialog 流程,與其日誌自陳的缺口一致)。"
date: 2026-09-15
---

# 2026-09-15 變更日誌 — 同步並測試 beta.6

> **相關文件**:[[HOME|導覽首頁]] ·
> [[log_20260915_full_app_test_pass|今天稍早的完整 App 測試]] ·
> [[log_20260915_architecture_technical_audit|架構與技術稽核]] ·
> [[log_20260915_architecture_repairs_phase1|架構修復 Phase 1]] ·
> [[log_20260915_tauri_beta6_architecture_repairs_release|beta.6 發布日誌]]

## 🎯 目的

使用者告知「剛剛 GPT 進行了一些任務」,要求同步並測試新版本 app。`git log` 確認本機已有
Codex CLI(依 §1.2 慣例留下的三個新 commit:架構稽核修復、CI runner 升級、beta.6 發布,
working tree 乾淨、不需要額外 pull)。這三篇日誌宣稱的品質閘門數字(283→285 條前端測試、
新增 57→60 條 Rust 測試、0 npm audit 漏洞、韌體選檔鏈補齊)只是文件自陳,實機重新跑一次
確認數字是真的、app 沒有因為這輪改動(CSP、依賴升級、firmware.rs 新模組)壞掉。

## 🔧 變更內容

沒有程式碼變更,純同步 + 測試:

1. **依賴同步**:`npm install`——已經是最新(`package-lock.json` 對應的 node_modules 早就
   同步好),0 vulnerabilities。
2. **自動化檢查**(`ci:frontend` + `ci:rust`,這兩個 script 是這輪新增的):
   - 前端:27 個測試檔 / **285 條測試**全過、typecheck 過、`vite build` 過(Vite 8.3,
     只有既有的 Leg3D ~548 kB chunk 警告,非本次範圍)。
   - Rust:`cargo fmt --check` 過、**60 條測試**全過(含新增的 `firmware::tests::*` 三條:
     副檔名/空檔拒絕、超過 4 MB 拒絕、正常讀檔+MD5)、`cargo clippy -- -D warnings` 過。
   - 兩邊數字都跟 beta.6 發布日誌宣稱的完全一致。
3. **實機啟動兩條路徑**:
   - `npm run tauri dev`——重新編譯(Cargo.lock 有異動),`dpi_guard` 回報 drift=0px,
     `PrintWindow` 截圖確認畫面正常(沿用 dev profile 舊 WebView2 使用者資料夾,主題/側邊欄
     收合狀態是先前殘留的持久化值,非本次改動的行為)。
   - **正式 release exe**(`src-tauri/target/release/irms_app_tauri.exe`,即 beta.6 發布日誌
     裡簽章打包的那顆):獨立 profile 啟動、乾淨預設狀態、截圖確認畫面正常——這是新加的
     production CSP 真正生效的路徑(dev 模式的 CSP 較寬鬆,只多開 HMR websocket),字型
     (Inter/JetBrains Mono)、logo 圖片、圖表 SVG 線條全部正常渲染,**CSP 沒有擋到任何既有
     資源**。Settings 頁確認版本號正確顯示 `1.2.0-beta.6`。
4. **韌體選檔按鈕(本輪新功能)**:切到 Settings,用 UI Automation 找「查詢裝置目前版本」/
   「選擇韌體檔案 (.bin)」/「開始更新」三顆按鈕——**三顆的 `IsEnabled` 都是 `false`**,對
   「選擇韌體檔案」硬點 `InvokePattern.Invoke()` 直接丟出 COM 例外(預期行為,無障礙 API
   本來就不該對停用元件生效)。畫面文字「需要先於頂部連線真實裝置」確認這是刻意的閘門,不是
   bug——整個韌體更新區塊在沒有真實 BLE 裝置連線時完全鎖住,跟 09-14/09-15 稽核日誌記錄的
   設計一致。**真正的 dialog 開啟/選檔/MD5 顯示這條 UI 路徑,沒有真實裝置無法測**,與
   beta.6 發布日誌自己列出的「仍需實機驗證」項目一致,不是本次遺漏。

## ✅ 驗證方式

- [x] `npm install`:0 vulnerabilities
- [x] `npm run ci:frontend`:27 files / 285 tests、typecheck、build 全過
- [x] `npm run ci:rust`:fmt、60 tests(含 3 條新 firmware 邊界測試)、clippy 全過
- [x] `tauri dev` 實機啟動:`dpi_guard` drift=0px,畫面截圖正常
- [x] **正式 release exe** 實機啟動:CSP 生效路徑下字型/圖片/圖表正常渲染,版本號正確
- [x] 韌體選檔三顆按鈕在未連線狀態正確停用(UI 閘門邏輯正常)
- [ ] 未測(需要真實 BLE 裝置,與 beta.6 日誌自陳缺口一致):原生 dialog 選檔完整流程、
      OTA 真實傳輸、更新後重連/GATT cache、途中斷電斷連復原、達標 GPIO、超限警報、斷線
      session 收尾

## 📝 後續待辦

- 目前為止 beta.6 沒有發現任何回歸或新增缺陷,可視為驗證通過。
- 韌體 OTA 的硬體 E2E(dialog 選檔 → 傳輸 → 斷連復原)仍是唯一沒有裝置就補不齊的缺口,
  下次有硬體時段一併處理,跟 issue #3 一樣是 release gate 的必要項而非本次任務範圍。
