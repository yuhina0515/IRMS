---
tags: [irms, ui, plan, tauri]
description: IRMS UI 大改版計畫(beta8 Desktop Workstation 之後的下一輪)——範圍、階段、驗證與待裁決事項
date: 2026-09-24
---

# IRMS UI 大改版計畫 (UI Redesign v2 Plan)

> **相關文件**:[[UI_REDESIGN|現行 UI 規格 (beta8)]] · [[AI_CODING_RULES|編碼規範 §1.1 設計權責]] ·
> [[PROJECT_STATUS|開發進度]] · [[OPTIMIZATION|優化待辦]] ·
> [[log_20260924_ui_redesign_plan|本計畫的 coding log]]
>
> **狀態:計畫草案,尚未動工。** 本檔是「怎麼做、按什麼順序做、怎麼證明做對了」的工程計畫;
> **不是**視覺設計規格。依 [[AI_CODING_RULES]] §1.1,配色、字級節奏、動效語言等美術判斷
> 不由撰寫本計畫的 AI 角色決定——計畫中所有需要美術判斷的地方都標成 🎨 **設計輸入槽**,
> 由指定的設計來源填入(見 §7 決策 D-1)。

---

## 1. 為什麼要再改一次

beta8(2026-09-15)解決了「網站 Dashboard 被包進桌面視窗」的**結構**問題(固定命令軌、
情境命令列、只有工作區捲動),但刻意沒有碰**設計語言**本身。2026-09-14 的 Gemini brief
(`doc/gemini-handoff-20260914/01-design-language-redesign.md`)提出的核心問題至今沒有答案:

1. **即時安全語意的層級**:病患邊做動作邊「瞄一眼」螢幕,真正重要的只有目標帶、超限警報、
   次數與裝置/校準可信度。目前 Dashboard 仍是 5 個語意格(gauge/ring/chart/pose/numeric)
   以接近等權的面板呈現,「一切正常,繼續」與「快要觸發警報」在構圖上沒有差別,只有顏色差。
2. **調性**:暗色主題仍叫「Data-Console」、以青色光暈為主,讀起來像維運監控台,不像臨床儀器。
3. **距離可讀性**:病患是站/坐在離螢幕 1–3 公尺外做動作的人,不是坐在桌前操作的人。
   現有規格沒有任何「從多遠要看得懂」的要求。

該 brief 因 Gemini API 額度用盡**從未拿到回覆**,之後 Gemini CLI 訂閱到期,設計權責懸置
(見 PROJECT_STATUS「Gemini 設計權責懸置」)。本計畫的第一個閘門就是解決這件事。

## 2. 現況盤點(2026-09-24,`v1.2.0-beta.10`,皆為可查證的程式事實)

| 項目 | 現況 | 對改版的意義 |
|---|---|---|
| 樣式表 | `src/styles/tailwind.css` 共 1468 行:約 1170 行是 beta8 之前的舊層,最後約 300 行是「Beta 8 layer」以後蓋前的方式覆寫 | 改版前必須先拆層,否則新設計會變成第三層覆寫 |
| 殘留選擇器 | `.sidebar-toggle`、`.app-shell` 在 TSX 中已無引用;`.glass`(22 處)、`.liquid-knob`、`.glass-dropdown` 等 Liquid Glass 世代命名仍在使用 | 命名與實際視覺語言脫鉤,新人/其他代理讀不懂 |
| Token | 色彩走 `--color-*` RGB 三元組 + `tailwind.config.cjs` `withOpacity`,機制健全;但 `--sidebar-*` 另成一套、暗/亮主題 accent 色相不同(cyan vs sky) | 機制可沿用,值與命名需重整 |
| 導覽命名 | 同一個頁面有三套名字:命令軌 `Dashboard/Actions/History/Settings`(英文)、命令列 `即時監測/動作處方/療程紀錄/系統設定`、`App.tsx` ErrorBoundary 用 `即時監測/動作設定/歷史紀錄/設定` | 應收斂為單一標籤表(也是日後 i18n 的前置) |
| Dashboard 標題 | 工作區內 `Guided Monitoring` page-header 與命令列的「01 即時監測」重複 | 浪費最寶貴的首屏垂直空間 |
| Dashboard 版面 | 單一 `.dashboard-grid` + container query 三種 preset;趨勢圖/3D 預設關閉 | preset 機制可保留,但「依狀態」而非只「依尺寸」切換的需求目前沒有 |
| 視窗框 | `tauri.conf.json` `decorations: true`(原生標題列);`TopHeader.tsx` 仍保留 `WindowControls` 分支(僅 `hasCustomTitlebar` 時渲染) | 175% DPI 點擊偏移風險 → 改版**不得**重新引入自訂標題列 |
| 測試耦合 | `*.test.tsx` 全部以 role/文字查詢,**沒有**任何 `querySelector`/`toHaveClass` | 純樣式重構幾乎不會打壞測試;**改文案**才會(需同步更新測試,不是刪測試) |
| 視覺回歸 | 無。09-14 曾臨時用 Playwright + mock `__TAURI_INTERNALS__` 量測版面,用完即刪 | 大改版沒有視覺基準等於盲改,需先固定下來 |

## 3. 前提與不可動的邊界

- **不改的東西**(沿用 [[UI_REDESIGN]]「不變的安全邊界」):BLE 協定、`triggerEngine`/
  `movementMetric` 判定、`sessionController` 指令序列、SQLite schema/migration、校準數學、
  OTA 安全限制、updater 簽章驗證。UI 改版中若發現這些需要改,**另開工作項**,不夾帶。
- **原生 Windows decorations 保留**。
- **示範模式橫幅**永遠可見、不可關閉(`App.tsx` 註解所述理由不變)。
- **驗收時程優先**:使用者已裁定本次驗收焦點是「裝置與應用場景,非美觀」(2026-09-19)。
  改版在獨立分支進行,**驗收結束前不合併進 `main`、不發 beta**,避免驗收用的 build 在
  最後幾天變動外觀與文案。
- **§1.1 設計權責**:本計畫只定義工程步驟、功能性需求與驗證方法;🎨 槽位的內容需由設計來源提供。

## 4. 改版目標(功能性、可驗證——不是美術判斷)

| # | 目標 | 驗證方式 |
|---|---|---|
| G1 | **狀態完整**:Dashboard 對下列每一個狀態都有明確且彼此可區分的呈現:未連線、重連中、未校準、未選動作、協定不支援、待機、進行中、保持中 (holding)、超限警報、警報已靜音、硬體 ERR、示範模式 | 狀態矩陣截圖(§6)逐格審閱 + `DashboardView.test.tsx` 擴充 |
| G2 | **首屏優先序**:1280×720 與 1024×600 下,主指標數值、目標帶、次數、警報、裝置狀態都在首屏且不被捲動 | Playwright 幾何斷言(bounding box 在 viewport 內) |
| G3 | **距離可讀**:主指標數值與警報狀態在約 2 公尺外可辨識(具體最小字級由 🎨 決定,但必須給出數字) | 以 1280×720 截圖量測實際像素高度,對照設計給定值 |
| G4 | **非僅靠顏色**:超限/保持/錯誤除了顏色外至少還有一種非色彩訊號(文字、圖形、構圖變化) | 灰階截圖審閱 |
| G5 | **對比度**:兩個主題所有文字/互動 token 組合符合 WCAG AA(一般文字 4.5:1、大字與 UI 元件 3:1) | 自動化 token 對比度測試(§5 P2) |
| G6 | **命名一致**:四個工作區只有一套標籤來源 | 單元測試比對命令軌/命令列/ErrorBoundary 取自同一常數 |
| G7 | **樣式單層**:改版後不存在「舊層 + 覆寫層」結構,無未引用選擇器 | 未引用選擇器檢查腳本 = 0 |
| G8 | **不退化**:`npm run ci` 全綠,前端測試數不減少 | CI |

## 5. 階段計畫

每個階段一個或數個 commit,各自可獨立審閱與回退;每階段結束跑 `npm run ci`。

### P0 — 決策閘門(動工前,需使用者裁決)

見 §7。最關鍵的是 D-1(誰出設計)與 D-2(合併時程)。P1 不依賴設計輸入,裁決前即可開始。

### P1 — 地基整理(零視覺變化)

目標:讓後面的改版有乾淨的地方落地,且**截圖前後完全相同**。

1. **視覺回歸基礎建設**:把 09-14 的臨時做法正式化——
   - Playwright(devDependency,使用環境預裝 Chromium,不另行下載)+ `__TAURI_INTERNALS__` mock
     + 示範模式模擬器驅動資料,放在 `IRMS_App_Tauri/e2e/visual/`。
   - 截圖矩陣:4 工作區 × 2 主題 × 2 尺寸(1280×720、1024×600)+ Dashboard 狀態矩陣(G1 的 12 個狀態)。
   - 先產出**現況基準截圖**,作為 P1 的零差異證明,也作為設計來源的輸入素材。
   - 不納入 `npm run ci` 的必跑路徑(Windows runner 字型渲染會與 Linux 不同);提供
     `npm run visual` 手動/本機執行,另附版面幾何斷言(不依賴像素)可納入 CI。
2. **拆分樣式表**:`tailwind.css` → `styles/tokens.css`(色彩/字型/動效/間距 token)、
   `styles/shell.css`(命令軌、命令列、工作區)、`styles/components/*.css`、`styles/views/*.css`。
   把 beta8 覆寫層的**最終生效值**併回各自的規則,刪掉被蓋掉的舊宣告。
3. **刪除死碼**:未引用選擇器(`.sidebar-toggle`、`.app-shell` 等,以腳本比對 TSX 產生清單)。
4. **中性命名**:`.glass`→`.panel-surface`、`GlassDropdown`→`Dropdown`、`LiquidKnob`→`SegmentIndicator`
   等純更名(不改外觀)。
5. **單一標籤表**:新增 `src/shared/workspaces.ts`(id、編號、標籤、副標),命令軌/命令列/
   ErrorBoundary 共用。**使用哪一套文字**屬文案決策,先沿用命令列那一套(beta8 規格已採用),
   待 D-4 裁決。
6. 移除 Dashboard 內與命令列重複的 `Guided Monitoring` page-header(結構去重,非美術判斷;若
   設計來源要保留再加回)。

驗收:截圖與基準比對無差異(除第 6 項預期的標題移除)、`npm run ci` 綠、未引用選擇器 = 0。

### P2 — 設計語言落地(依賴 🎨 設計輸入)

1. 🎨 輸入:兩主題的色彩 token(hex)、字型與字級階層、間距階層、圓角、動效時長/曲線、
   主題命名(取代「Data-Console / Precision Lab」)。
2. 寫入 `tokens.css`,並新增 `tokens.contrast.test.ts`:解析 token 檔,對所有「文字 × 背景」
   與「互動元件 × 背景」組合計算 WCAG 對比度,低於門檻即失敗。——把 09-02 round2 抓到設計方
   對比度算錯的人工查證變成永久的自動檢查。
3. 圖表色(`--chart-*`、`--color-thigh/shin/roll`)與 `LiveChart`/`HistoryView` 的 Chart.js
   設定一併對齊,並驗證三條系列線在兩主題與灰階下可區分。

### P3 — Dashboard 以「狀態」為中心重構(本次改版的核心)

1. **狀態推導純函式**:新增 `services/dashboardState.ts`,輸入現有 store 欄位
   (`isConnected`、reconnect、`hardwareError`、`lastCalibratedAt`、`protocol`、`selectedAction`、
   `session.phase`、`alarmActive`、靜音狀態、demoMode),輸出單一 `DashboardMode` 列舉 + 優先序。
   目前這些判斷散落在 `DashboardView` 的 `hintText`/`tone` 巢狀三元式中;抽出後可逐一單元測試
   優先序(例:ERR > 協定不支援 > 未連線,與現行邏輯一致)。**只重組判斷位置,不改判定結果。**
2. 🎨 輸入:每個 `DashboardMode` 的構圖——哪些區塊顯示、主指標大小、警報時的全區呈現、
   是否提供「病患專注模式」(隱藏證據層,只留量表/次數/警報)。
3. 依設計實作版面;保留 container query 的尺寸 preset,但由 `DashboardMode` 決定區塊顯隱。
4. `DashboardView.test.tsx` 擴充為涵蓋 12 個狀態;既有 12 個測試遇到文案變更時**更新斷言,不刪除**。
5. 動效:警報/保持狀態切換的過場遵循 🎨 動效規格,並一律尊重 `prefers-reduced-motion`。

### P4 — 其他三個工作區

- **動作處方 (Actions)**:沿用 beta8 register rows 結構,套新 token;以新截圖基準重新確認
  09-12 記錄的「1280px 下安全限制說明文字被截掉」問題是否仍存在,存在則修。
- **療程紀錄 (History)**:資料表面 + 分析 modal(Chart.js)套新 token;示範資料/未正常結束標記
  必須在新設計下仍明顯可辨。
- **系統設定 (Settings)**:校準精靈(`CalibrationWizard`)、OTA、更新、示範模式各區套新 token;
  OTA 面板位置的 IA 覆核(09 月初即懸置給設計方)在此一併定案。

### P5 — 外殼與收尾

- 命令軌/命令列套新 token 與 🎨 圖示/識別處理;捲軸顏色、焦點框 (focus ring) 在兩主題下可見。
- 鍵盤操作巡檢:所有互動元件可 Tab 到、焦點可見、`Esc` 堆疊 (`escapeStack`) 行為不變。
- 更新 [[UI_REDESIGN]] 為 v2 規格(取代 beta8 版本,舊版理由留在 coding log)。

### P6 — 驗收與發布

- 版本提升為下一個 beta(預估 `1.2.0-beta.11` 或依屆時版號),走既有 CI + release 流程。
- **實機項目(自動化無法取代)**:Windows 100%/150%/175% DPI 下目視;原生標題列三顆按鈕實際點擊;
  搭配真實裝置跑一次 連線 → 達標 → 超限 → 靜音 → 斷線復原,確認每個狀態的畫面符合 G1。
- 由使用者/治療師角色實際「站在 2 公尺外做動作看螢幕」做一次 G3 主觀確認。

## 6. 驗證總表

| 層級 | 內容 | 何時跑 |
|---|---|---|
| 單元 | `dashboardState` 優先序、token 對比度、標籤表一致性 | `npm run ci`(每次) |
| 元件 | `DashboardView`/`SettingsView`/`ActionsView`/`HistoryView` 既有 + 擴充測試 | `npm run ci`(每次) |
| 版面幾何 | 首屏關鍵元素在 viewport 內、body 無溢位(沿用 beta8 驗收基線) | `npm run visual`,每階段結束 |
| 視覺截圖 | 4 工作區 × 2 主題 × 2 尺寸 + 12 狀態矩陣 | 每階段結束;P1 要求零差異 |
| 實機 | DPI、原生標題列、真裝置狀態流 | P6 |

## 7. 待使用者裁決的事項

| # | 問題 | 選項 | 影響 |
|---|---|---|---|
| **D-1** | 🎨 設計輸入由誰提供? | (a) 恢復 Gemini(付費層/網頁版人工貼,沿用 `gemini-handoff-*` 流程,P1 截圖作為素材)<br>(b) 使用者自己或隊友出設計<br>(c) 修改 §1.1,授權 Claude 在明確範圍內提出設計提案、由使用者裁定 | P2–P5 全部卡在這裡;P1 不受影響 |
| **D-2** | 合併時程 | (a) 驗收結束後才合併(建議)<br>(b) 驗收前先合併 P1(零視覺差異,風險低) | 驗收 build 的穩定性 |
| **D-3** | 是否需要「病患專注模式」(大字、只留量表/次數/警報) | 要 / 不要 / 交給設計方判斷 | P3 範圍 |
| **D-4** | 介面文字:全中文、全英文,或中英並列(目前三套混用) | — | P1 標籤表、測試斷言;與 OPTIMIZATION 的 i18n 項相關 |
| **D-5** | 是否保留雙主題 | 保留兩套 / 單一主題 + 高對比模式 | P2 工作量約減半或不變 |

## 8. 風險

| 風險 | 緩解 |
|---|---|
| 設計輸入遲遲拿不到(重演 09-14) | P1 可先完成並獨立合併;P2 起才依賴設計 |
| 改版與驗收/真機修正同時進行造成衝突 | 獨立分支;真機修正優先進 `main`,改版分支定期 merge `main` |
| 文案變更打壞大量測試 | 測試以 role/文字查詢,改文案時同步改斷言;P1 的標籤表讓多數文字只改一處 |
| Linux 截圖與 Windows 實際渲染不同 | 截圖用於「前後差異」與版面審閱,不當作 Windows 像素真相;P6 實機目視補齊 |
| 自訂標題列誘惑(設計方想要一體化外框) | §3 明定保留原生 decorations;若設計堅持,另開調查項,不在本次範圍 |
