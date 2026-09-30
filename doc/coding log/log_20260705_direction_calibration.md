---
tags: [coding-log]
date: 2026-07-05
summary: "方向校正功能:六軸方向正式定義、axisSwap 自動偵測貼歪 90°、外展步驟自動判 Roll 方向、內外翻改帶符號(正=外翻);53 tests 全綠"
---

# 2026-07-05 變更日誌 — 方向校正(六軸方向定義)

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260705_guided_redesign|前置:引導式重構]]

## 🎯 目的

使用者指出「我們沒有定義六軸的方向」——確認為真實缺口:(1) 佩戴方位無規格,貼歪 90°
會使 pitch/roll 整組對調且精靈救不了;(2) Roll 方向語意未定義,且 kneeRoll 取絕對值,
內翻/外翻方向資訊直接丟失。

## 🔧 變更內容

1. **六軸方向正式定義**(doc/README §2.1 新增定義表):
   Pitch 正=向前抬;Roll 正=向外側傾;**kneeRoll 改帶符號 = SR − TR,正=外翻 (valgus)、負=內翻 (varus)**。
2. **axisSwap 軸對調**(`Settings.thighAxisSwap/shinAxisSwap`,persist **version 2**):
   `applyCalibration` 順序改為 軸對調 → 反相 → 偏移;精靈在前抬/後勾步驟以
   `detectAxisSwap`(動作幅度出現在哪個軸)自動偵測貼歪 90° 的感測器。
3. **Roll 方向自動判定**:精靈新增第 5 步「腿向外側擺」(可跳過)——外展時兩肢段
   roll 應變正,反了即設 invert;幅度門檻 15°,新錯誤碼 `rollDeltaTooSmall`。
4. **帶符號內外翻顯示**:Dashboard 詳細數值與精靈預覽顯示「X° 外翻/內翻」。
   DB `kneeRoll` 欄位本為 REAL,無需 migration(歷史資料為絕對值,僅新資料帶方向)。
5. `calibration.ts` 重構:`detectInverts/computeOffsets` 併入 `buildCalibrationPatch`
   (新簽名含 abduction 參數),新增 `effectiveRaw/detectAxisSwap`。

## ✅ 驗證

- [x] `npm run ci` 全綠:typecheck + **53 tests** + build
- [x] 新增 round-trip 測試:反向佩戴(pitch/roll 全反)與貼歪 90°(axisSwap)兩種佩戴,
      patch 套用後站直≈0、前抬為正、外展 roll 為正
- [ ] 📡 實機:精靈含外展步驟跑一輪;側擺腿確認內外翻方向標示正確

## 📝 後續待辦

- 帶符號膝角(區分屈膝/過伸)列 ROADMAP Phase 4
- History 圖表的 kneeRoll 曲線現在有正負,可考慮加零軸參考線
