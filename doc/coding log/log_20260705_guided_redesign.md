---
tags: [coding-log]
date: 2026-07-05
summary: "偵測與顯示邏輯全面重構:metric 正規化層+引導式單一主指標 Dashboard+校準精靈(自動判 invert/offset);50 tests 全綠"
---

# 2026-07-05 變更日誌 — 偵測與顯示邏輯全面重構(引導式)

> **相關文件**:[[HOME|導覽首頁]] · [[ROADMAP|架構與代碼計畫]] · [[log_20260704_firmware_v3_rewrite|前置:韌體 v3]]

## 🎯 目的

實測回饋「動作偵測與 2D/3D 顯示不如預期,太混亂」。根因:(1) 判定條件依賴特定感測器
符號慣例,佩戴方向不同就錯,手動 invert/offset 難設對;(2) 畫面無「主指標」概念,
不知道看哪個數字、離達標多遠、該做什麼。

## 🔧 核心設計:統一符號慣例 + 正規化 metric 層

- 慣例:Pitch 0° = 站直,正值 = 向前抬;由校準精靈保證,下游不再各自處理符號。
- 主指標「值越大越接近目標」:joint_angle→knee、elevation→thigh、extension→−thigh。
- 三種 triggerType 判定在正規化空間同構,收斂為單一路徑。

## 📦 新增

- `services/movementMetric.ts` — computeMetricSample/Zone、metricInfo;判定常數單一來源。
- `services/guidance.ts` — 教練提示(overLimit/straightenKnee/raise/lower/hold/returnToRest)。
- `services/calibration.ts` — 精靈純數學:captureStats、detectInverts、offsets、
  buildCalibrationPatch(stdDev≤3°、|Δ|≥20° 驗證)。
- `components/MetricGauge.tsx` — 弧形量表(目標帶/超限刻線/回位刻線/膝直徽章)。
- `components/CoachHint.tsx` — phase 徽章(準備/保持/回位)+ 引導大字。
- `components/CalibrationWizard.tsx` — 五步精靈:佩戴確認→站直歸零→前抬大腿→後勾小腿→
  預覽套用(套用前不寫 settings;預覽要求確認「抬腿數字變大」)。

## 🔁 修改

- `triggerEngine.ts` — 改吃 EngineInput{sample,zone,holdTimeMs},單一判定路徑,
  新增 `phase` getter;**事件語意與狀態機時序零變更**(舊測試逐字遷移全綠證明)。
- `sessionController.ts` — 引擎接線 + phase 去重同步至 store;緩衝/指令機制不動。
- `useStore.ts` — SessionRuntime.phase、Settings.lastCalibratedAt、
  **persist version:1 + migrateSettings**(防 shallow merge 覆蓋新欄位,保留舊手動校準)。
- `DashboardView.tsx` — 引導式版面:主指標面板(動作名+量表+教練提示)+ 右欄(進度環+
  Session 控制);趨勢圖/3D/2D/詳細數值收進 tab(單一掛載);未校準警示 chip。
- `SettingsView.tsx` — 精靈入口 + 上次校準時間;手動校準收進「進階」摺疊。
- 計畫偏差:AngleVisualizer 未改用 computeMetricZone——重複的判定「常數」已集中到
  metric 層,2D 弧的視覺幾何維持 target±tol,無實際重複邏輯。

## ✅ 驗證

- [x] `npm run ci` 全綠:typecheck + **50 tests**(含引擎遷移迴歸鎖、校準 round-trip)+ build
- [ ] 📡 實機:精靈跑完 → 站直≈0/抬腿為正 → 三種預設動作達標/超限/回位與提示一致
- [ ] 📡 舊 localStorage 升級路徑(手動校準值不丟失)

## 📝 後續待辦

- 實機驗收後,若 25Hz 下量表重繪掉幀 → 改命令式訂閱(介面已隔離)
- Roll invert 仍為手動(精靈只歸零 offset),文件已註明
