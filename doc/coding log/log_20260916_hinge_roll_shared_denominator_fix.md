---
tags: [coding-log, calibration, cal-02]
summary: Fixed the shared-denominator Roll degeneracy in projectOntoHingeFrame (asin off-axis deviation instead of atan2 sharing pitch's z); partial CAL-02 progress, not the full redesign.
date: 2026-09-16
---

# Hinge-frame Roll: fix the shared-denominator degeneracy

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260915_live_calibration_singularity|根因分析]] · [[log_20260916_status_and_task_plan|任務計畫 CAL-02]] · [[log_20260916_claude_review_calibration_evidence|09-16 證據批次]]

## 🎯 目的

User pointed back at `log_20260915_live_calibration_singularity.md` as the report describing the still-open
problem — deep knee flexion drives `shinRoll` to roughly ±180° while the 3D pose view (`Leg3D.tsx`) looks
plausible, because it lerps the same underlying values and visually smooths the swing. Device is unavailable
this session (confirmed by the prior close-out log), so this is offline design/code work only, per that
log's resume instructions.

Traced the root cause precisely: `projectOntoHingeFrame`'s `roll = atan2(x, z)` shares the `z` component
(along the baseline axis) with `pitch = atan2(y, z)`. Deep flexion is exactly where pitch approaches ±90°,
driving `z → 0`; any residual `x` (real off-axis coupling from hinge-axis estimation error or soft-tissue/
strap movement) then divides against a near-vanishing denominator. Confirmed this is structural, not just
noise amplification: even with `x = 0` exactly (a mathematically perfect single-axis hinge, zero off-axis
component), `atan2(0, z<0)` still returns 180° once `z` crosses negative past 90° pitch — see the first
synthetic counterexample already added yesterday in `calibration.redesign.test.ts`.

## 🔧 變更內容

- `angleMath.ts` `projectOntoHingeFrame`: redefined `roll` from `atan2(x, z)` to `asin(clamp(x / |vector|, -1,
  1))` — the angle by which the live gravity vector deviates from the flexion plane, measured directly from
  `x` and the vector's own magnitude, independent of `z`/pitch entirely. No shared denominator, so it cannot
  degenerate as pitch sweeps through ±90°. Bounded to [-90°, 90°] by construction. For small angles near
  baseline (`z ≈ |vector|`), `asin(x/|vector|) ≈ atan2(x, z) ≈ x` — numerically equivalent to the old formula,
  so existing small-angle Roll values (abduction capture, coupling-residual warning in `calibration.ts`) are
  unaffected; only the large-pitch regime changes.
- `calibration.redesign.test.ts`: removed `it.fails` from the 150°-pure-flexion counterexample — it now
  genuinely passes (`pitch ≈ 150°`, `roll ≈ 0°`) instead of being an expected/documented failure.
- Pitch (`atan2(y, z)`), the primary flexion metric already confirmed correct on real hardware with lateral
  mounting, is unchanged. `useStore.ts`'s knee-angle path (`vectorAngleDeg` on raw vectors, not
  pitch-difference) was already independent of this bug and is also unchanged.

## 📐 測量語意（CAL-02 局部進度，非完整重新設計）

- **Pitch**（thigh/shin）：肢段沿屈曲軸的主要轉動角，0°=站直基準，正=依校準精靈定義的抬腿/勾腿方向。真機已驗證
  在外側貼裝下全範圍（含深屈膝 ~150°）正確。
- **Roll**（thighRoll/shinRoll）：重力向量偏離「屈曲平面」的角度，代表屈曲軸估計殘留誤差或軟組織/綁帶耦合——
  **不是**獨立的解剖自由度,是校準品質/貼裝穩定度的指標。值域 [-90°, 90°]，今日之前在深屈膝時無意義地飄到
  ±180°；今日之後有界且連續。
- **kneeRoll**：`shortestArcDelta(thighRoll, shinRoll)`，值域隨之收斂為約 [-180°, 180°]，語意不變。
- **Knee angle**：兩肢段原始重力向量的夾角（`vectorAngleDeg`）減站姿夾角，與 pitch/roll 分解完全獨立，不受
  本次變更影響。

## ✅ 驗證方式

- [x] `calibration.redesign.test.ts` 兩個合成反例皆通過（第一個反例的 `it.fails` 標記移除且真正通過）。
- [x] `npm run ci`（`IRMS_App_Tauri`）全綠:TypeScript 檢查通過、Vitest 29 檔 316 測試通過（較 09-16 稍早
  批次多 1 個——原本標記 expected-failure 的反例現在是真通過）、Vite build 通過、`cargo fmt --check`／
  62 個 Rust 測試／`cargo clippy -D warnings` 皆通過。
- [ ] 真機驗證:裝置目前不在身邊，deep-flexion Roll 的修復尚未在真實感測器資料上確認。`packets.txt`
  （66,927 筆既有 trace）理論上可重播比對，但如 09-16 稍早批次所記錄，該 trace 對應的確切
  `proximalHingeAxis`/`distalHingeAxis`/`*ZeroAccel` 校準設定仍未尋獲，離線重播暫時無法做逐點數值比對。

## 📝 後續待辦

- **CAL-02 未完成部分**:本次只解決了第一個合成反例(共用分母退化)。第二個反例
  （`independently rotated sensor coordinates cannot be compared as one shared frame`——兩個獨立貼裝的
  感測器座標系直接比較會算出假的相對角）仍是通過但未被任何生產路徑修正的「已知限制」，需要在完整
  CAL-02 設計決策文件中處理:是否要在計算 kneeRoll／未來的 abduction 相對量測時，把兩個感測器投影到
  共用參考系,而非直接比較各自機身座標。
- 重複擷取品質門檻、貼裝假設書面化、獨立肢段重校準等 CAL-02 完成標準（見任務計畫表）仍未開始。
- 待裝置可用時，補做深屈膝真機驗收，並嘗試找回/重新擷取與 `packets.txt` 對應的完整校準設定，讓離線重播
  能做逐點數值驗證而非只靠合成反例。
- 未提交:本次變更疊加在既有 22 個未提交檔案之上，與之前批次一致保留在工作目錄，未建立 commit。
