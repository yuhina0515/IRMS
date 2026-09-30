# IRMS Desktop Workstation UI — beta8

> 這是目前唯一有效的 UI/IA 規格。2026-09-02 的 sidebar＋bento card 方向已退出產品主線；
> 歷史決策保留在 `doc/coding log/`，不再混入 living reference。

## 產品定位

IRMS 是持續監測患者動作的 Windows 桌面儀器，不是內容網站、行銷 dashboard 或卡片瀏覽器。
畫面必須讓治療師在一眼內回答三件事：裝置是否可信、患者現在做得是否正確、下一個動作是什麼。

## 資訊架構

```text
┌──────────┬──────────────────────────────────────────────────────────┐
│ IRMS     │ 01 即時監測 / LIVE SESSION       ● 裝置狀態  [連線]    │
│          ├──────────────────────────────────────────────────────────┤
│ 監測     │                                                          │
│ 處方     │                     單一工作區                           │
│ 紀錄     │          僅工作區內部允許必要的捲動                     │
│ 設定     │                                                          │
│          │                                                          │
│ BETA     │                                                          │
└──────────┴──────────────────────────────────────────────────────────┘
```

- 固定 84px command rail 是唯一主導覽，不再展開／收合，也不覆蓋內容。
- 72px command bar 顯示目前工作區、連線狀態與全域操作；不重複模擬 Windows 標題列。
- body 與 root 永不捲動；需要長內容時只捲動 `.workspace-main`。
- 保留原生 Windows decorations，避免 175% DPI 下自訂標題列控制鈕的座標偏移問題。
- scrollbar 必須使用低對比的產品色，不得回退成白色瀏覽器 scrollbar。

## 視覺語言

- 連續工作面取代浮動卡片海：4px 以下小圓角、單層邊界、無裝飾性陰影。
- 青色只表示選取、連線或重要操作，不作大面積裝飾。
- 狀態與數值優先使用 JetBrains Mono；標題與說明使用 Inter。
- 深／淺主題仍保留，但共享同一資訊層級與幾何結構。

## 四個工作區

### 01 即時監測

- 左側是主判定面：當前動作、主量表、目標區與教練提示。
- 右側是 session 操作與完成進度。
- 下方才是證據層：原始數值／趨勢，以及選配的姿態視圖。
- 主判定與 session controls 在任何桌面尺寸都先於圖表與 3D。

### 02 動作處方

- 使用 protocol toolbar＋filter strip＋register rows。
- 動作是可執行的處方紀錄，不再呈現為彼此漂浮的商品卡片。
- 編輯／刪除仍在每列尾端；參數驗證與 Record Pose 契約不變。

### 03 療程紀錄

- 使用連續資料表面，header 固定為欄位語意，列 hover 只協助定位。
- 示範資料、未正常結束與分析入口必須保持可見。

### 04 系統設定

- 校準與一般設定形成首屏雙欄 workbench。
- 軟體更新、韌體 OTA、示範模式依風險與使用頻率向下排列為全寬 sections。
- 長頁只在 workspace 內捲動；不讓 rail 或 command bar 隨內容離開視窗。

## 不變的安全邊界

此次重建只捨棄舊排版與 UI 狀態邏輯，不改 BLE protocol、動作判定、session controller、
SQLite schema／migration、校準數學、OTA 安全限制與 updater 簽章驗證。這些不是視覺設計自由度。

## 驗收基線

- 1280×720：body scrollWidth/scrollHeight 必須等於 viewport；Dashboard workspace 不溢位。
- 1024×600：主判定與 session controls 可用；次要證據區可向下排列。
- 所有尺寸：command rail／bar 固定，只有工作區可以捲動。
- Windows signed build：保留原生標題列、IRMS icon 與可操作的最小化／最大化／關閉按鈕。
