---
tags: [coding-log, tauri, windows, dpi, window-size]
summary: Clamped dpi_guard's target main-window size to the current monitor's work area (minus the native frame, never below 1024×600) so the Dashboard's bottom evidence bar no longer hides behind the taskbar at 125% on 1080p. Added a startup-only nudge back inside the work area. Pure sizing/placement helpers unit-tested; full `npm run ci` green on Linux. Unverified on real Windows at 100%/125%/175%.
date: 2026-09-24
---

# 主視窗尺寸夾到螢幕工作區 (work area clamp)

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260914_dpi_guard_auto_detect_module]] ·
> [[log_20260914_native_decorations_revert_confirmed_fix]] ·
> [[log_20260914_titlebar_click_offset_physical_click_test]]

## 🎯 目的

PR #10 的 Windows 11 驗證(125% 縮放、1080p)發現:主視窗 1280×820 logical = 1600×1025
physical client area,再加上原生標題列/邊框,已超過扣掉工作列後的工作區(1920×1032)。
Dashboard 底部可收合的 evidence bar 被工作列蓋住。這不是 UI 重建造成的,`main` 上的現行 UI
也一樣。

## 🔍 為什麼不能只在啟動時 resize 一次

`dpi_guard.rs` 會在啟動時與每次 `ScaleFactorChanged` 檢查視窗尺寸,若偏離
`MAIN_LOGICAL_WIDTH`×`MAIN_LOGICAL_HEIGHT` 就強制拉回 1280×820。一次性的啟動 resize 會被
dpi_guard 立刻還原,所以夾值必須放進 dpi_guard 的**目標尺寸**。

## 🛠 變更(僅 `IRMS_App_Tauri/src-tauri/src/dpi_guard.rs`)

- `target_logical_size(work_area, frame)`(純函式):
  `min(設定尺寸, floor(工作區 logical − 原生外框 logical))`,再 `max(minWidth/minHeight = 1024×600)`。
  取不到螢幕 / 工作區時回傳原本的 1280×820。
- `target_for(window, scale)`:用 `window.current_monitor()?.work_area()`(physical)除以
  scale factor 換成 logical;原生外框以 `outer_size − inner_size` 實測(取不到則視為 0)。
- `correct_drift` 改為與上述目標比較並 `set_size(target)`;log 行多印 `target=`。
- `fitted_position(...)`(純函式)+ `fit_into_work_area(window)`:**只在啟動**
  (`check_and_correct`)執行——若縮小後的外框仍超出工作區(例如 Windows 預設擺放位置太低),
  把視窗平移回工作區內;視窗比工作區大時以左上角為準,保證標題列可點。`ScaleFactorChanged`
  時不做,避免和使用者拖曳視窗跨螢幕互相拉扯。
- 保留原生 decorations,`tauri.conf.json` 未改。splash 的 grow-to-main 動畫在
  `check_and_correct` 之後才讀主視窗 rect,所以會自然以夾過的尺寸/位置為終點。

### 預期數值(Windows 11 外框約 16×39 logical)

| 縮放 | 工作區 (logical) | 目標 inner (logical) |
|---|---|---|
| 100% | 1920×1032 | 1280×820(不變) |
| 125% | 1536×825.6 | 1280×786 |
| 175% | 1097×589.7 | 1081×600(受 minHeight 限制,仍可能略超出) |

175% 在 1080p 上,工作區本身就比 minHeight + 外框還矮,依需求不低於 600,因此此時仍可能被
工作列遮住一小截——這是設定的 minHeight 造成的取捨,若要處理需另議(例如降低 minHeight)。

## ✅ 驗證

- 新增 7 個單元測試(`dpi_guard::tests`):無工作區 fallback、100% 不變、125% 夾高度並確認
  整窗 physical ≤ 1032、175%/極小螢幕不低於 min、位置已在內 → `None`、往上推出工作列、
  比工作區大時保左上角(含負座標副螢幕)。
- `npm run ci`(typecheck、vitest、build、rustfmt、cargo test 57 passed、clippy -D warnings)
  在 Linux 容器上全綠。
- ⚠ **尚未在實機 Windows 上驗證**。需在 100% / 125% / 175% 各開一次,確認:底部 evidence bar
  可見、標題列可點、`[dpi_guard]` log 的 `target=` 符合上表、175% 點擊位移問題沒有回來。
