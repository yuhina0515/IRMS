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
- **2026-07-14 v1.0.1 發布**([[log_20260714_v1.0.1_release|日誌]]):版本號
  bump、重新打包確認自訂圖示生效(不再是預設 Electron 圖示),`gh release
  create` 發布
- **2026-07-17 外展校正判斷改造**([[log_20260717_calibration_abduction_fix|日誌]] ·
  [[log_20260717_calibration_abduction_meeting|會議]]):roll invert 大腿/小腿逐軸解耦、
  第 5 步 stdDev 門檻放寬至 4°、新增 verified 旗標(persist v3);74 tests
  ⚠ **2026-08-01 會議重新評價**:此路徑不進任何判定,見下
- **2026-08-01 專案現況解析**([[log_20260801_project_status_analysis|日誌]]):實測 74 tests
  全綠;確認三項結構缺口(無 DB migration / 無 ErrorBoundary / 無 lint)與最大風險
  ——整條硬體迴路從未在真實裝置上驗證
- **2026-08-01 App 全面檢視會議**([[log_20260801_meeting_app_review|會議紀錄]]):
  三方辯論裁決「**判定正確性批次 → 桌面燒錄旋轉記錄 → migration + session 收尾**」。
  重大發現:① **roll 完全不進判定路徑**(連安全警報都不讀),校準精靈第 5 步的單腳站立
  只為校準顯示用的正負號;② 出貨預設 `Backward Extension` 會從**靜止不動的腿**計出幻影
  reps 寫入 DB;③ 超限警報未與 session 綁定、UI 無法靜音、重連後不重新武裝。
  專案規則新增:**動 UI/校準前先指出它餵給哪條判定路徑,指不出來就是裝飾性的**
- **2026-08-01 裁決實作**([[log_20260801_review_fixes_implementation|日誌]]):
  第一與第三順位全數完成——rest 不變式(殺掉出貨預設的幻影 reps)、wrap-safe 角度數學、
  警報三修 + 靜音按鈕、判定參數鉗制、`user_version` migration runner(含 v1.0.1 升級
  路徑測試)、孤兒 session 收尾 + `abandoned` 標記、ErrorBoundary、History 改畫實際
  判定的指標 + LTTB 抽樣、Record Pose 回補;**74 → 121 tests**,`npm run ci` 全綠。
  ⚠ 全部未經實機驗證
- **2026-08-01 自由修改批次**([[log_20260801_freeform_app_improvements|日誌]]):
  獨立安全上限(容錯與安全上限解耦,migration 5)、guidance 的 `-Infinity`、
  endSession 謊報「已儲存」、斷線後量表殘值、刪除死碼;校準精靈**免手擷取**
  (擺好姿勢穩住 1.5 秒自動觸發)+ 上一步、四個 modal 支援 Esc;
  elbow/shoulder 協定明確擋下(判定仍讀腿部感測器,不再讓它產生假紀錄);126 tests
- **2026-08-03 目視驗收與其後的修正**([[log_20260803_visual_verification_fixes|日誌]]):
  首次取得螢幕存取,把 app 開起來看。抓到 4 個只有跑起來才看得見的缺陷——冷開機
  誤報「數值已過期」(沒有值可以過期)、未支援協定的量表照樣畫出目標帶看起來仍在
  運作、**History 回顧圖畫出一條當時不存在的安全線**(用導出值而非該場實際生效的
  `safetyLimit`,屬病歷等級錯誤)、Esc 一次關掉兩層 modal(`stopPropagation` 擋不住
  同目標的兄弟 listener);新增 `escapeStack` 純邏輯層 + 6 tests(126 → **132 tests**)。
  以隔離 `--user-data-dir` 造假資料驗證 History / LTTB / CSV,**使用者真實 DB 全程未動**。
  ⚠ Esc 實際按鍵行為仍未驗證(自動化輸入送不出 Escape),校準精靈需連線才進得去
- **2026-08-03 方向裁決會議**([[log_20260803_meeting_direction_after_visual_pass|會議紀錄]]):
  三方辯論 + 交叉詰問,三項主張被提出者自己撤回。**最重大發現:`main` 一直在出貨會
  捏造 reps 的版本,而 v1.0.1 正是從它切出來的**——修正早已寫好卻在未合併分支上躺了兩天;
  PR #1 已重寫描述並合併,`main` 現為 141 tests 綠。裁決順序:合併 → 修精靈第 5 步誤觸發
  → 單一 `ingest(text)` 注入管線 → 元件測試(只鎖臨床輸出面)→ 感測器模型測試 →
  migration 6 原始欄位 → 對比修正。**否決** `FILTER_ALPHA` 0.85→0.98(模型缺陀螺零偏項,
  最佳解必然貼邊界;且提交它會摧毀自己的驗證條件)、qualityScore(協定沒有陀螺通道 +
  0.1° 量化底線)、LiveChart rAF(已被 `UI_SYNC_MS = 80` 實作,backlog 項應刪除)。
  **規則變更**:「指出它餵給哪條判定路徑」→「**指出它改變哪一個決定,以及那是誰的決定
  ——引擎的,還是人的**」(舊規則按字面會把畫錯的安全線判為裝飾性)
- **📡 硬體工作已移至 GitHub issues**:[#2](https://github.com/yuhina0515/IRMS/issues/2)
  桌面燒錄 + ±180° 旋轉記錄、[#3](https://github.com/yuhina0515/IRMS/issues/3) 實機 E2E、
  [#4](https://github.com/yuhina0515/IRMS/issues/4) 校準快照 migration。
  **慣例:需要實機的工作一律開 issue,不寫進 ROADMAP**
- **韌體 v3**(模組化 + 斷線即靜音,[[log_20260704_firmware_v3_rewrite|日誌]])→ **未燒錄請先重燒**(見 issue #2)
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
