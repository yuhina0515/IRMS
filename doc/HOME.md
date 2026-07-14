---
tags: [irms, moc]
description: IRMS 專案導覽首頁(Obsidian 起始頁)
---

# 🏠 IRMS 專案導覽

> 智慧復健監測系統 — ESP32 穿戴感測 + Electron 桌面監測端

## 📌 核心文件

| 文件 | 內容 |
|---|---|
| [[README\|專案總覽]] | Repo 頂層說明 |
| [[doc/README\|系統規格]] | 硬體腳位、BLE 協定、韌體/App 架構 |
| [[PROJECT_STATUS\|開發進度]] | 各階段完成狀況與已知待驗證項目 |
| [[OPTIMIZATION\|優化待辦]] | 待改進項目清單 |
| [[AI_CODING_RULES\|編碼規範]] | AI 協作與程式碼規範(含 SQLite Schema) |
| [[IRMS_架構圖.canvas\|🗺 系統架構 Canvas]] | ESP32 任務 ↔ BLE ↔ Electron 三進程互動圖 |
| [[ROADMAP\|📍 架構與代碼計畫]] | 架構決策 (D1–D4) 與 Phase 0–5 開發路線圖 |

## ⚠ 目前狀態速記

- App 已重寫為 **Electron + Vite + React + TS + better-sqlite3**(v2),詳見 [[log_20260627_app_v2_rewrite|v2 重寫日誌]]
- 2026-07-03 全面架構審查修復 8 項缺陷(BLE 指令 `\n` 比對失效等),詳見 [[log_20260703_architecture_audit_fixes|審查修復日誌]]
- **2026-07-05 偵測與顯示全面重構**([[log_20260705_guided_redesign|日誌]]):metric 正規化層、
  引導式單一主指標 Dashboard、校準精靈;`npm run ci` 全綠
- **2026-07-05 方向校正**([[log_20260705_direction_calibration|日誌]]):六軸方向正式定義
  (README §2.1)、axisSwap 偵測貼歪 90°、外展步驟判 Roll 方向、內外翻帶符號(正=外翻);53 tests
- **2026-07-11 達標判定穩定化**([[log_20260711_trigger_stability|日誌]]):引擎遲滯 4°+
  出區寬限 250ms(進度凍結不歸零)、EMA 平滑層(α=0.3);64 tests
- **2026-07-11 UI 節流**([[log_20260711_ui_throttle_perf|日誌]]):25Hz 封包流以 80ms
  尾緣節流同步 UI(重繪減半),判定/DB 仍全速;71 tests + dev 煙霧測試
- **2026-07-12 Apple 風格雙主題**([[log_20260712_apple_theme|日誌]]):語意 token +
  淺/深跟隨系統;theme.ts 供 Chart.js/Three.js 解析 token 即時換色
- **2026-07-12 Liquid Glass 改版**([[log_20260712_liquid_glass|日誌]]):iOS 26/27
  玻璃材質(backdrop-filter+頂緣高光+膠囊控件)
- **2026-07-12 Liquid Glass 全面化**([[log_20260712_liquid_glass_full_pass|日誌]]):
  背景重設計(色彩 blob 慢漂移)、三層鏡面 rim、捲軸玻璃化
- **2026-07-13 自製向量桌布**([[log_20260713_custom_wallpaper|日誌]]):aurora 漸層
  SVG 淺/深各一張,blob 降為點綴;feTurbulence 有光柵化效能地雷,勿用;待視覺驗收
- **2026-07-14 架構會議(WinUI 3 暫緩)**([[log_20260714_architecture_meeting_winui3|會議紀錄]]):
  三方顧問辯論後決議「驗證優先」——先 BLE 實機驗證+Profiler 找卡頓根源,
  改善 <50% 才考慮改寫;71 tests 全綠不重寫
- **2026-07-14 側欄拖拉 + GlassDropdown + 選單扭曲**([[log_20260714_ui_dropdown_sidebar_warp|日誌]]):
  側欄可拖拉調寬帶晃動、原生 select 全面換成點擊彈出的 GlassDropdown、
  側欄/下拉面板套 SVG 扭曲濾鏡(僅選單類,非全部卡片);自我審查抓到 3 個真實
  缺陷(多餘重繪、晃動被 transition 吃掉、把手被 overflow 裁切一半)並修復
- **2026-07-14 底部導覽列改版**([[log_20260714_bottombar_layout|日誌]]):移除整個
  左側 Sidebar,改頂部狀態列(logo/連線/Connect)+ 底部 icon 導覽列;LiquidKnob
  改寫成可抓取拖曳(`useLiquidKnob` hook);校準精靈第 2 步倒數卡死的 React
  StrictMode 根因已修復(`cancelledRef` 未在 effect 本體重設)
- **2026-07-14 拖曳修復+下拉動畫+無邊框視窗**([[log_20260714_drag_fix_dropdown_anim_titlebar|日誌]]):
  選單拖曳改用 window 層級監聽(不再依賴 pointer capture)修好切換失效問題;
  GlassDropdown 改成長大/縮小動畫;指示塊拖曳時依速度拉伸;視窗改
  `titleBarStyle:'hidden'`+`titleBarOverlay` 滿版無邊框(視覺效果待使用者於
  真實 Electron 視窗驗收)
- **2026-07-14 發布前文件清理**([[log_20260714_doc_cleanup_and_release|日誌]]):
  刪除混入 repo 的個人學校作業檔案與空設定檔、修正過時內容(10Hz→25Hz 等)、
  雙軌工作紀錄整合為單一 `doc/coding log` 系統(`.claude/logs` 停用,見
  `.claude/CLAUDE.md` 專案層級覆寫)
- **2026-07-14 打包 exe + GitHub Release 發布**([[log_20260714_exe_packaging_and_github_release|日誌]]):
  修好 electron-builder 打包時 winCodeSign symlink 權限問題(需開 Developer
  Mode);實測打包後的 exe 可正常啟動;用 `gh release create` 發布
  **v1.0.0**,附上 Windows 安裝檔
- **2026-07-14 Logo 套用 + 上下 bar 內縮**([[log_20260714_logo_and_layout_inset|日誌]]):
  使用者提供的 logo 去背(飽和度+亮度分離,非單純色鍵)並裁出純圖標版本,
  套到 TopHeader 與應用程式 `.ico`;頂部/底部 bar 改為內縮浮動樣式,不再
  貼滿橫向版面
- **韌體 v3**(模組化 + 斷線即靜音,[[log_20260704_firmware_v3_rewrite|日誌]])→ **未燒錄請先重燒**
- 3D 即時姿態視圖([[log_20260704_3d_posture_view|日誌]]);BLE 實機連線已驗證 OK
- 📡 待實機:校準精靈跑一輪 → E2E 清單(達標音/超限/ERR/斷線收尾/精靈 round-trip)

## 🗂 變更日誌

![[coding-logs.base]]

## ✍ 新增日誌

用指令面板 `Insert template` → 選 `coding-log`(模板在 `doc/templates/`),
檔名格式:`log_YYYYMMDD_主題.md`,放入 `doc/coding log/`。

## 📆 每日筆記

點左側日曆圖示或指令面板 `Open today's daily note`,
會自動以 `doc/templates/daily-note` 模板在 `doc/daily/` 建立當日筆記。
