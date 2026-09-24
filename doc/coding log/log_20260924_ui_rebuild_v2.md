---
tags: [coding-log, ui, i18n, tauri]
summary: 依使用者裁定(D-2 驗收後合併、D-4 語言檔分中英、UI 推掉重建)重建整個呈現層。新增 src/i18n(zh-TW/en 兩份語言檔,型別強制鍵值一致,設定頁切換)、依設計語言 v2 重寫樣式表(移除 1468 行的 tailwind.css)、外殼與所有畫面重寫、即時監測改為狀態驅動(dashboardState 純函式 + 阻斷面板 + 警報整片呈現 + 專注模式)。設定 persist v14(language/focusMode/themeMode 'system')。順帶修正 guidance 在目標帶內 idle 時提示「回降負值」的顯示 bug。351 前端測試、typecheck、build 全綠;無 Windows 實機與真裝置驗證。
date: 2026-09-24
---

# 2026-09-24 變更日誌 — UI 重建(設計語言 v2 + 中英語言檔)

> **相關文件**:[[HOME|導覽首頁]] · [[UI_REDESIGN|UI 規格 v2]] · [[UI_DESIGN_LANGUAGE_V2|設計語言 v2]] ·
> [[UI_REDESIGN_V2_PLAN|改版計畫]] · [[log_20260924_design_language_v2|同日稍早:設計語言規格]]

## 🎯 使用者裁定

1. D-2:**驗收結束後才合併**——全部工作留在 `claude/irms-ui-redesign-38fvnr`。
2. D-4:**語言檔分為英文與中文**。
3. **UI 需要推掉重建**——不走原計畫 P1 的零視覺差異漸進整理。

## 🔧 變更內容

### 1. i18n(`src/i18n/`)
- `zh-TW.ts` 為語言檔來源,`en.ts` 以其推導出的 `Messages` 型別宣告——缺鍵或多鍵在 typecheck 失敗。
- 帶參數的句子寫成函式,語序由各語言決定。`useT()`(hook)/`getT()`(class component)/
  `guidanceText()`、`metricLabel()` 輔助。
- 設定頁「介面語言」切換,每個語言以自己的語言顯示名稱(看不懂目前語言的人也找得到切回去的鈕)。
- **未翻譯的範圍(已知)**:服務層產生的訊息——OTA 結果與韌體錯誤碼說明(`bluetooth.ts`、
  `shared/protocol.ts`)、開發日誌字串;預設動作名稱是資料庫內的使用者資料,不隨語言變。
  CSV 表頭刻意維持固定英文欄位名(給其他工具解析)。

### 2. 設定 persist v14(`store/useStore.ts`)
- 新增 `language`(預設 zh-TW)、`focusMode`(預設 false);`themeMode` 新增 `'system'`。
- 既有使用者的 `themeMode` 保留原值,只有新安裝預設跟隨系統。新增 v13→v14 遷移測試。

### 3. 樣式表
- 刪除 `styles/tailwind.css`(舊層 + beta8 覆寫層共 1468 行)。新增 `tokens.css`(設計語言 v2 的
  兩主題 token,另以 `prefers-color-scheme` 先行套用避免跟隨系統時閃白)、`base.css`、`shell.css`、
  `dashboard.css`、`views.css`;Tailwind 只保留 preflight(`reset.css`)。
- 主題改以 `<html data-theme>` 切換,`services/theme.ts` 支援 `system` 並訂閱作業系統變化。
- 圖表系列色與狀態色分離;大腿實線 / 小腿虛線 / Roll 點線。

### 4. 元件與畫面(全部重寫呈現層)
- 外殼:`Rail`(取代 Sidebar)、`CommandBar`(取代 TopHeader,新增專注切換、三態主題、裝置狀態膠片)。
- `Dropdown`(取代 GlassDropdown,新增方向鍵/Esc 鍵盤操作)、`Icons`(取代 NavIcons 與 emoji)。
- 刪除 `CoachHint`、`LiquidKnob`、`NavIcons`、`Sidebar`、`TopHeader`、`GlassDropdown`。
- 即時監測:`services/dashboardState.ts`(`deriveDashboardMode` + 10 個單元測試)、阻斷面板、
  警報列(超出量 + 大靜音鈕 + 靜音倒數)、保持整圈 success、專注模式線性目標條、可收合證據層。
- `sessionController` 只新增唯讀 getter `alarmSilencedUntilMs`(靜音倒數用),不改任何行為。
- 動作處方、療程紀錄(校準漂移欄位改為可讀名稱)、系統設定、校準精靈、確認框、Toast、
  硬體錯誤遮罩、ErrorBoundary、更新橫幅全部改用新樣式與語言檔。精靈的擷取/自動觸發邏輯未改。

### 5. 順帶修正的既有缺陷
- `guidance.ts`:joint_angle 動作在目標帶內但引擎仍 idle 時(例如療程尚未開始),落到 `lower`
  分支算出負值,顯示「回降 -12.0° 進入目標區」。改為 `hold`,並加迴歸測試。純顯示文字,
  不影響判定。由專注模式截圖發現。

## ✅ 驗證

- [x] `npm run ci:frontend`:typecheck、**351 tests / 32 files**(原 337)、production build 全綠。
      測試遇文案變更時改為從語言檔取字串斷言,沒有刪除任何測試;新增 dashboardState(10)、
      Dashboard 阻斷/專注/英文(+2)、persist v14 遷移(1)、guidance 迴歸(1)。
- [x] 對 vite dev server 以 Playwright + mock `__TAURI_INTERNALS__` 截圖 19 個畫面/狀態
      (兩主題、中英、1280×720 / 1024×600 / 1280×1000),**全部無 body 溢位**。截圖存於
      `doc/design-v2/screenshots/`,腳本 `doc/design-v2/visual-check.mjs`。截圖過程中修掉
      量表圖例與教練提示重疊、`.icon` CSS 蓋掉圖示尺寸、硬體錯誤卡片半透明三個呈現問題。
- [x] 未引用 CSS class 檢查:TSX 中所有 className 皆有定義(Tailwind utility 已不再產生)。
- [ ] `npm run ci:rust`:未在本機跑——本次沒有任何 `src-tauri/` 變更,交由 PR 的遠端 CI。
- [ ] **Windows 實機**:原生標題列、175% DPI、WebView2 字型(Microsoft JhengHei)渲染——未驗證。
- [ ] **真裝置**:警報/保持/重連狀態在真實封包流下的呈現——未驗證(裝置狀態見 HOME)。

## 📝 後續

- 驗收結束後:在合併前的 `main` 打 `ui-beta8-archive` tag 封存舊 UI,再合併本分支並發 beta。
- 服務層訊息(OTA 結果、韌體錯誤碼)的英文化,若需要另開工作項。
- 可交 GPT 6 Astra 以 `doc/design-v2/screenshots/` 交叉審閱設計(設計語言 v2 §10)。
