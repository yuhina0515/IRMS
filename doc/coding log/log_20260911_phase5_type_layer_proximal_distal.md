---
tags: [coding-log, phase5, multi-joint]
date: 2026-09-11
summary: "Phase 5 (multi-joint generalization) step 1 per ROADMAP D3: renamed the shared TS type vocabulary from thigh/shin to proximal/distal (CalibrationSnapshot, SensorReading/StoredReading, Settings' calibration fields), added matching serde wire-format renames on the Rust side (internal field names and SQL columns stay thigh/shin, only the JSON wire key changed), and bumped the Zustand persist version to v11 with a proper old-key-to-new-key migration so existing users' calibration data survives the rename. DB schema, UI display text/CSS tokens, and judgment-logic axis mapping are deliberately untouched — those are D3's later steps."
---

# 2026-09-11 變更日誌 — Phase 5 型別層:thigh/shin → proximal/distal

> **相關文件**:[[HOME|導覽首頁]] · [[ROADMAP]] · [[OPTIMIZATION]]

## 🎯 目的

三方裁決會議選定的三個可執行方向之一(見
[[log_20260911_meeting_dynamic_module_system]] 同日另一場會議的背景)——開始推進 Phase 5
多關節泛化,依 [ROADMAP](../ROADMAP.md) 決策 D3 規定的順序「先改共享型別 proximal/distal →
DB migration → UI 標籤 → 判定邏輯」,今天只做第一步:型別層。

## 🔧 變更內容

- **`shared/types.ts`**:`CalibrationSnapshot`(thighAxisSwap/shinAxisSwap/thighInvert/
  thighZeroRaw/shinInvert/shinZeroRaw/thighRollInvert/thighRollZeroRaw/shinRollInvert/
  shinRollZeroRaw/thighRollVerified/shinRollVerified)與 `SensorReading`/`StoredReading`
  (thighAngle/shinAngle/thighRoll/shinRoll)全數改名為 proximal/distal 對應版本。
- **`store/useStore.ts`**:`Settings` 介面裡對應的校準欄位、`DEFAULT_SETTINGS`、
  `CALIBRATION_TRANSFORM_KEYS`/`CALIBRATION_KEYS`、`applyCalibration` 函式本體同步改名。
  **`applyCalibration` 的輸入(`RawAngles`)與輸出(`LiveAngles`)型別維持原樣不動**——
  這兩個型別屬於 `shared/protocol.ts`(封包解析/即時訊號層),不在今天的範圍內,是下一輪
  型別層工作的候選(文件開頭的 `angles.thigh` 註解實際指的是這一層,不是今天改的這幾個)。
- **`services/calibration.ts`**:`AxisMapping` 介面與 `effectiveRaw`/`buildCalibrationPatch`/
  `buildQuickZeroPatch` 內對應的區域變數同步改名。`raw.thigh`/`raw.shin`/`raw.thighRoll`/
  `raw.shinRoll`(RawAngles 讀值)全數維持原樣。
- **`services/sessionController.ts`** / **`views/HistoryView.tsx`**:`SensorReading`/
  `StoredReading` 建構與讀取處同步改名;HistoryView 的 CSV 匯出欄位標頭文字
  (`thighAngle,shinAngle,...`)刻意保留原樣——那是對外資料格式,屬於 D3 的「UI 標籤」步驟,
  不是型別層改名的範圍。
- **`views/SettingsView.tsx`**:進階手動校準面板的 `settings.thighZeroRaw` 等屬性存取改名;
  畫面上顯示的文字(`"Thigh Zero (raw °)"`、`"大腿"`、`"小腿"`)刻意完全不動——同樣屬於
  UI 步驟,且本專案 UI/文案決策全權交給 Gemini(見 [[feedback_irms_ui_design_delegated_to_gemini]]
  的專案慣例),不該由這次改名順手夾帶。
- **`src-tauri/src/types.rs`**(Rust 端):`SensorReading`/`StoredReading` 的
  `thigh_angle`/`shin_angle`/`thigh_roll`/`shin_roll` **Rust 內部欄位名稱與 SQL 欄位名稱都
  沒有改**(SQL 仍是 `thighAngle`/`shinAngle` 等,`db.rs` 完全沒有異動),只在這四個欄位上
  加 `#[serde(rename = "proximalAngle")]` 等 wire-level 覆寫,讓 IPC 的 JSON key 對上 TS 端
  新名稱。新增兩個 regression test 釘住這個 wire 格式,因為欄位名稱不對這件事編譯器抓不到
  ——序列化後只是預設值或執行期失敗,不會是編譯錯誤。
- **localStorage persist 遷移(v10→v11)**:新增 `LegacyThighShinFields` 介面 +
  `migrateSettings` 的改名邏輯——讀到舊 persisted 資料裡的 `thighAxisSwap` 等舊 key 時,
  原值原封不動搬到新 key,純改名不換算任何數值。與既有的 v3 符號摺疊 offset 換算邏輯疊加時
  (`migrateSettings` 同時要處理「舊到 pre-v4」與「舊到 pre-v11」兩層舊格式),兩段轉換的
  判斷順序刻意確保不會互相蓋掉。

## 📐 決策

- **範圍嚴格限定在型別層,DB/UI/判定邏輯完全不碰**:SQL column、CSV 匯出表頭、畫面顯示文字
  (「大腿」/「小腿」)、Tailwind 設計 token(`--color-thigh`/`--color-shin`)全部維持原樣。
  這不是漏改,是刻意按 D3 的順序切分,把每一步的驗證範圍縮到可以獨立確認正確。
- **`RawAngles`/`LiveAngles`(`shared/protocol.ts`)這次不動**:雖然文件裡點名多關節問題的
  註解原句「`angles.thigh`」實際上指的正是這個型別,但它的消費者是判定引擎本體
  (`triggerEngine`/`movementMetric`)與即時視覺化(`Leg3D`/`AngleVisualizer`/`LiveChart`),
  範圍比今天改的這幾個型別大得多、風險也高得多(這條路徑正是這個專案兩次歷史臨床缺陷的
  發生地)。留給下一輪型別層工作,不在這次會期一次做完。
- **Rust 端用 serde rename 而非真的改欄位名/SQL 欄位**:這樣可以讓「型別」(對外 IPC 契約)
  跟「儲存」(SQL schema)兩件事的改動時間點徹底分開,DB migration 步驟到來時只需要處理
  SQL 層,不需要再回頭動 Rust struct 或 serde 屬性。
- **persist version 必須 bump,不能只改型別**:`Settings` 的 thigh/shin 欄位是真的會被寫進
  使用者 localStorage 的資料,不是純粹的編譯期型別。如果只改 TypeScript 型別不處理
  migrate,現有使用者(即使目前這個 Tauri build 還沒有真實硬體資料)下次開 App 時校準設定
  會因為 key 對不上而靜默重置成預設值——這正是本專案自己一貫的 persist 規則
  (見 `useStore.ts` 既有注解:「新增欄位一定要 bump version」)。

## ✅ 驗證

- [x] `cargo check` / `cargo test`:56 個測試全過(含新增的 2 個 wire-format regression test,
      直接序列化/反序列化確認 JSON key 真的是 `proximalAngle`/`distalAngle`/`proximalRoll`/
      `distalRoll`,不是 `thighAngle` 等舊名)
- [x] `npm run ci`(typecheck + test + build):268 tests / 25 files 全綠,測試數與改動前完全
      一致(沒有測試被意外刪掉或跳過)
- [x] `git status`:只有 `IRMS_App_Tauri/` 底下的檔案異動,`IRMS_App`(Electron 版)完全未觸碰
- [x] persist migration 手動核對三段舊格式測試(v0、v4→v5、v3 以前符號摺疊 offset)全部改回
      使用當年真實的 thigh/shin 命名當輸入,確認 `migrateSettings` 真的能把最舊格式一路
      升級到現在,而不是巧合通過(第一次跑测试時因為 sed 全域替換連測試輸入裡刻意模擬舊格式
      的欄位名稱都一併改掉,曾經讓一個測試斷言符號算反,已修正並確認為真正的舊格式輸入)

## Self-review

檢查情境:「一個已經在用 Tauri 版(即使目前只是 UI-only 預覽版)、persist version 還停在
v10 的使用者,升級到這個版本後,他手動調過的校準值(`thighZeroRaw` 等)還在不在?」——
用既有測試套件裡改寫過的三組 migrateSettings 測試直接驗證了這個情境(模擬 v0/v4/v10 三種
舊格式輸入,斷言升級後的 `proximalZeroRaw` 等新欄位精確等於舊值,不是預設值)。**PASS**——
但這是單元測試層級的驗證,沒有真的跑過「舊版 App 產生一份真實 localStorage → 升級到這個
commit → 開新版 App」這個完整流程的手動驗證,因為目前沒有任何裝置在跑真實校準資料。留給
之後 D3 剩餘步驟(DB migration)動工時,一併找機會做一次端到端確認。
