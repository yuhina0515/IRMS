---
tags: [ui, plan]
date: 2026-10-03
summary: Codex (GPT) proposed UI redesign plan; awaiting user decisions in section 5.
---

建議將 v3 Rehabilitation Workbook 收斂為「固定外殼、單一工作紙、固定操作區」：用一致的資訊層級與尺寸解決「太散」，保留量測、療程、校準、更新與模組生命週期行為。

已檢查 `src/views`、`src/components` 與樣式。全程未修改檔案、未執行會產生檔案的建置或測試。檢查期間出現他方未提交修改，以下已納入，尚不視為驗收完成。

**1. 現況稽核**

| 問題 | 程式證據與判斷 |
|---|---|
| 視覺規則多層疊加 | `src/styles/tailwind.css:415` 的通用表單、`:1259` 的外觀覆寫，再由 [workbench.css](E:/Monitoring-and-IoT/_repo-migration/new-IRMS/IRMS_App_Tauri/src/styles/workbench.css:69) 改尺寸；Tailwind 的 card/control 圓角仍是 12/6px，工作台則是 2/4px。 |
| 手機設定分類橫向散開 | 原版 `workbench.css` 在 720px 以下明確改成橫列。目前 [SettingsView.tsx](E:/Monitoring-and-IoT/_repo-migration/new-IRMS/IRMS_App_Tauri/src/views/SettingsView.tsx:321) 已有未提交抽屜，但缺少完整焦點管理、Escape／返回鍵及切換尺寸驗證。 |
| Checkbox 過大 | `tailwind.css:415` 對所有 input 套文字欄位 padding；`workbench.css` 又指定 checkbox 尺寸及 49px Android 觸控列。`.switch` 實際只是 checkbox label，沒有独立開關尺寸契約。需驗證 WebView 計算後尺寸。 |
| 啟用模組即跳頁 | Git diff 確認 [ModulesPanel.tsx](E:/Monitoring-and-IoT/_repo-migration/new-IRMS/IRMS_App_Tauri/src/components/ModulesPanel.tsx:55) 原本在啟用成功後呼叫 `openModuleTool`；目前修改已移除，但 `ToolsLifecycle.test.tsx:46` 仍要求跳頁。 |
| 各頁密度與操作位置不同 | `DashboardView.tsx:155` 同時有教練提示、巨型數字、姿態與 dock；`ActionsView.tsx:163` 有頁首工具、清單工具及 inspector；`SettingsView`、`TelemetryPanel`、兩個 wizard 混用 inline spacing、舊 `.panel.glass` 與 v3 sheet。 |
| 過多局部捲動 | `workbench.css` 讓頁首、coach、stage、pose、dock 分別可捲動；History 摘要固定七欄，手機仍需橫滑。頁面雖不捲動，操作感仍碎裂。 |
| 浮層規則不一致 | `ConfirmDialog` 有 alertdialog 與取消焦點；兩個 wizard 缺同等容器語意。`GlassDropdown` 使用 portal／視窗座標，Android zoom 下需實測定位。 |

**2. 統一設計系統**

- **樣式所有權：** `workbench.css` 管理語意 token、工作區結構與響應式規則；Tailwind 引用相同 token。逐區移除已取代的重複規則，避免繼續堆疊 `!important`。
- **間距：** 4、8、12、16、24、32px。手機頁邊 12、panel 12、群組間 16；桌面頁邊 24、panel 16、群組間 24。
- **字級：** 說明 12、標籤 14、正文 16、區塊標題 18、頁標題手機 22／桌面 28px；行高 1.45–1.6。等寬字僅用於數值、時間及裝置代碼；Live 主讀數手機 64／桌面 96px。
- **色彩與卡片：** 保留現有明暗主題與藍綠 accent。每頁一張主要 sheet，內部分區用標題與分隔線；4px 控制項圓角、6px panel 圓角，陰影僅給浮層。每個操作區一個主要按鈕。
- **新增共用元件：** `PageHeader`、`Section`、`FieldRow`、`CheckboxField`、`SwitchField`、`ActionBar`、`Drawer`、`DialogFrame`；統一 label、hint、error、disabled 與 focus-visible。

以下是**縮放後目標視覺尺寸**，不是硬體像素：

| 控制項 | 桌面滑鼠 | 平板／手機觸控 |
|---|---:|---:|
| Checkbox 方框 | 16×16 | 18×18 |
| Switch 軌道 | 32×18 | 36×20 |
| Button 高度 | 36；次要小型 32 | 44 |
| Input／select 高度 | 36 | 44 |
| Icon button／勾選標籤命中區 | 32 | 至少 44×44 |

Android 暫保留 `zoom:0.82`，以單一縮放 token 換算：44px 命中區約需 54 CSS px，18px 方框約需 22 CSS px；**放大可點區，不放大勾選圖形**。Checkbox 排除文字 input padding。

**導覽與捲動：**

- 桌面保留頂部分頁；Settings 左欄 200–240px，右側單一內容區。
- 手機保留精簡狀態列與主分頁，允許標籤兩行，不依賴橫滑找頁面；Tools 原有顯示條件不變。
- 工作區 ≤720px：Settings 使用「分類＋目前名稱」開啟左抽屜，寬度約 80%、上限 280 視覺 px；Tools 採同一選擇模式。
- `html/body/#root` 永不捲動；shell 使用 `minmax(0,1fr)`。每個可見 pane 一個內容捲動區，頁首與主要操作固定；避免巢狀捲動。桌面並排清單／詳情可各自捲動。

**3. 各分頁改版**

| 範圍 | 具體配置 |
|---|---|
| **Live** | 單一狀態提示 → 主讀數／目標範圍 → 姿態。桌面左右配置；手機上下排列，診斷可展開。`SessionDock` 固定於 sheet 底部，準備與進行中使用相同欄位對齊；結束／儲存始終可達。保留 `PoseSide`、`Leg3D` 渲染與清理邏輯。 |
| **Exercises** | 搜尋、篩選集中於清單頂端；頁首保留新增，還原預設降為次要。桌面 master/detail，手機保留現有清單→詳情模式；表單標籤、錯誤與底部儲存列統一。 |
| **History** | 桌面保留表格，手機採一致紀錄列。回顧的七項摘要改為自適應雙欄，與圖表、詳情同屬內容區；返回／匯出固定。保留 demo、abandoned、校準快照與 CSV 行為。 |
| **Tools** | 統一工具選擇器與空白／載入／失敗狀態；模組內容使用明確大小的 mount 容器。共用 token 可供模組使用，不用全域 selector 強制重塑模組內部 UI。 |
| **Settings** | 七分類保留；每區依「狀態→主要操作→一般欄位→進階」排列。Updates 分 App／Firmware 區段；Modules 僅管理狀態、版本、啟停及明確「開啟」。Privacy、Demo 保留確認及療程鎖定。 |
| **Dialogs／wizards** | 共用標題、內容捲動與操作 footer；手機 wizard 近全螢幕。補進度文字、焦點限制／返回與可存取名稱，維持擷取期間取消規則。 |
| **Banner／錯誤／toast** | 更新 banner 保留 shell 獨立列，手機文字與按鈕分行；保留 APK 下載及療程中禁止重啟。Demo 標示不可隱藏；錯誤仍提供結束儲存／斷線。Toast 不遮主要操作。 |

**4. 實作順序：每階段可獨立交付**

所有階段皆跑相關 Vitest、`npm run typecheck`，並同步修改 `src/i18n/{en,zh-Hant}.ts`。

| 階段／檔案 | 風險與驗證 |
|---|---|
| **1．修正已回報問題**：`ModulesPanel`、`SettingsView`、兩份 CSS、`ToolsLifecycle.test` | 接續現有修改；補抽屜焦點／關閉與 checkbox reset。驗證啟用成功、失敗、快速啟停均留在設定；只有開啟導頁。跑 Settings、ToolsLifecycle、modules 測試。 |
| **2．尺寸與共用元件**：新增上述 primitives、Tailwind config、CSS；先套 Settings／Telemetry | 防全域 selector 影響模組。檢查所有 boolean 控制、長標籤及 disabled；跑 Telemetry、DemoMode、GlassDropdown 測試。 |
| **3．固定外殼**：`App`、`TopNav`、`PageHeader`、`UpdateBanner`、CSS | 防 banner 擠掉內容。驗證 demo＋更新＋短視窗、Android 鍵盤、安全區；新增 banner 行為測試。 |
| **4．Live**：`DashboardView`、`SessionDock`、姿態容器、CSS | 防 resize 影響 canvas 或操作可達性。跑 Dashboard、sessionController；檢查未連線、校準、進行中、超限及錯誤。 |
| **5．Exercises**：`ActionsView`、共用表單、CSS | 保留搜尋、選取、編輯及取消；跑 Actions、actionQuery、usePageSize。 |
| **6．History**：`HistoryView`、CSS；必要時調整 `usePageSize` | 列高須與 `--page-row-height` 一致。跑 History、usePageSize、sessionAnalysis；驗證分頁、返回、匯出。 |
| **7．Tools 與浮層**：`ToolsView`、`ModulePanelMount`、Confirm／兩個 Wizard／Toast／Error／Dropdown | 防 mount 清理與層級回歸。跑 ToolsLifecycle、兩個 Wizard、GlassDropdown、escapeStack、layering；保留原有關閉時序。 |

每階段截圖驗收：Android emulator／實際 WebView，360×800、393×852、412×915，確認 `android-phone` 與 zoom 生效；另測橫向、鍵盤開啟、明暗主題、繁中／英文長字串。桌面測 1024×768、1440×900、Windows 125% DPI。檢查無根頁捲動、無非必要橫向溢出、操作列可達、抽屜／dropdown 不錯位。

最終跑 `npm run ci:frontend`，包含既有 `i18n.test.ts` 字典結構 parity、`english.test.tsx`、`documentLang.test.tsx`；模擬器截圖不取代原生 BLE／OTA 驗收。

**5. 與使用者決定**

- 手機主導覽：建議先保留頂部分頁；是否另改底部列？
- Live 手機姿態預設展開，還是優先顯示讀數、姿態手動展開？
- 即時生效偏好採小型 switch，或全部維持 checkbox？
- 本輪保留 0.82 zoom；是否另開後續階段移除，改為原生尺寸響應式？

