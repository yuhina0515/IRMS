---
tags: [coding-log, calibration, cal-02]
summary: Added an unwired, synthetically-validated candidate (reconcileToReferenceFrame) for the second CAL-02 counterexample — cross-sensor-frame knee-angle comparison — deliberately not wired into the live knee formula pending hardware validation.
date: 2026-09-16
---

# Knee-angle cross-sensor-frame reconciliation: a validated candidate, deliberately not shipped

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260916_hinge_roll_shared_denominator_fix|今日稍早的 Roll 修復]] · [[log_20260916_status_and_task_plan|任務計畫 CAL-02]]

## 🎯 目的

繼續今晚稍早的 Roll 修復,處理 `calibration.redesign.test.ts` 裡第二個尚未有生產路徑修正的合成反例:
兩個獨立貼裝的 IMU,即使兩肢段實際同步轉動(真實相對角為零),只要其中一顆感測器貼裝方向與另一顆
不同,直接比較兩者的原始重力向量就會算出假的相對角(反例:假 60 度),且扣除站姿夾角(純量)無法
補償,因為這個誤差是隨動作方向而變的座標系差異,不是常數 offset。

`useStore.ts` 目前的 knee 計算(`vectorAngleDeg(raw.thighAccel, raw.shinAccel) - kneeZeroRaw`)正是
這個反例描述的模式。

## 🔧 變更內容(僅新增,未接上即時路徑)

- `angleMath.ts` 新增 `reconcileToReferenceFrame`:用 triad/Wahba 對應法的簡化版,把來源感測器的即時
  向量,透過「屈曲軸/側軸/基準軸」這組正交基底轉成與感測器座標系無關的抽象係數,再用目標感測器自己
  的基底把同一組係數展開回目標座標系——等於把來源向量「搬」到目標感測器的座標系,兩者才能有意義地
  比較。假設近端(髖屈參考動作)與遠端(膝屈參考動作)的屈曲軸實際指向同一個真實世界方向(矢狀面內
  外側軸)——這個假設本身不是新引入的,是本專案 pitch/roll 分解、kneeRoll 內外翻正負號等既有邏輯
  已經隱含依賴的同一個假設。
- `calibration.redesign.test.ts` 新增兩個合成測試:(1) 重現反例場景並證明和解後的比較收斂到 ~0 度
  (原本的原始向量比較仍如實重現假 60 度,作為對照);(2) 證明和解後的公式在有真實相對屈曲時仍正確
  讀出該角度,不會退化成恆零。

## ⚠️ 為什麼刻意不接上 useStore.ts

這不是「還沒空接」,是有意識的決定:

1. **髖屈軸與膝屈軸不是同一條物理線**,只是方向假設平行——這個假設尚未在真機上獨立驗證過。
2. `deriveHingeAxis` 本身只用兩個平均點解軸,對參考擷取時的離軸雜訊沒有備援(`log_20260915_live_
   calibration_singularity.md` 已指出這點)。這個和解函式會把近端、遠端兩次獨立擷取的雜訊複合在一起,
   理論上比單一肢段的 roll 誤差更敏感——而 roll 今天改的是次要顯示值,knee 是驅動目標/警報邏輯的
   **主要**量測值,風險不對等。
3. 本專案 GitHub issue #3 記錄過兩次「幾何推理看起來明顯正確,只有真人戴著裝置看即時數字才抓到真正
   bug」的前例。在真機比對出「原始向量比較的假角度失效模式」跟「和解公式複合雜訊的失效模式」哪個在
   實務上更常見之前,不應該替換現行公式——即使合成證明兩者都自洽。

## ✅ 驗證方式

- [x] `npx vitest run src/services/calibration.redesign.test.ts`:4 測試全過(含新增的 2 個)。
- [x] `npm run typecheck`:通過。
- [ ] 真機驗證:未執行,裝置不在身邊。`reconcileToReferenceFrame` 未被任何生產路徑呼叫,對現有行為
  零影響。

## 📝 後續待辦

- 裝置可用時:用既有 wizard 擷取流程同時記錄 `proximal/distalHingeAxis`,離線比較「現行公式」vs
  「和解公式」在同一組真人動作 trace 上的差異,才能決定要不要接上 `useStore.ts`。
- 若決定採用,需要同時決定:和解方向(把 distal 搬進 proximal 座標系,或兩者都搬進某個「近似世界」
  座標系)、以及與現有 `kneeZeroRaw` 純量站姿修正的關係(和解後理論上不再需要額外扣一個純量站姿
  夾角,因為站姿本身在和解後應收斂為 0——待真機資料確認)。
- CAL-02 設計決策文件(任務計畫表要求的正式產出)仍未寫——今天的兩篇 log 是分析與候選方案,還不是
  最終決策文件本身。
