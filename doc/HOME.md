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
- **2026-08-22 MTU 截斷診斷 + 韌體序列遙測**([[log_20260822_firmware_mtu_diagnostics_and_serial_telemetry|日誌]]):
  issue #2 桌面可做的部分(不需要患者、只需要桌上兩塊板子)。App 端 `parseAnglePacket`
  原打算「偵測到截斷就整包丟棄」,讀 `computeMetricSample` 才發現判定只讀 Pitch 不讀 Roll,
  而 `T:`/`S:` 在 MTU-23 → 20 bytes 的切點下必定存活——整包丟棄會把臨床正確的 Pitch 資料流
  變成空白,矯枉過正。改為逐軸降級:T/S 缺席才 malformed,Roll 被切掉則丟該欄並升起
  `truncated`,新增的 `hasRoll`/`truncated` 讓校準精靈外展步驟與 Settings 快速歸零從靜默
  Roll=0 改為可見示警。韌體端補上 `onMtuChanged` 印出實際協商到的 MTU(`setMTU()` 只是請求,
  原本完全不回報結果,故障只能靠症狀反推成因);並把封包組裝與 BLE notify 解耦,新增預設
  開啟的 Serial 遙測——此前 60 秒旋轉記錄必須先有 App 連線才拿得到資料,而 App 連線正是
  這份記錄要驗證的對象,邏輯上循環。**163 → 173 tests**,`npm run ci` 全綠;韌體以
  `arduino-cli compile --fqbn esp32:esp32:esp32` 改動前後各驗證一次,皆 exit 0、85% flash。
  issue #2 唯一剩下的是實機旋轉記錄本身。⚠ 韌體改動尚未燒錄實測
- **2026-08-27 ingest 注入接縫 + 模擬器 + 示範模式**([[log_20260827_ingest_seam_simulator_demo_mode|日誌]]):
  落地 2026-08-03 裁定卻一直 `⏳ 未動工` 的單一 `ingest(text)` 管線(全 repo grep 零命中),
  並在其上建立**無硬體演練基建**。① vitest 改雙 project——舊設定的
  `include: ['src/**/*.test.ts']` **不匹配 `.tsx`**,元件測試會被靜默忽略而非失敗,
  正是 08-07 快速歸零缺陷死掉的缺口;現以副檔名分流,先寫一個故意失敗的探針確認 `.tsx`
  真的會跑。② 模擬來源全純函式,封包編碼器逐位元對齊韌體 snprintf(**含 `K:`/`KR:` 兩個
  被解析器忽略的欄位——長度決定 MTU 截斷切點**),往返測試為閘門。③ 示範模式**出貨版**:
  migration 7 的 `sessions.source` 帶 CHECK、**刻意不採 NULL=舊行為慣例**(可為 NULL 的
  失效模式恰好是「靜默呈現為真實資料」)、型別層必填讓 TS 拒編任何沒做決定的路徑、
  進行中不可切換、四個讀取面標記、示範列不隱藏但可一鍵清除。
  **首次為 CMD: 回饋鏈建立指令稽核,當場抓到兩個既有缺陷**:達標 LED 從第一下卡亮到
  Session 結束(第 2..N 下患者無區間回饋,store 與 GPIO 分歧)、`attemptReconnect` 繞過
  `connect()` 導致 `linkTruncated` 永久卡 true。自我審查發現**原本的 T5 並未測到它宣稱的
  東西**(拿掉重連重設仍全綠),補上真正該鎖的情境:重連時憑斷線前的保持計時憑空計出一下。
  **校準精靈自此可在桌前跑完**(08-03 記為「永遠看不到」)。**173 → 246 tests / 21 files**,
  `npm run ci` 全綠;打包後以隔離 `--user-data-dir` 實際啟動,七個 migration 在真正的
  better-sqlite3 上全部套用成功,使用者真實 DB 的 md5 前後相同。
  ⚠ UI 未經目視驗收(本次環境無法截圖);實機仍未驗證,issue #3 完全未動
- **2026-08-27 Stage 2:P2 使用者體驗清單清空**([[log_20260827_stage2_ux_backlog|日誌]]):
  ①**重連進度**——不只是新功能,同時修掉一個從未被發現的缺陷:
  「Reconnecting (n/5)」寫進 `statusText`,但下一行 `connectGATT()` 的 `'Connecting...'`
  在同一次嘗試內就蓋掉它,**那個計數器自 2026-06-27 起從來沒有被看見過**。
  改用結構化 store 欄位 + 確定性軌道(不是 spinner——使用者要判斷的是「還會不會好」,
  那取決於還剩幾次)。此路徑此前要拔電池才重現得了,測試以注入假裝置驅動私有重連迴圈。
  ②**內外翻曲線**走獨立右側軸:帶符號、量級只有矢狀面的十分之一,共用刻度會被壓成
  貼底直線——看起來像「沒有變化」,而那正是它最需要被看見的時候。新增 `Settings` 欄位
  一併 bump persist version 4→5(`migrate` 只在版本落後時才跑,不 bump 則淺層 merge
  會讓新欄位變 undefined、開關永遠打不開且無錯誤)。③**動作查詢**抽成純函式,
  並把「此協定尚無動作」與「搜尋不到」拆成兩種出口。④**快捷鍵**Ctrl+K / Ctrl+Enter,
  走與按鈕完全相同的守衛,不可用時不掛 listener。自我審查發現
  **`contenteditable` 守衛在 jsdom 下形同虛設**(jsdom 未實作 `isContentEditable`),
  若當初把測試寫成通過就會得到一個假信心的綠燈;改為同時查最近的 contenteditable 祖先。
  **253 → 281 tests / 25 files**,`npm run ci` 全綠;打包後隔離啟動乾淨無錯誤。
  ⚠ UI 仍未目視驗收;內外翻右側軸範圍 ±20° 未經真實資料驗證
- **2026-08-27 Stage 1/2 UI 目視驗收**([[log_20260827_visual_verification|日誌]]):
  前兩份日誌都留下「UI 未經目視驗收」——這次補上。現場搭一支拋棄式 Playwright 驅動腳本
  (裝在 `--no-save`,用完解除安裝,腳本本身也刪除,從未進版控),對打包後的 app
  跑完整條示範模式路徑並逐張截圖比對:冷開機量表 `--`、Demo 確認對話框、內外翻切換、
  即時量表隨情境反應(進區變綠/教練提示)、Actions 搜尋空狀態、**真的按下 Start/End
  Session**、History 的「示範資料」徽章、分析 modal 常駐橫幅、以及攔截
  `HTMLAnchorElement.click()` 讀到的實際 CSV 檔名 `irms_DEMO_session_1.csv`——
  示範模式四個讀取面標記首次拿到實機證據而非僅靠元件測試推論。過程中第一版腳本自己的
  兩個錯(誤猜底部導覽用中文標籤、未 guard 的 null setter)先被誤以為是 app 問題,
  看截圖才確認是腳本錯,記錄下來當作「先看證據再下判斷」的例子。
  ⚠ 重連進度軌道與校準精靈逐步畫面仍未展開驗收(前者需要真實斷線事件)
- **2026-08-29 Demo Mode 驅動的 issue #3 App 端驗證**([[log_20260829_demo_mode_e2e_verification|日誌]]):
  使用者臨時離場,改用 2026-08-27 建的無硬體演練基建(Playwright 連上封裝後 app 的 CDP
  埠驅動,唯讀查真實 DB 客觀驗證)測完達標(reps=10)、超限警報+靜音+30秒重新武裝、
  ERR:1 遮罩+逃生按鈕、強制關閉 App 後 abandoned+repsCompleted 正確持久化(4/6 項)。
  過程中排除三個坑:①真實校準套在模擬資料上導致判定通道跑錯軸(測試前提沒滿足,非
  bug);②發現並修正一個真實文件落差——`REFERENCE_ACTION` 從未被 Demo 面板實際套用,
  用預設 Squat 動作(hold 3000ms > 情境保持窗 2500ms)測 rep-cycle 會讓 reps 永遠卡 0;
  ③確認斷線重連無法用模擬器測(`endSimulated()` 繞過 `attemptReconnect()`),如實記錄
  留給真裝置。收尾完整還原真實校準(含一次「還原被同session其他操作蓋回」的踩坑重做)、
  清除示範紀錄與測試動作
- **2026-08-29 會議:校準精靈能否自動化**([[log_20260829_meeting_auto_calibration_feasibility|會議紀錄]]):
  評估「配戴側+固定安裝幾何可否自動推導取代手動校準」。支持方在交叉詰問中完全讓步——
  本專案自己的歷史(08-14 offset 加倍、08-28 wearSide/roll 沿用舊值)證明同一類「固定
  幾何推理」已在正式環境悄悄出錯,都是靠人在場看即時數字才抓到。**裁決:否決全自動校正**,
  改採「幾何算預期值當比對信號,即時擷取+人工預覽確認仍是唯一寫入依據」;最直接可落地的
  改進是把步驟 5 略過時的預設值從「沿用上次設定」升級為「用配戴側算出的幾何預期值」。
  幾何推導本身尚未拿真實裝置驗證過,列為後續待辦
- **2026-08-28 RDP titleBarOverlay 卡死 hotfix(v1.0.4)**([[log_20260828_rdp_titlebar_overlay_hotfix|日誌]]):
  v1.0.3 發布後使用者立刻回報「跟剛剛一樣,完全沒有畫面」——原以為單例鎖沒修好,
  追下去才發現是**兩個獨立缺陷疊在同一個症狀上**。埋診斷 log(`ready-to-show`/
  `did-finish-load` 等事件)才精準定位:renderer 頁面確實載入完成,但
  `ready-to-show` 永遠不觸發——2026-07-14 做的無邊框視窗
  `titleBarStyle:'hidden'`+`titleBarOverlay` 依賴 DWM 合成,在使用者這個 RDP
  session 裡合成該疊層時直接卡死。拿掉這兩個選項後 `ready-to-show` 立刻觸發。
  修法:偵測 `SESSIONNAME` 是否為 RDP,是則退回一般視窗框(犧牲滿版標題列外觀
  換取打得開),本機主控台使用者外觀不變。連續 6 輪「開啟→關閉→再開啟」壓力
  測試全部成功(修復前的程式碼持續失敗)。過程中也排除了「RDP 斷線干擾」
  (`query session` 一度顯示 Disc,確認 Active 後問題依舊)與「GPU 加速」
  (v1.0.3 加的 `disableHardwareAcceleration()` 單獨測試沒解決問題,但保留作
  次要防線)兩個曾經以為是根因的假說
- **2026-08-28 單例鎖 hotfix(v1.0.3)**([[log_20260828_single_instance_lock_hotfix|日誌]]):
  v1.0.2 發布幾分鐘後使用者回報關閉視窗後打不開、重複點擊在工作管理員疊出多個背景
  process。根因:主進程從未實作 `requestSingleInstanceLock`,每次啟動都是全新 process
  搶同一個 `irms.sqlite`(WAL),`initDatabase()` 撞鎖拋出的例外原本沒有 `.catch()` 接住,
  視窗開不出來、process 卻賴著不退出。補上單例鎖 + `second-instance` 聚焦既有視窗 +
  `whenReady` 鏈的錯誤對話框。隔離 `--user-data-dir` 啟動兩次驗證 process 數維持 4 個
  不再疊加。**dev 模式從未踩到這個坑**(一次只會有一個 electron-vite 進程),打包後測試
  也從未涵蓋「開了又關、再開一次」——發布 v1.0.3 頂替
- **2026-08-28 v1.0.2 發布**([[log_20260828_v1.0.2_release|日誌]]):`feat/no-hardware-exercise-infra`
  (領先本機 main 11 commit,含整個 08-27 批次)fast-forward 併入 main,本機 main 原本又
  領先 origin 4 commit(08-22 校準凍結快照 + MTU 診斷)自 v1.0.1 起從未推送。連同今日的
  韌體/校準修復一次推送、打包、發布。**144 → 284 tests**,`gh release create v1.0.2`
  發布,涵蓋 v1.0.1 以來累積的所有工作,release notes 特別點名兩個 v1.0.1 就在出貨的
  缺陷(幻影 reps、invert 翻轉雙倍偏差)
- **2026-08-28 校準精靈配戴側 + 確認頁卡頓修復**([[log_20260828_calibration_wearside_and_preview_stutter|日誌]]):
  使用者透過 RDP 拿真人在真裝置上跑校準精靈(對照 v1.0.1)回報兩問題,查證後確認**都不是
  版本落差**(拉 v1.0.1 tag 逐行比對,兩者現行 main 都還在)。①**確認頁卡頓**:元件層級
  訂閱全速 25Hz 的 `rawAngles`,導致整個 Liquid Glass modal 六步都陪著重繪,而實際擷取
  走的是另一條不經 React 的 store 直連路徑——這個訂閱純屬多餘。改成只在步驟 6、以 80ms
  節流訂閱。②**配戴側缺失**:pitch 方向與配戴哪側腿無關,但 roll 的「外側」在左右腿是
  互為鏡像方向——這是唯一換邊配戴會改變正確答案的軸。步驟 5(外展)本可略過(08-01
  會議裁定),略過時「沿用現有 invert」,但精靈完全不知道現有設定是哪一側校出來的,
  無法在換邊時提醒。新增 `wearSide` 設定(persist v5→v6),步驟 1 要求先選側才能開始,
  換邊且略過步驟 5 時顯示強警告。**281 → 284 tests**,`npm run ci` 全綠。使用者另提「流程
  給人重複動作的印象,可藉此重整」的開放式意見,決定留給之後的 `/meeting`(比照過去三次
  校準流程決策慣例),不佔用本次硬體時間窗
- **2026-08-28 韌體燒錄 + 實機旋轉記錄**([[log_20260828_firmware_flash_rotation_capture|日誌]]):
  裝置回到手邊。`arduino-cli compile`+`upload` 把現行韌體燒進真板子(COM7),兩顆 MPU6050
  開機即讀值正常。第一次 65s 擷取因計時與動手時間沒對上、資料其實沒動,誠實記下未使用;
  重擷取拿到 65.5s / 1639 行 / 穩定 25Hz / 零 `ERR:1` 的真實旋轉記錄,Roll 擺動
  193–197°、Pitch 擺動 96–97°,證實 08-22 的逐軸降級修法在實機生效——Roll 全程跟隨動作。
  資料存為 `doc/coding log/rotation_capture_20260828.tsv`。**issue #2 兩項驗收(燒錄、
  旋轉記錄)皆達成,已關閉**;issue #3 因韌體已在裝置上而解除阻塞
- **2026-08-31 外觀風格設定檔系統**([[log_20260831_style_profile_system|日誌]]):
  把 global.css 原本 `:root`(淺色)+ `prefers-color-scheme: dark` 覆寫的雙主題,重構成
  `styles/profiles/` 底下兩個自足的 `StyleProfile`(liquidGlassLight.ts/liquidGlassDark.ts),
  由 `applyStyleProfile.ts` 以 inline custom property 寫上 `<html>`(特異度蓋過 stylesheet,
  固定風格因此可覆蓋 OS 深淺色),`'system'` 則清掉覆寫退回原本規則。新增
  `Settings.styleProfileId`(persist v6→v7)+ SettingsView 的 Appearance 面板;
  `theme.ts` 的 `onSystemThemeChange` 更名/擴充為 `onThemeChange`,額外訂閱手動切換風格
  觸發的 CustomEvent,讓 Leg3D/LiveChart 這類只能靠 `getComputedStyle` 讀 token 的
  canvas 元件也能即時反映。global.css 結構/選擇器未動,只把 token 具體值移出。
  `npm run ci`(typecheck+284 tests+build)全綠;UI 目視驗收留待下次
- **2026-09-01 外觀風格設定檔系統目視驗收**([[log_20260901_style_profile_visual_verification|日誌]]):
  補上 08-31 留下的目視驗收。暫裝拋棄式 Playwright 驅動腳本啟動打包產物,截圖+讀
  `<html>` inline style/computed style 交叉比對三種設定檔:確認選深色時**在 Settings 頁尚未
  切換畫面就已套用**(非靠重新掛載觸發)、切到 Dashboard 後 `Leg3D` 場景背景與卡片材質確實
  跟著變黑、切回「跟隨系統」時 inline 屬性清空並正確退回 `global.css` 的 `:root` 規則(本機
  現行 OS 為淺色,畫面與手動選淺色時一致)。驗收通過,08-31 的程式碼與四份核心文件一併進版控
- **2026-09-01 v1.0.5 發布**([[log_20260901_v1.0.5_release|日誌]]):先做完整發版前驗證
  (CI、打包、隔離 migration、6 輪單例鎖壓力測試、真實 DB 校驗和不變、封裝後 build 上重驗
  外觀風格設定檔),通過後才 bump 版本、push、打 tag、`gh release create` 附安裝檔。這次
  發版把 08-31 的外觀風格設定檔系統(Settings > Appearance)正式交到使用者手上,其餘均
  無功能變動
- **2026-09-01 GlassDropdown stacking context 修復**([[log_20260901_dropdown_stacking_fix|日誌]]):
  使用者截圖回報 Appearance 下拉選單被下方 Demo Mode 卡片蓋住、字疊字。根因是
  `backdrop-filter`(所有 `.glass` 卡片都有)產生新 stacking context,把選單的 z-index
  侷限在自己卡片內,蓋不過下一張卡片——不是 z-index 數字不夠大。改成 `createPortal` 掛到
  `document.body`、量測座標 `position:fixed` 定位,開啟期間監聽 scroll/resize 重新量測。
  隔離啟動 + CDP 截圖驗證選單底部(674px)不再與 Demo Mode 標題(921px)重疊。
  `AI_CODING_RULES.md` §3 補一條永久規則,避免同類 bug 在下一個 popover/tooltip 上重演。
  ⚠ 使用者同時提出「UI 整體像 AI 生成」的更大範圍意見,尚待對照真實參考畫面的獨立視覺審查
- **⚠ 2026-09-01 UI 重建:拆除舊版 Liquid Glass 系統(第一步)**
  ([[log_20260901_ui_teardown_start|日誌]]):使用者裁定推掉整個手刻 Liquid Glass UI 重來。
  舊版存證於 `legacy-ui-liquid-glass` branch + `ui-v1-liquid-glass-archive` tag(指在
  `05abd81`),`main` 上 `main.tsx` 已改成引用新裝的 Tailwind CSS,不再套用
  `global.css`/`styles/profiles/`(檔案還在,故意留著逐頁重建時再清)。**`main` 目前處於
  無樣式的過渡狀態**,`AI_CODING_RULES.md`/`PROJECT_STATUS.md` 描述的 Liquid Glass 材質/
  Appearance 風格設定檔已不符 `main` 現況,新 UI 有內容後才會回頭改寫這些文件。
  `npm run ci` 全綠,CSS bundle 39.87→15.84 kB 證實舊樣式未再打包,截圖確認畫面回到原始
  HTML。**下一步待使用者指定方向**:先重建哪個畫面、參考哪些真實 UI(見
  `E:\Projects\UIReferences\inspiration\`)、色彩/排版語言保留多少
- **2026-09-01 UI 重建 Phase 1+2:方向確認 + 設計 Token**([[log_20260901_ui_redesign_phase1_phase2|日誌]]):
  裝了使用者提供並優化過的 `craft-ui-designer` skill(全域,`~/ClaudeConfigSync/skills/`)。
  Phase 1 用 `AskUserQuestion` 定案:拿掉底部四分頁改單頁內切換(頂部 segmented control
  雛型)、**深色高密度數據控制台**調性、**Bento grid** 卡片、正式不再走 Apple 語系。
  Phase 2 把方向轉成 `tailwind.config.js` 的具體 token(`slate` 中性色 + `cyan` 強調色,
  皆為 Tailwind 官方調色盤真實 hex 值;深色模式用背景色階+邊框做立體感,不靠陰影),
  WCAG 對比度**實際算過**(最差 6.96:1,遠高於 4.5:1 門檻),`npm run build` 通過。
  **Phase 3(版面藍圖)刻意留給下一輪**,等使用者看過這次方向再展開
- **2026-09-01 UI 重建 Phase 3:版面藍圖**([[log_20260901_ui_redesign_phase3_layout|日誌]]):
  新建活文件 `doc/UI_REDESIGN.md`(Phase 4 起持續更新,不是一次性日誌)。外殼:`TopHeader`
  不變 + 新的頂部 segmented control 取代 `BottomBar`。Dashboard/Actions/Settings 走 bento
  排版,**History 刻意不套 bento**(時序列表內容形狀不適合獨立卡片格線)。三組響應式斷點
  已含手機寬度的單欄規格。純規劃產出,無程式碼變更。Phase 4(元件重建)待使用者指定
  重建順序
- **2026-09-01 行動裝置部署技術路線裁決**([[log_20260901_mobile_architecture_decision|日誌]] ·
  [[ROADMAP#D5|ROADMAP D5]]):查證發現 **iOS Safari/WebKit 完全不支援 Web Bluetooth**,
  連 Capacitor/Cordova 這類 WKWebView 包裝殼都受限——不論選哪條路,手機版 BLE 層都得重寫,
  真正的分歧只在 UI 層要不要共用。使用者裁定:**React Native + `react-native-ble-plx`**,
  UI 層與桌面版 Electron+Tailwind 各自獨立(商業邏輯層 `services/` 純函式兩邊共用不受影響)。
  **手機作業排在桌面版 Phase 4 完成之後**才開始(Task #10 佔位追蹤,目前阻塞中)。純決策,
  無程式碼變更
- **2026-09-02 UI 重建 Phase 4(一):基礎元件層 + 新導覽**
  ([[log_20260902_ui_redesign_phase4_foundation_and_nav|日誌]]):`tailwind.css` 新增
  `@layer components`,把舊 `global.css` 的 class 詞彙(panel/glass/btn/field/dialog/
  toast/tabs...)用新深色/bento token 重新定義,多數畫面零改 JSX 就套新外觀;按鈕形狀
  改直角(`rounded-control`),不再是 999px 膠囊。新建 `SegmentedControl`(重用
  `useLiquidKnob` 定位邏輯)取代 `BottomBar`,渲染位置移到 `TopHeader` 下方;
  `BottomBar.tsx`/`NavIcons.tsx` 確認無其他引用後刪除。`npm run ci` 全綠,截圖驗證
  三頁外殼與分段切換正確,並修掉截圖抓到的真實 bug(`BottomBar` 缺
  `position:relative` 導致滑動指示塊跑出容器撐滿螢幕)。Phase 4 剩餘:bento 卡片元件 +
  各頁 grid 排版,下一批繼續
- **2026-08-31 會議:「A面校正功能」可行性評估**([[log_20260831_meeting_face_a_calibration_feasibility|會議紀錄]]):
  評估使用者提出的「裝置離體平放桌面、左右滑動校正方向」新校準構想。**裁決:否決**——
  `IRMS_Sensor/imu.h` 的 `accPitch`/`accRoll` 是 `atan2f` 算出的重力參考傾角,筆記字面描述的
  「平放滑動」是平移,不改變裝置相對重力的姿態,連現行擷取有效性門檻都過不了;即使修正成
  傾斜動作,roll-invert(外展)的「外側」依 README §2.1 需要穿戴者身體中線這個離體裝置沒有的
  參照物,是範疇錯誤而非精度問題。最初主張建造的與會者讀了韌體原始碼後當場完全讓步。不進
  backlog;唯一窄範圍可能性(韌體軸線接線的開發者診斷)建議直接沿用既有 Serial 遙測,不需新 UI
- **📡 硬體工作已移至 GitHub issues**:[#2](https://github.com/yuhina0515/IRMS/issues/2)
  桌上 ±180° 旋轉記錄——**已於 2026-08-28 完成並關閉**。
  [#3](https://github.com/yuhina0515/IRMS/issues/3) 實機 E2E——阻塞已解除,待進行。
  [#4](https://github.com/yuhina0515/IRMS/issues/4) 校準快照 migration 已於 2026-08-22 完成關閉。
  **慣例:需要實機的工作一律開 issue,不寫進 ROADMAP**
- **韌體 v3**(模組化 + 斷線即靜音,[[log_20260704_firmware_v3_rewrite|日誌]])→ **已於 2026-08-07 燒錄**,
  BLE 實機連線與校準精靈都在真裝置上跑過(2026-08-12 更正);**2026-08-28 重新燒錄現行版本
  (含 08-22 的 MTU 診斷 + Serial 遙測)並完成旋轉記錄**。`esp32:esp32 3.3.11` 下
  `arduino-cli compile`+`upload` 實測通過
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
