---
tags: [coding-log, tauri, migration]
summary: Phase 2b 前端整包搬遷——React/Zustand/services 原封不動複製，新寫 Tauri 版 bluetooth.ts 與 platform/irmsApi.ts，打包後實機驗證 UI 真的會動
date: 2026-09-07
---

# 2026-09-07 變更日誌 — Tauri 遷移 Phase 2b(前端搬遷)

> **相關文件**:[[HOME|導覽首頁]] · [[TAURI_MIGRATION_PLAN|完整轉移計畫]] ·
> [[log_20260907_tauri_db_ipc_wiring|Phase 2b 起步(DB 層 IPC)]]

## 🎯 目的

Phase 2b 起步只接了 DB 層的 IPC(見上一篇日誌)。這篇做的是 Phase 2b 真正的大頭:
把 `IRMS_App`(Electron)的整個前端——React 元件、Zustand store、純邏輯
services、shared 型別——搬進 `IRMS_App_Tauri`,並把 Phase 2a 定出來的
`platform/irmsApi.ts` 介面在 Tauri 這側真正實作出來。

## 🔧 動作

- **機械式複製**(零邏輯變更):`grep -rlE "window\.irms|navigator\.bluetooth|electron|
  ipcRenderer"` confirm 只有 `platform/irmsApi.ts`、`services/bluetooth.ts`、
  `splash.ts`、測試基礎設施會碰 Electron 專屬 API。其餘全部——`components/*`、
  `hooks/*`、`views/*`、`store/*`、`services/*`(除 `bluetooth.ts`)、
  `shared/*`、`App.tsx`、`main.tsx`、靜態資產(logo/背景圖)、
  `tailwind.config.js`/`postcss.config.js`——原封不動複製過去。過程中補了兩個
  一開始漏掉的檔案:`services/sessionController.ts`(第一輪 grep 沒抓到,因為它
  只透過已重構好的 `irms`/`bluetoothService` 間接接觸,本身不含 Electron 關鍵字)
  與 `src/assets/*`(TopHeader 的 logo 圖片)。
- **`services/bluetooth.ts` 重寫**:Web Bluetooth 在 WebView2 不存在,真正的
  GATT 連線邏輯早在 Phase 0 就寫進了 `ble.rs`(btleplug)。這次把 JS 端改成
  `ble.rs` 的 IPC 客戶端——`invoke()` 送指令、`listen()` 收
  `ble:connection`/`ble:packet`/`ble:ota-progress` 事件。對外 class 介面
  (`connect`/`disconnect`/`send`/`beginSimulated`/`ingest`/…)刻意維持與
  Electron 版完全相同,`store/useStore.ts` 與 `sessionController.ts` 因此
  零修改。
- **`platform/irmsApi.ts` 重寫**:`sessions`/`data`/`actions` 是對
  Phase 1 `commands.rs` 的機械式 `invoke()` 包裝。`windowControls` 用
  `@tauri-apps/api/window` 的 `getCurrentWindow()` 做出真正可用的實作
  (`minimize`/`toggleMaximize`/`close`/`isMaximized`,`onMaximizedChange`
  用 `onResized` 事件重新查詢 `isMaximized()` 模擬)。`updates`/
  `firmware.pickBinary` 刻意留白(見下面「決策」)。
- **設定接線**:`vite.config.ts`/`tsconfig.json` 補 `@renderer`/`@shared`
  路徑別名;`postcss.config.js`/`tailwind.config.js` 因為專案是
  `"type": "module"` 必須改副檔名成 `.cjs` 才能用 `module.exports`;
  `package.json` 補齊 `zustand`/`chart.js`/`three`/`@fontsource-variable/*`/
  `tailwindcss`/`postcss`/`autoprefixer` 等前端依賴。

## 📐 決策

- **`updates` 全部留白(除 `getCurrentVersion`)**:對應 task #54(Phase 4
  自動更新),TAURI_MIGRATION_PLAN.md 早就把這列為獨立階段。用 no-op 而非
  拋例外——Settings 的「檢查更新」按鈕維持可點但無效果,UpdateBanner 訂閱
  不到事件就是永遠不顯示,不會讓畫面炸掉。
- **`firmware.pickBinary` 回傳 `null` + console.warn**:需要
  `tauri-plugin-dialog` + 讀檔 + MD5,這幾個套件的確切 v2 API 我沒有把握
  用猜的寫對(尤其是 blocking file dialog 在 async command 裡的慣用寫法),
  與其猜錯讓建置在事後才炸,不如先誠實留白、開一張獨立任務(#64)追蹤。
  SettingsView 呼叫端本來就把 `null` 當「使用者取消」處理,行為安全。
- **`ble:packet` 事件直接吃 Rust 已解析好的 `ParsedPacket`,不重新解析**:
  `protocol.rs` 的 `#[serde(tag = "kind", rename_all = "camelCase")]` 序列化
  後的形狀與 `shared/protocol.ts` 的 `ParsedPacket` type 完全一致(逐欄位
  對過),真實鏈路因此不必再呼叫一次 `parseAnglePacket`——只有模擬鏈路
  (`ingest(text)`,demo 模式專用)才會走 JS 端解析,兩者殊途同歸到同一個
  `dispatchParsed` 私有方法。
- **重連迴圈改成「重新呼叫 `ble_connect`」**:Web Bluetooth 版重連是重用
  同一個 `BluetoothDevice` 物件呼叫 `device.gatt.connect()`;`ble_connect`
  本身就包辦了 scan+connect+subscribe 全流程,語意對等的重連原語就是整個
  重新呼叫一次同一個 command。`ble.rs` 檔頭註解本來就明講這條重連路徑尚未
  對著真實硬體斷線情境驗證過,這裡的移植沒有讓那個既有的風險消失,只是
  把它從「完全沒有重連邏輯」補到「有邏輯但沒驗證過」。
- **`performOtaUpdate` 靠事件流的最後一個 phase 判定成敗,不是靠
  `invoke()` 有沒有丟例外**:`ble_perform_ota_update` 的 `Result<String,String>`
  只有 Rust 層級例外(寫入失敗等)才會走 `Err`;協定層級的失敗
  (`NO_SPACE` 等)一律是 `Ok(message)` + 一個 `phase:'error'` 事件。
  寫的時候踩到一個 TS 控制流分析的坑:用 `let lastPhase = 'starting'` 搭配
  非同步回呼裡的賦值,TS 看不到那條賦值路徑,把型別窄化死在初始值上,
  導致比較被判定恆假——改用可變物件 `{ phase: ... }` 存放解決(物件屬性
  存取不會被同樣方式窄化)。

## ✅ 驗證

- `npx tsc --noEmit`:第一輪只有一個型別窄化錯誤(見上面決策段),修完後
  **完全乾淨**。
- `npm run build`(tsc + vite build):**成功**。踩到兩個環境問題:
  `postcss.config.js`/`tailwind.config.js` 用 CJS 語法但專案是 ESM
  package(`"type": "module"`)導致 `module is not defined`——改副檔名成
  `.cjs` 解決;`TopHeader.tsx` 引用的 logo 資產沒複製過來導致 rollup 找不到
  檔案——補複製 `src/assets/*`。
- `npx tauri build --debug`:**成功**,產出 MSI + NSIS 兩種安裝檔。
- **實機啟動驗證,不只是編譯過**:打包出的 `irms_app_tauri.exe` 直接執行,
  process 3 秒後仍存活,視窗標題正確顯示「IRMS Dashboard」。用 Win32
  `PrintWindow` API(非 `CopyFromScreen`——後者在這台機器的目前 session 下
  回傳「控制代碼無效」,`PrintWindow` 對著視窗控制代碼直接畫則正常)截圖
  拍到**真正的 Dashboard 畫面**:側邊欄(Dashboard/Actions/History/
  Settings)、IRMS 品牌標識、「Disconnected」連線狀態、膝關節夾角量表——
  而且量表上的「目標 80–100°、回位 ≤30°、超限 135°」這幾個數字**只有在
  `main.tsx` 的 `bootstrap()` → `irms.actions.list()` → `actions_list`
  Rust command → SQLite → 回到 Zustand → React 渲染這整條鏈都真的接通時
  才會出現**——比單純「視窗開了、process 活著」更強的證據,證明 Phase 2b
  的核心資料流(不只是 UI 骨架)確實可動。截圖存於
  `doc/coding log/assets/tauri-smoke-dashboard.png`。
  另外確認 `%APPDATA%\com.irms.app.tauri\irms.sqlite` 真的被建立,驗證完
  後清除(process kill + 刪除 AppData 目錄),不留垃圾在使用者機器上。
- **沒做到的部分,誠實記錄**:嘗試用 Win32 滑鼠事件注入去點擊
  Actions/History/Settings 分頁,在這個環境下座標/焦點對不上,兩張截圖
  結果一樣(都停在 Dashboard)——不是應用本身的問題,是這次臨時湊的
  滑鼠自動化不可靠。也沒有連上 WebView2 的 CDP remote-debugging 去檢查
  console 有沒有錯誤(`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 環境變數在
  這次的 spawn 方式下沒有生效,連線逾時)。這兩項留到之後有更可靠的
  Tauri + Playwright 驅動方式(可能需要專案自己的 run skill)時再補,
  不假裝已經測過。測試套件(286 個)的移植也還沒開始,列在
  TAURI_MIGRATION_PLAN.md 的獨立待辦。

## Self-review

檢查情境:「`services/bluetooth.ts` 的 `dispatchParsed` 假設 Rust 端
`ble:packet` 事件送來的 `ParsedPacket` 序列化形狀與 TS 的
`shared/protocol.ts` 型別逐欄位一致(`kind`/`raw.{thigh,shin,thighRoll,
shinRoll}`/`hasRoll`/`truncated`),如果哪天韌體協定改版、`protocol.rs`
的欄位改了但沒同步改 TS 那邊(或反過來),會不會靜靜地把錯的欄位塞進
`applyCalibration`,產生一筆看起來正常但角度全錯的資料?」——直接讀了
`protocol.rs` 的 `#[serde(tag = "kind", rename_all = "camelCase")]` 與
`RawAngles` struct 定義,逐欄位比對過與 TS 版一致,目前**沒有分歧**;但
這個一致性目前純粹是「兩份手寫程式碼恰好同步」,沒有任何機制(型別產生器、
schema 驗證、跨語言測試)強制保證未來不會分歧——PASS(當下驗證通過,但
標記為結構性風險:如果之後要動 `parseAnglePacket`/`parse_angle_packet`
兩邊任一份,必須手動同步改另一份,且目前没有測試會在分歧時失敗,因為
Tauri 這側的協定測試(`protocol.rs` 的 18 個 Rust 測試)只驗證 Rust 內部
邏輯本身正確,不會驗證跟 TS 版「同一份協定的兩份實作結果一致」這件事)。
