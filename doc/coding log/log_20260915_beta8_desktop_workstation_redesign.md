# v1.2.0-beta.8 Desktop Workstation UI 重構

日期：2026-09-15

## 背景與決策

beta7 畫面同時存在 Windows 原生標題列、產品頂欄、可收合側欄、浮動卡片與瀏覽器式白色捲軸，視覺層級重複，因而呈現網站 Dashboard 被包進桌面視窗的感覺。本版正式退役舊 bento／Liquid Glass 排版，重新定義為 Windows 桌面量測工作站。

原生視窗 decorations 繼續保留：先前自製視窗按鈕在 Windows 175% DPI 下曾發生點擊座標偏移。此版以應用內容層重構解決網頁感，不重新引入該風險。

## 新資訊架構

- 左側固定 84px 命令軌，取消展開／收合與寬度狀態。
- 頂部 72px 情境命令列顯示工作區編號、名稱、連線狀態與主要動作。
- 主內容只有 `.workspace-main` 可以捲動，視窗與 body 固定；捲軸改用產品色系。
- Dashboard 採「主要量測／工作階段控制／證據」的工作流程，而非等權卡片網格。
- Actions 改為連續動作登錄表；History 改為連續資料面；Settings 改為雙欄工作台。
- 1024px 以下縮窄命令軌，820px 以下工作台轉單欄，不產生水平 body overflow。

## 修改範圍

- `src/App.tsx`：建立 desktop shell、command rail、workspace shell。
- `src/components/Sidebar.tsx`：移除收合狀態與漢堡選單，改為固定命令軌。
- `src/components/TopHeader.tsx`：改為依目前 view 顯示情境的 command bar。
- `src/views/ActionsView.tsx`：卡片網格改為 register rows。
- `src/views/HistoryView.tsx`：歷史表格改為連續 data surface。
- `src/views/SettingsView.tsx`：設定區改為 workbench。
- `src/styles/tailwind.css`：新增 beta8 工作站 shell、響應式規則與工作區視覺語言，移除退役 Dashboard container-query 規則。
- `doc/UI_REDESIGN.md`：重寫為 beta8 UI 規格。
- App／Tauri 版本同步提升為 `1.2.0-beta.8`。

## 安全邊界

本次「捨棄原有邏輯」限定於 UI 資訊架構、導覽及呈現邏輯。BLE 通訊、臨床動作判定、校準資料、SQLite、OTA 與 updater/signing 均未改動。舊 `sidebarCollapsed` 設定仍可被反序列化以相容既有使用者資料，但新版不再使用它。

## 驗證

- `npm run ci`：通過。
  - Vitest：27 files／285 tests。
  - Rust：60 tests。
  - TypeScript、Vite build、rustfmt、Clippy warnings-as-errors：通過。
- 1280×720 renderer 幾何：command rail 84px、command bar 72px、body 無 overflow；Dashboard 無不必要捲動。
- 1024×600 renderer 幾何：command rail 72px、無水平 overflow；Dashboard 主量測與控制並列、證據區在下方。
- Settings 僅工作區垂直捲動，body 固定。
- 無障礙樹確認導覽、標題、連線狀態與控制項仍可辨識。

## 驗證限制

目前自動化環境未提供 Windows native app surface，因此視覺 QA 使用 Vite renderer、DOM 幾何與 accessibility tree 完成；瀏覽器預覽中的 Tauri API undefined 訊息是離開 Tauri runtime 的預期限制，不是封裝版錯誤。簽署後安裝檔仍應在實機進行一次人工視覺與裝置連線驗收。
