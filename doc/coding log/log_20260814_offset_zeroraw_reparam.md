---
tags: [coding-log]
summary: "落地 2026-08-12 會議裁決第 1 項——offset 改參數化為 zeroRaw,消滅已隨 v1.0.1 出貨的 invert 翻轉雙倍偏差缺陷。四個 Settings 欄位(thighOffset/shinOffset/thighRollOffset/shinRollOffset)改名為 *ZeroRaw,判定公式由 raw×sign+offset 改為 (raw−zeroRaw)×sign;buildCalibrationPatch/buildQuickZeroPatch 寫入端同步簡化,quickZero 不再需要讀 invert。persist version 3→4,migrateSettings 補上舊格式換算(zeroRaw = -offset×sign),並新增掃過全部 2 的 6 次方共 64 種 axisSwap/invert 組合的由建構不變式測試。144→147 tests,npm run ci 全綠。"
date: 2026-08-14
---

# 2026-08-14 變更日誌 — offset 重新參數化為 zeroRaw

> **相關文件**:[[HOME|導覽首頁]] · [[PROJECT_STATUS|開發進度]] · [[ROADMAP|架構與代碼計畫]] ·
> [[log_20260812_meeting_calibration_ui_plan|2026-08-12 校正與 UI 計畫會議]]

## 🎯 目的

落地 [[log_20260812_meeting_calibration_ui_plan|08-12 會議]]裁決的第 1 項:把校準 offset
的「符號摺疊」表示法換成 `zeroRaw`。根因是舊表示法 `offset = -(zeroRaw × sign)` 把 invert
符號焙進 offset 常數,使用者在「進階手動校準」翻轉 invert 開關時 offset 不會重算,校準姿勢
的殘差變成 `2 × offset`(30° 讀成 -60°)。在 `segment_extension` 下,這會讓患者往前抬腿被
記成後伸達標、蜂鳴器響、reps 寫進 DB——一場方向完全做錯的療程被完整記錄成達標。此缺陷已
隨 v1.0.1 出貨。

裝置目前不在手邊(見 08-12 會議),這項工作被裁定為「不需硬體、純 vitest」可推進的最高
優先項。

## 🔧 變更內容

- **`renderer/src/store/useStore.ts`**
  - `Settings` 型別:`thighOffset`/`shinOffset`/`thighRollOffset`/`shinRollOffset` 更名為
    `thighZeroRaw`/`shinZeroRaw`/`thighRollZeroRaw`/`shinRollZeroRaw`,語意改為「校準姿勢
    當下、經 axisSwap 對調後的原始讀值」,不折算 invert 符號。
  - `applyCalibration`:判定公式由 `raw × sign + offset` 改為 `(raw − zeroRaw) × sign`(先
    減零位、再反相)。與舊公式數學等價(offset ≡ -zeroRaw×sign 時完全相同),差別只在
    invert 事後翻轉時是否會擾動零位——新公式不會。
  - persist `version: 3 → 4`;`migrateSettings` 新增舊版符號摺疊 offset → zeroRaw 的換算
    (`zeroRaw = -offset × (invert ? -1 : 1)`),沿用既有「以 DEFAULT_SETTINGS 補齊缺漏
    欄位」機制,對已是新格式的資料不重複套用。
- **`renderer/src/services/calibration.ts`**
  - `buildCalibrationPatch` 步驟 4、`buildQuickZeroPatch`:改為直接寫入有效軸的原始讀值
    (`effBase.thigh` 等)作為 `zeroRaw`,不再乘 sign。兩處實作都變短——`buildQuickZeroPatch`
    甚至不再需要讀 `settings.*Invert`。
- **`renderer/src/views/SettingsView.tsx`**
  - 「進階手動校準」的 NumField 隨欄位改名(`Thigh Offset (°)` → `Thigh Zero (raw °)` 等),
    並補一段提示文字:欄位存的是「站直姿勢當下的原始讀值」而非要加減的偏移量,手動輸入前
    需先知道目前的原始讀值,一般情況建議用「快速歸零」按鈕。
- **測試**(`useStore.test.ts` / `calibration.test.ts`)
  - 既有測試隨欄位改名與公式調整重新推導預期值。
  - 新增 `migrateSettings` 舊格式換算測試(含四軸同時換算後 `applyCalibration` 回到 0 的
    可逆性驗證,以及「已是新格式時不重複套用」的防呆)。
  - 新增**由建構保證的不變式測試**:掃過 `thighAxisSwap`/`shinAxisSwap`/四個 `*Invert` 共
    2 的 6 次方(64)種旗標組合,斷言 `zeroRaw` 對應的原始姿勢一律讀 0——含一組刻意跨
    ±180 分支切點的數值(173°/-168°),驗證 wraparound 不會破壞不變式。

## ✅ 驗證方式

- [x] `npm run ci`(typecheck + test + build)全綠:147 tests / 14 files(144 → 147,新增
      3 個測試案例),typecheck 與 build(main/preload/renderer)皆無錯誤。
- [x] 全倉庫掃描確認沒有殘留的舊欄位名稱引用(除 `migrateSettings` 內刻意保留的換算邏輯
      與其測試外)。

## 🔍 自我審查

情境:使用者升級前的 `localStorage` 存著 v1.0.1 的舊格式 `{ thighInvert: true, thighOffset:
-12.5, ... }`,四軸同時有非預設 invert/offset 組合。驗證 `migrateSettings` 換算後,把換算
結果餵回 `applyCalibration` 搭配「換算前 offset 所對應的校準姿勢」,四軸皆應讀回 0(見
`useStore.test.ts` 新增測試)。結果:通過——換算公式可逆,不會讓既有使用者的校準值升級後
跑掉。

## 📝 後續待辦

依 08-12 會議裁決順序,下一項是「session 中凍結校準」(`setSettings` 的校準欄位、快速歸零
按鈕、精靈入口皆需在 `session.running` 時鎖住)——這不是清理項,而是接下來 migration 6
(單一 `sessions.calibration TEXT` JSON 欄位)成立的前提,務必同批或更早落地。之後才是
migration 6 本身與縮小版零位檢查 UI。
