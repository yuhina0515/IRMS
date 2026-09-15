---
tags: [coding-log, release, tauri, beta, calibration]
date: 2026-09-15
summary: "發布 v1.2.0-beta.10:實作 2026-09-15 會議裁決(感測器貼正面非外側根因)——精靈步驟1加小腿貼裝位置圖示(釘脛骨前緣)、步驟6預覽加外展殘留耦合提示。大腿外展步驟維持選配,修正了裁決原文「改強制」這一點(單腳站立是全精靈唯一的平衡風險步驟)。已更新 beta-latest manifest。"
---

# 2026-09-15 變更日誌 — Tauri v1.2.0-beta.10 發布

> **相關文件**:[[HOME|導覽首頁]] ·
> [[log_20260915_meeting_anterior_vs_lateral_mounting|前置:會議裁決與同日實作細節]]

## 內容

實作 [[log_20260915_meeting_anterior_vs_lateral_mounting]] 的可即做項目(不需真機):

- `calibration.ts`:新增 `COUPLING_RESIDUAL_RATIO_WARN`,`buildCalibrationPatch` 回傳
  `couplingWarning: {proximal, distal}`(三態:`null`/`true`/`false`)。
- `CalibrationWizard.tsx`:步驟1新增 `ShinMountDiagram`(行內 SVG,釘脛骨前緣旁邊),
  步驟6預覽畫面顯示殘留耦合提示(不擋套用)。
- 大腿外展步驟**維持選配**,未採裁決原文的「改強制」——該步驟是全精靈唯一需要單腳站立
  的動作,強制會犧牲既有的平衡可及性設計,詳見前置日誌的「同日實作」段落。

## 驗證

- `npm run ci`(`IRMS_App_Tauri`):typecheck、289 前端測試(含新增 4 個)、Vite build、
  `cargo fmt --check`、60 Rust tests、`cargo clippy -D warnings` 全綠。
- 版本號三處同步(`package.json`/`tauri.conf.json`/`Cargo.toml`)→ `1.2.0-beta.10`。

## 發布

- Commits:`7681bdc`(功能)、`6c094a0`(版本號)、`4a926d3`(Cargo.lock 同步)。
- 簽章 `npm run tauri build`:NSIS installer + `.sig` 產出成功。
- GitHub prerelease:<https://github.com/yuhina0515/IRMS/releases/tag/v1.2.0-beta.10>
  (`isPrerelease: true`,三項資產:installer、`.sig`、`latest.json`)。
- `beta-latest` manifest 已覆寫(`gh release upload beta-latest latest.json --clobber`)
  並回讀驗證:版本(`1.2.0-beta.10`)、下載 URL、updater signature 與本地 `.sig` 檔案
  逐字元一致。

## 尚未實機驗證

本版新增的殘留耦合判定邏輯目前只有合成資料測試覆蓋(見 `calibration.test.ts`),尚待
真機上實際比對大腿/小腿外展資料才能確認門檻(0.4)是否合理。大腿貼裝位置圖示、
`doc/README.md` §2.1 正式文字,依前置會議裁決,同樣等真機驗證(2026-09-08 會議行動項
第4項)通過後再處理。

## 關於「模組管理介面」

使用者同時提議若可行就做出「之前提到的模組管理介面」。查
[[log_20260911_meeting_dynamic_module_system]] 裁決:動態模組系統目前只拍板一個不碰
硬體的技術可行性 spike(hello-world 模組,無 UI),manifest 格式、正式模組交付機制、
**Settings UI 呈現**明確列為暫緩項,且該 spike 本身到今天還沒執行。「模組管理介面」
等同於裁決已明確暫緩的 Settings UI 呈現,在 spike 結果、manifest 格式都還不存在的情況下
開始做管理介面,會直接違反專案規則(b)「修缺陷不擴大議程」與 09-11 會議本身的裁決,
本次發版**未包含**這項——已告知使用者原因,未自行擴大範圍。
