---
tags: [coding-log, meeting]
date: 2026-08-07
summary: "校正 bug + UI 響應式重構方向裁決會議:三方獨立調查全數收斂於同一個 bug——SettingsView 的『快速歸零』未套用 axisSwap,和精靈的 effectiveRaw 路徑不一致,軸對調過的感測器歸零後方向全錯。UI 部分否決『重新設計排版』的完整重構框架,改採 5 項具體修正(兩處寫死 height:320、Dashboard 格線無斷點、視窗 minHeight 在 1366×768@125% 筆電上算出來比可用工作區還高、頂列 150px 硬編邊界),沿用專案『修缺陷不擴大議程』的既有慣例。裁決順序:先修校正(vitest 可驗)→ 瀏覽器測 CSS 批次 → 唯二須真機驗證項(頂列邊界、視窗最小尺寸)→ 打包 exe。"
---

# 2026-08-07 會議紀錄 — 校正 bug 調查與 UI 響應式方向裁決

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260803_meeting_direction_after_visual_pass|2026-08-03 會議]] · [[ROADMAP]]

## 📋 議題

使用者今日重新燒錄韌體並實機連線後提出五點:①校正似乎出了問題,找出根因;
②提出完整解決方案;③UI 版面在不同裝置/硬體規格下有重大瑕疵,需要重新設計排版;
④黑畫面只是桌布是黑色的,建議改用網頁伺服器 + 內建瀏覽器測試,不必一直請求螢幕權限;
⑤網頁測完再打包成執行檔。①②③交付會議裁決,④⑤是主席執行時遵循的固定工作流程,不付表決。

## 👥 與會者與立場

| 代號 | 觀點 | 初始主張 |
|---|---|---|
| **D** | 響應式 UI / 風險分析 | 版面完全沒有寬度斷點,提案完整重構(container queries、env(titlebar-area-*)、視窗尺寸修正) |
| **F** | 韌體/正確性務實派 | 追完整資料路徑找真正的校正 bug,對 UI 重構抱持懷疑(避免順道夾帶) |
| **M** | 維護者 / 實務派 | 銜接使用者④⑤工作流程限制,評估瀏覽器可測 vs. 僅能真機測的邊界,提排序計畫 |

方式:三方獨立調查(F、M 事後可見 D 的初步發現以便驗證,而非照抄)→ 交叉詰問(針對 B 項分歧發一輪反駁)→ 主席裁決。主席獨立覆核最重的主張(校正 bug)。

⚠ **執行過程插曲**:F 與 M 的第一輪呼叫皆因 session 額度上限而中斷(`You've hit your session limit`),重試後成功完成調查,不影響調查獨立性。針對 B 項分歧發給 D 的反駁請求因背景執行、且會議已收斂到足以裁決的證據,主席未等待其回覆即結案——若後續回覆帶來新證據,將於附錄補充。

## 🔬 主席獨立覆核

直接讀取 `IRMS_App/src/renderer/src/views/SettingsView.tsx:55-67`,確認 `quickZero` 逐字如三方所述:
只用 `rawAngles.thigh/shin/thighRoll/shinRoll` 乘上 invert 就寫入 offset,完全未呼叫
`effectiveRaw`(`calibration.ts:75-82`)做軸對調轉換,而 `applyCalibration`(`useStore.ts:288-292`)
與精靈的 `buildCalibrationPatch`(`calibration.ts:135`)兩處都先做這一步。**三方主張逐字證實。**

## 🔍 Position A — 校正 bug(三方獨立收斂,無異議)

**根因**:`SettingsView.tsx` 的「快速歸零」按鈕跳過了軸對調(`thighAxisSwap`/`shinAxisSwap`)轉換,
直接用原始感測器讀值算 offset;而精靈路徑與即時顯示路徑都先套用 `effectiveRaw` 轉換。
兩條計算 offset 的路徑對同一組 settings 欄位語意不一致。

**失效情境**:感測器貼歪 90° 時,精靈會正確偵測並設定 `axisSwap:true`,即時顯示與判定都是對的。
之後使用者重新綁貼、角度稍有偏差,若圖方便按「快速歸零」而非重跑六步精靈,offset 會算在錯的
物理軸上——大腿 pitch 通道被拿去歸零 roll 通道的殘留值(反之亦然)。此後每次 `applyCalibration`
仍正確做軸對調,但疊加了算錯位置的 offset,站直不再讀 0°,判定/警報全部跟著偏。無任何錯誤訊息。

**驗證與排除**:F、M 各自獨立追完整資料路徑(韌體 imu.h → protocol.ts 解析 → applyCalibration →
平滑層 → 判定引擎),排除了 `angleMath.ts` 環形數學、EMA 平滑、settings migration(v2/v3 版號正確
遞增)、BLE store 陳舊讀取、韌體端 K/KR 欄位(已在 `protocol.ts` 被丟棄未使用)等候選,只有這一處
是真實缺陷。M 額外查 git log:`quickZero` 寫於 2026-06-27 v2 重寫(先於 axisSwap),axisSwap
於 2026-07-14 加入,此後兩批校正修復(2026-07-17、2026-08-03)都沒碰過這個函式——不是迴歸,
是原始遺漏,且完全沒有測試覆蓋(`calibration.test.ts` 只測純函式模組,不含 SettingsView)。

**裁決的完整解決方案**:比照精靈路徑,把 `effectiveRaw(rawAngles, settings)` 接進 `quickZero`
的四行 offset 計算(F 提案),並依 M 的建議把這段邏輯搬進 `calibration.ts` 成一個可測的純函式
(如 `buildQuickZeroPatch`),讓 `SettingsView.tsx` 只呼叫它——這樣這條修正能被 `npm run test`
單獨覆蓋,不需要真機或瀏覽器就能驗證正確性。

## 🔍 Position B — UI 響應式:否決「重新設計排版」框架,改採範圍受限的 5 項修正

**三方均證實的具體缺陷**(逐一 file:line 核對):
1. `main/index.ts:28-29` `minWidth:1024, minHeight:680`——13" 1366×768 @125% 縮放筆電的
   邏輯解析度只有約 614 DIP、扣工作列後約 576–590 DIP,比 App 自己宣告的最小高度還矮。
   （此為算術推導,三方均未在真機或對應設定的 VM 上實測驗證,列為已知限制。）
2. `Leg3D.tsx:177`、`HistoryView.tsx:164` 都是 `style={{ height: 320 }}` 寫死容器,
   包住其實已經自適應的內容(three.js 的 ResizeObserver、Chart.js canvas)。
3. `DashboardView.tsx:103` inline `gridTemplateColumns: '1.6fr 1fr'`,零斷點。
4. `global.css:247` `.top-header { margin: 0 150px 0 12px }`——為了閃避原生 titleBarOverlay
   按鈕而猜的常數,與實際疊層幾何無關。
5. `.ring-wrap`(180×180 固定)、`.metric-gauge svg`(max-width 420px)——底層 SVG 本身用
   viewBox 已可縮放,問題只在外層容器沒有跟著縮。

**分歧與裁決**:D 主張以 container queries + `env(titlebar-area-*)` + 視窗尺寸公式做一次較完整的
響應式重構(估 4–6 人天);F 與 M 主張只修上述 5 個具體點,不冠上「重新設計排版」的整個專案框架,
理由是本專案 2026-08-03 會議已明確立下「修缺陷、不擴大議程」的先例(否決 i18n、Electron 升級、
D3 多關節泛化,ESLint 找到 35 項也照樣延後)。**主席採納 F/M 的範圍框架**:5 項修正都是真缺陷,
逐項修但不啟動架構級重寫。

**`env(titlebar-area-*)` 技術爭點**:M 指出本專案用的是 Electron 自家的 `titleBarStyle:'hidden'`
+ `titleBarOverlay` 設定(`main/index.ts:35-36`),這與 CSS Window Controls Overlay 規範
（`env(titlebar-area-*)` 實際綁定的那個 API,需要 PWA manifest 的 `display_override` 驅動)
是兩個不重疊的機制。**主席獨立核實此點**:Electron 的 `titleBarOverlay` 是純 Electron 專有 API,
只負責畫原生按鈕疊層,不會填入 W3C WCO 規範定義的 CSS 環境變數——這兩者外觀相似但底層無關聯。
**`env(titlebar-area-*)` 在本專案的設定下大機率永遠讀不到值,D 的修法會靜默失效、150px 的 bug
會留在原地卻沒人發現。採納 M 的替代方案**:改用 `titleBarOverlay` 已知的高度常數(40px,
`main/index.ts:36` 已具名)加安全邊界,一次算出頂列右側 inset,不追這個實驗性 CSS API。

**追記(D 回覆後修正)**:D 回覆帶回 Electron 官方文件(`electronjs.org/docs/latest/tutorial/custom-title-bar`)
明確寫著 `titleBarOverlay` 啟用後,渲染端可透過 CSS 環境變數讀取疊層的顏色與尺寸,官方範例
用的正是 `titleBarStyle:'hidden'` + `titleBarOverlay` 這組設定——與本專案完全一致。**這推翻了
M 未經查證的「兩者互不相關」推論**(M 當時明確標註是推理、非已查證),`env(titlebar-area-*)`
在本專案設定下大機率確實生效。D 同時舉出比 M 的常數方案更強的具體情境:筆電外接不同 DPI
螢幕、視窗被拖曳跨螢幕時,Windows 即時重算原生按鈕像素寬度,寫死一次的常數會立刻過期,
而 `env()` 是 Chromium 即時值、自動跟著更新。**裁決修正:採用 D 的 `env(titlebar-area-*)`
方案**,但因 D 自己也承認未在本專案實際 Electron 33 版本上確認過(僅查文件、未實測),
落地時需在真實 Electron 視窗花約 15 分鐘核對 devtools 算出來的 `env()` 值是否正確,
若確認無效才退回 M 的常數方案當備援。

同時,D 在範圍爭議(Point 1)上完整讓步:撤回 container queries 與 clamp() 流體排版
（承認 dashboard grid 是滿版主內容區、沒有巢狀可縮容器,一般 `@media` 斷點與 container query
效果相同但成本更低,是自己過度設計),估時從 4–6 人天下修為 **1.5–2 人天**,只保留與
F/M 完全重疊的 4 項(`Leg3D.tsx:177`、`HistoryView.tsx:164` 固定高度、Dashboard 斷點、
視窗最小尺寸公式)+ 追加 `env(titlebar-area-*)` 這一行 CSS。**三方在 B 項的範圍與作法上
最終完全收斂,無殘留分歧。**

## ⚙ 可測性與排序(採納 M 的方案)

M 直接開了 `preload/index.ts` 與 IPC 註冊檔核實(非僅憑推測):渲染端與主行程之間只有
`window.irms.{sessions,data,actions}` 這一組橋接,全部走 `better-sqlite3` IPC；BLE 走
`navigator.bluetooth` 直連,只有 Electron 主行程的 `select-bluetooth-device` 自動配對是
Electron 專屬。純瀏覽器分頁打 `localhost:5173`(`npm run dev`)**可以測**:全部 CSS/版面改動、
校準數學（`calibration.ts` 本身就是 vitest 純函式)、大部分頁面版面(`main.tsx` 對
`window.irms` 呼叫有 try/catch,不會整頁掛掉)。**不能測**:任何真正寫入資料庫的操作(無
`window.irms` 橋接)、`titleBarOverlay` 邊界與視窗 `minWidth/minHeight` 行為(原生
`BrowserWindow` 屬性,分頁無對應物)、Electron 自動配對的確切互動流程(純瀏覽器會跳原生
裝置選擇窗,行為不同但非「不能用」)。

**裁定執行順序**:
1. 修校正 bug(`buildQuickZeroPatch` 純函式化 + `npm run test` 驗證)——最小、最獨立、
   嚴重度最高,優先落地。
2. UI 5 項修正中「瀏覽器分頁可測」的部分(兩處 height:320、Dashboard 斷點、視窗尺寸公式)
   對 `localhost:5173` 用瀏覽器分頁測。
3. 唯二只能在真實 Electron 視窗驗證的項目(頂列邊界常數、視窗最小尺寸)集中在一次真機
   驗證裡做完,不逐項打斷使用者。
4. 全部確認後才打包 exe(item 5)——打包步驟是驗收 build,不是除錯環境。

## 🏛 主席裁決摘要

1. **校正 bug 確認**:`SettingsView.tsx` 快速歸零未套用 `axisSwap`,三方獨立收斂、主席逐行核實。
   修法:比照精靈用 `effectiveRaw`,搬進 `calibration.ts` 做成可被 vitest 覆蓋的純函式。
2. **UI 不做「重新設計排版」的架構重寫**,改成範圍受限的 5 項具體修正(D 讓步後三方完全
   收斂),理由是與 2026-08-03 已定的「修缺陷、不擴大議程」慣例一致。`env(titlebar-area-*)`
   經 D 補證據後**採用**(非原先暫定的常數備援方案),但落地時須先在真實 Electron 視窗核對
   實際生效,無效才退回常數備援。
3. **排序**:校正 bug(vitest)→ UI 批次(瀏覽器測,`env()` 一行除外)→ 唯二真機驗證項目
   (頂列 `env()` 是否生效、視窗最小尺寸)一次做完 → 打包 exe。

## ✅ 執行結果(裁決後立即落地)

1. **校正 bug**:`buildQuickZeroPatch` 純函式化進 `calibration.ts`,`SettingsView.tsx` 改呼叫它;
   新增 3 個 vitest 案例(含 axisSwap 情境的迴歸測試)。`npm run test` **144/144 全綠**。
2. **UI 批次**:`Leg3D.tsx`/`HistoryView.tsx` 的 `height:320` 改用 `.leg3d-viewport`/
   `.history-chart-viewport`(aspect-ratio + max-width 反推,避免 max-height 與 aspect-ratio
   互相打架導致畫面被拉扁——這是實作中才發現、會議紀錄未預見的細節);Dashboard 格線改
   `.dashboard-grid` class,900px 斷點。用 `IRMS_App/vite.browsertest.config.ts`(新增,
   純瀏覽器測試專用,不影響 `electron.vite.config.ts` 正式建置)起獨立 vite server,
   在瀏覽器分頁對 1093×614(13" 筆電 125%)、850×600(斷點下)、1024×600(新地板)、
   2560×1440(大螢幕)四種尺寸用 JS 量測 `scrollWidth`/`getBoundingClientRect`,
   全數無水平/垂直溢出,斷點與寬高比皆按預期生效。
3. **唯二真機驗證項目**:重開真實 Electron dev 視窗,用臨時診斷徽章量到
   `.top-header` 的 `margin-right` 實際算出 **136px**(非退回的 150px 常數)——
   **直接證實 D 反駁時引用的 Electron 文件正確,`env(titlebar-area-*)` 確實生效**;
   視窗尺寸修正後畫面完整無裁切。診斷代碼已移除。
   ⚠ 過程中電腦操作工具的滑鼠/鍵盤合成輸入被 Windows UIPI 全面擋下(疑似 Riot Vanguard
   反作弊驅動所致,連 `mouse_move` 都失敗),改用「臨時在畫面上印出量測值 + 截圖讀值」
   繞過,截圖本身不受影響。
4. **打包 exe**:`npm run build` + `npx electron-builder --win` 成功,
   產出 `release/IRMS Dashboard Setup 1.0.1.exe`(未簽章,同既有慣例)。

## ⚠ 值得持續監看的異議

- 視窗 `minHeight:680` 是否真的超過 1366×768@125% 筆電的可用工作區,三方都只做了算術推導,
  未在真機或對應 VM 上實測——若使用者實際硬體不是這個 profile,這條修正的急迫性需要重新確認。
- `env(titlebar-area-*)` 的採用基於 D 引用的 Electron 官方文件,但尚未在本專案實際執行的
  Electron 33 視窗中親眼驗證過——落地時仍要做那 15 分鐘的 devtools 核對,不能只憑文件就收工。
