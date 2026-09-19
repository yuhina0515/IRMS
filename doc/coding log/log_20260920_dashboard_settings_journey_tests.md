---
tags: [coding-log, testing, dashboard, settings, ota]
summary: Added DashboardView.test.tsx (12 tests) and SettingsView.test.tsx (8 tests) covering the connect→Session→ERR/disconnect→cleanup and OTA progress/failure journeys flagged as an open gap in OPTIMIZATION.md §三. Extended irmsApiStub.ts with the previously-unimplemented firmware/updates namespaces to make the OTA test possible. 337 frontend tests, full CI green.
date: 2026-09-20
---

# Dashboard/Settings 元件層旅程測試

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260919_baseline_commit_and_doc01_rewrite]] ·
> [OPTIMIZATION.md §三](../OPTIMIZATION.md)

## 🎯 目的

使用者裝置仍不在身邊,決定暫緩硬體相關任務,繼續離線可完成的工作。OPTIMIZATION.md §三
點名的技術債「補齊 Tauri 邊界與旅程測試」尚未動手——`sessionController.test.ts` 已經徹底
鎖住 CMD 指令的有序稽核,但那條測試完全繞過 React,從未驗證過畫面本身是否正確反映 store
狀態。這是目前唯一還開著、且完全不需要裝置就能推進的「應用場景」相關缺口,直接對應使用者
本次驗收「裝置與應用場景」的主題。

## 🔍 開工前調查

- `DashboardView.tsx` 預設設定下(`showTrendChart`/`show3D2DPose` 皆為 false)只渲染
  `DetailStatsGrid`,不會觸發 `LiveChart`(chart.js)/`Leg3D`(three.js)的 lazy import——
  確認可以不 mock 這兩個重量級函式庫就測試核心旅程。
- `sessionController`(經 `SessionControlPanel`)在模組載入時會建構 `bluetoothService`,
  其建構子呼叫 `@tauri-apps/api/event` 的 `listen()`——dom project 沒有真正的 Tauri
  runtime,不 mock 會炸在模組載入階段(同 `sessionController.test.ts` 既有的作法)。
- 稽核 `src/test/irmsApiStub.ts` 發現它明確記載「`firmware`/`updates` 命名空間目前沒有
  任何已搬遷的測試需要,真的用到時再補」——OTA 旅程測試正是這個「真的用到」的時刻。

## 🔧 執行內容

1. **`DashboardView.test.tsx`(12 tests)**:連線/選動作提示(未連線、已連線未選動作、
   協定不支援優先於前兩者)、硬體 ERR 時的提示文字與 `DetailStatsGrid` 全數標 `ERR`、
   校準警示 chip(顯示/點擊開啟精靈/已校準後不顯示)、超限警報橫幅(顯示條件、靜音按鈕
   呼叫 `sessionController.silenceAlarm`)、Start/End Session 按鈕(可用性條件、分別呼叫
   `sessionController.startSession`/`endSession`)。
2. **擴充 `irmsApiStub.ts`**:比照既有 `sessions`/`data`/`actions` 的 `wrap()` 模式,補上
   `firmware.pickBinary`(預設回傳 `null`,模擬使用者取消選檔)與 `updates` 五個方法的
   預設實作,`IrmsStub`/`IrmsStubOverrides`/`mockIrmsApiModule` 型別同步更新。`windowControls`
   仍未實作,維持檔頭原本的「真的用到再補」原則不擴大範圍。
3. **`SettingsView.test.tsx`(8 tests)**:只測 `FirmwareOtaPanel`(私有元件,經渲染整個
   `SettingsView` 間接測試),範圍刻意不含校準/一般設定/軟體更新/示範模式四個其他面板。
   連線態閘門(未連線/Session 進行中/正常可用三種停用原因)、選檔後顯示檔名/大小/MD5、
   開始更新前的 `requestConfirm` 關卡(取消則不呼叫 `performOtaUpdate`)、完整進度旅程
   (`starting`→`transferring`→`finalizing`→`done`,斷言進度條百分比與五種 phase 文字)、
   失敗旅程(`error` phase 顯示 ❌ 而非冒充成功)、中止流程(呼叫 `abortOtaUpdate`、中止鈕
   隨 `inFlight` 狀態出現/消失)。`requestConfirm`/`performOtaUpdate` 皆透過直接改寫
   store/spy 實例方法達成,不渲染真實 `ConfirmDialog`。
4. 修正兩處測試檔案內的 TS 型別問題:`let emit = null` 在非同步回呼裡賦值會被控制流分析
   窄化成 `never`(與 `bluetooth.ts` 的 `performOtaUpdate` 內部 `last` 變數同一個既有理由),
   改用可變物件包一層,同一個模式套用兩次。
5. 更新 `OPTIMIZATION.md` §三與 `PROJECT_STATUS.md` 對應的風險列/現況表,把這項從「未開始」
   改記為「已完成」,測試計數同步為 337(自 317 起)。

## ✅ 驗證方式

- [x] 新增測試檔案先以 `npx vitest run --project dom <file>` 個別跑過確認邏輯正確
  (12/12、8/8 全過)。
- [x] `npm run ci`(typecheck + 337 前端測試 + production build + rustfmt + 50 Rust 測試 +
  Clippy `-D warnings`)全綠——確認新增測試與 `irmsApiStub.ts` 的擴充沒有破壞既有 29 個
  測試檔案或型別系統。
- [ ] 真機驗證:不適用,純渲染層測試,不涉及硬體。

## 📝 後續待辦

- `Sidebar`/`TopHeader`/`ConfirmDialog`/`ToastHost` 等純 UI 殼層元件仍無測試,評估後判定
  互相耦合、拆分成本高於效益(見 OPTIMIZATION.md §三該行原有的既有結論),未列入本次範圍,
  之後有具體回歸需求再展開。
- 離線佇列下一項(依 09-17 排程剩餘項):低優先的 `packets.txt` 統計分析(66,927 筆既有
  trace,機率不高,排最後)。裝置相關任務(issue #3、Roll/Knee 真機驗收、OTA 硬體三步)
  依使用者指示暫時擱置。
