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
- **2026-08-07 校正 bug + 響應式修正**([[log_20260807_meeting_calibration_bug_and_responsive_layout|會議紀錄]]):
  使用者重燒韌體實機連線後回報校正異常。三方獨立調查全數收斂於同一處——**Settings 的
  「快速歸零」漏套 `axisSwap`**,貼歪 90° 的感測器歸零後 offset 會算在錯的物理軸上,
  且無任何錯誤訊息(2026-06-27 寫下,早於 axisSwap,是原始遺漏非迴歸)。修法比照精靈
  路徑,抽成 `calibration.ts` 的 `buildQuickZeroPatch` 純函式,由 vitest 覆蓋;
  **132 → 144 tests**。UI 部分**否決「重新設計排版」的架構重寫**,改採 5 項具體修正
  (兩處寫死 `height:320` → aspect-ratio、Dashboard 900px 斷點、視窗最小高度 680→600
  併夾在工作區內、頂列改用 `env(titlebar-area-*)`)。新增 `vite.browsertest.config.ts`
  純瀏覽器測試設定,四種尺寸實測無溢出;真實 Electron 視窗量到頂列 inset **136px**,
  證實 `env()` 在本專案設定下確實生效(非退回 150px 常數)。重新打包 exe 成功
- **2026-08-12 倉庫與文件整頓**([[log_20260812_repo_and_doc_cleanup|日誌]]):把 08-07
  已完成卻躺在工作樹五天的成果分三個 commit 進版控;清掉 `.claude` 殘留備份與已停用的空
  `logs/` 目錄並補 `.gitignore`(原本只有全域 ignore 蓋到,換機器 clone 就會漏)。
  四份核心文件全面對齊現況:OPTIMIZATION 打勾 5 項已完成、被否決項改為保留並註明理由
  (刪掉會讓同一提案幾個月後重新被辯論)、修好 §7/§8 順序顛倒;ROADMAP 補 08-03 / 08-07
  兩次順位覆寫;AI_CODING_RULES 的 schema 補齊 migration 2–5 的欄位、修好 4.1 跳 4.4 的
  節號、判定邏輯改寫為 movementMetric + 獨立 `safetyLimit` 的現況;PROJECT_STATUS 由
  「只涵蓋到 06-30」的歷史檔改寫成現況快照。寫連結檢查器掃 198 條連結,修好 v1 時代四份
  日誌裡 9 條指向搬家前絕對路徑的死連結(只改指標、不動敘述)。`npm run ci` 全綠
- **2026-08-12 校正與 UI 計畫會議**([[log_20260812_meeting_calibration_ui_plan|會議紀錄]]):
  會前更正一項事實錯誤——**韌體其實早在 8/07 就已燒錄、BLE 實機連線成功、校準在真裝置上
  跑過**,文件與 issues #2/#3 的「從未驗證」敘述已過時(仍未驗證的是達標音/超限/斷線這條
  回饋鏈)。裝置現不在手邊,議題遂定為「下次拿到裝置前該備好什麼」。
  **三方初始提案全部落選**,交叉詰問後收斂到沒人一開始提出的東西:**offset 用「帶符號摺疊」
  儲存才是根因**。會議期間三方各自獨立發現同一個**已隨 v1.0.1 出貨**的缺陷:翻轉 invert
  開關不重算 offset,校準姿勢讀值變 `-2×raw`;最壞情況在 `segment_extension`——患者往前
  抬腿被記成後伸達標、蜂鳴器響、reps 寫進 DB。裁決:offset 改存 `zeroRaw` 重新參數化
  (數學等價,全圓差 5.7e-14;由建構消滅整類缺陷,並讓「站直必須讀 0」第一次寫得成測試)
  → session 中凍結校準(實測證明沒它 migration 6 不健全)→ migration 6 單一 JSON 欄位
  → 縮小版零位檢查。**否決** raw 角度欄位(三方實跑證明可逆,+54MB/百場買零資訊)
  與元件測試基建(兩個真實缺陷都在純函式層可捕捉)
- **2026-08-14 offset 重新參數化為 zeroRaw**([[log_20260814_offset_zeroraw_reparam|日誌]]):
  落地 08-12 會議裁決第 1 項——校準四軸 offset 的「符號摺疊」表示法(`offset = -(zeroRaw×sign)`)
  改存 `zeroRaw`,判定改為 `(raw − zeroRaw) × sign`。此舉消滅已隨 v1.0.1 出貨的缺陷:進階手動
  校準翻轉 invert 開關時 offset 不重算,校準姿勢殘差變成 `2×offset`,`segment_extension` 下
  會把方向做錯的療程記錄成達標。`buildCalibrationPatch`/`buildQuickZeroPatch` 寫入端同步簡化
  (快速歸零不再需要讀 invert);persist v3→v4,`migrateSettings` 補上舊格式換算;新增掃過
  全部 64 種 axisSwap/invert 組合、含跨 ±180 切點案例的由建構不變式測試。**144 → 147 tests**,
  `npm run ci` 全綠。下一項(依會議裁決順序):session 中凍結校準
- **2026-08-20 Gemini UI 設計交接資料**([[log_20260820_gemini_ui_handoff|日誌]]):
  純文件整理,未動程式碼。啟動 dev build 截圖四個主畫面(Dashboard/Actions/History/
  Settings)+ 新增動作 Modal 共 5 張,整理 Apple Liquid Glass 色彩 token/版面說明,
  寫成 `doc/gemini-handoff-20260820/README.md` 交給使用者帶去網頁版 Gemini 3.1 Pro
  (人工操作,不接 API)做設計發想,並明列建議提交檔案(截圖 + global.css,不含 .tsx)
- **2026-08-20 Gemini 稽核意見分診**([[log_20260820_gemini_audit_triage_and_fixes|日誌]]):
  Gemini 回饋 4 項 UI 建議,逐項對照 CSS 數值/截圖/既有會議決議後只採 2 項——新增
  `.btn-danger-ghost` 把「刪除/中斷連線/結束 Session」降級為外框紅字(實心 `--danger`
  只留給真正 alarmActive 與 ConfirmDialog 不可逆確認),過程中順帶抓到 `button.btn`
  蓋掉 `.btn-secondary` 文字色的既有 specificity 陷阱;新增 `input::placeholder` 對比度
  修正。**否決**警示 banner 改實心(牴觸 08-01 會議「非阻斷警告不做視覺化緊急」決議)、
  empty-state 置中與 line-height(現狀已符合,非真問題)。Z 軸深度分層判定為牴觸「統一
  Liquid Glass 材質」設計決議的大改,留給使用者裁決。147 tests 全綠
- **2026-08-21 HIG 規格核對**([[log_20260821_hig_audit_bar_font_blur_fixes|日誌]]):
  對照 Apple 官方 HIG 逐項核對「不像 Apple」的直覺。顏色/飽和度/圓角早就對得上
  慣例,不是問題。真實落差:①字型——查證本機沒裝 SF Pro(授權字型不能合法塞進
  Windows build),font-stack 實際落點是 Segoe UI/JhengHei,裝
  `@fontsource-variable/inter` 自架替身解決;②`--glass-blur` 20px→30px 對齊
  Apple 材質模糊量級;③`html` 根字級 106.25%(17/16)對齊 body text 慣例;
  ④`TopHeader`/`BottomBar` 圓角改 999px 做成 iOS 26 規格的膠囊導覽列(內部
  LiquidKnob 指示塊本來就已經是膠囊,外框原本沒跟上)。147 tests 全綠,截圖驗證
  四項改動同時可見。使用者接著提「3. 特效追加」,澄清後為「收斂現有裝飾效果」:
  玻璃扭曲濾鏡 `feDisplacementMap scale` 18→5、LiquidKnob 液態黏滯濾鏡模糊 4→2、
  拉伸回彈峰值 1.22→1.08、背景 blob 不透明度淺色 0.35→0.22/深色 0.3→0.18,機制
  保留只調輕強度。147 tests 持續全綠,截圖確認背景收斂明顯
- **2026-08-22 Session 中凍結校準 + 校準快照**([[log_20260822_calibration_freeze_and_snapshot|日誌]]):
  落地 08-12 會議裁決第 2、3 項——**先凍結,再快照**。`sensor_data` 只存校準後的數值,產生
  它們的仿射轉換卻活在 localStorage 會被下次校準就地覆蓋:錄 20 場、第 21 場才發現
  `shinInvert` 反了,前 20 場就永久無法解讀。凍結是快照的前提而非潔癖——`sessions.calibration`
  是「一場一個」,允許中途改校準時 08-12 實測最壞可差 **57°**。`CALIBRATION_KEYS` 定義哪些
  設定參與 `(raw − zeroRaw) × sign`,`setSettings` 在 session 進行中丟棄它們**並留下日誌**
  (不靜默失敗),真正的防線在 UI:精靈入口/快速歸零/進階手動欄位全部停用並顯示原因。
  migration 6 加 `sessions.calibration TEXT`,**單一 JSON 欄位**而非攤平(校準欄位仍在演進,
  攤平等於每改一次欄位開一個 migration),舊列留 NULL 不回填。**存了沒人讀就不改變任何決定**,
  所以 History 分析 modal 比對漂移並警示、CSV 帶出快照;漂移刻意只比會改變算式的欄位——
  含 `lastCalibratedAt`/`*Verified` 會讓「重跑精靈得到相同數值」每次誤報,狼來了的警告
  等於沒有警告(附迴歸測試)。`CALIBRATION_KEYS` 與 `CalibrationSnapshot` 由編譯期斷言鎖成
  等價,漏一個欄位是 build error 而非安靜漏掉的快照。**147 → 163 tests**,`npm run ci` 全綠。
  對應 issue #4(已關閉)。⚠ 尚未實機驗證
- **📡 硬體工作已移至 GitHub issues**:[#2](https://github.com/yuhina0515/IRMS/issues/2)
  桌上 ±180° 旋轉記錄、[#3](https://github.com/yuhina0515/IRMS/issues/3) 實機 E2E。
  [#4](https://github.com/yuhina0515/IRMS/issues/4) 校準快照 migration 已於 2026-08-22 完成關閉。
  **慣例:需要實機的工作一律開 issue,不寫進 ROADMAP**
- **韌體 v3**(模組化 + 斷線即靜音,[[log_20260704_firmware_v3_rewrite|日誌]])→ **已於 2026-08-07 燒錄**,
  BLE 實機連線與校準精靈都在真裝置上跑過(2026-08-12 更正)。`esp32:esp32 3.3.11` 下
  `arduino-cli compile` 實測通過。issue #2 剩下的只有**旋轉記錄的擷取**
- 3D 即時姿態視圖([[log_20260704_3d_posture_view|日誌]]);BLE 實機連線已驗證 OK
- 📡 待實機:達標音 / 超限警報 + 靜音鈕 / `ERR:1` 斷線收尾 / 斷線重連後警報重新武裝 /
  校準凍結的 UI 停用態(見 issue #3)

## 🗂 變更日誌

![[coding-logs.base]]

## ✍ 新增日誌

用指令面板 `Insert template` → 選 `coding-log`(模板在 `doc/templates/`),
檔名格式:`log_YYYYMMDD_主題.md`,放入 `doc/coding log/`。

## 📆 每日筆記

點左側日曆圖示或指令面板 `Open today's daily note`,
會自動以 `doc/templates/daily-note` 模板在 `doc/daily/` 建立當日筆記。
