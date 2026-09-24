# IRMS Desktop UI — v2(2026-09-24 重建)

> 這是目前唯一有效的 UI/IA 規格。視覺數值(色票、字級、動效)的完整規格在
> [[UI_DESIGN_LANGUAGE_V2]];改版的決策與階段在 [[UI_REDESIGN_V2_PLAN]]。
> beta8(2026-09-15)的 Desktop Workstation 版本與更早的 bento/Liquid Glass 版本已退出主線,
> 歷史決策保留在 `doc/coding log/`。**本版在驗收結束後才合併進 `main`**(D-2)。

## 產品定位

IRMS 是**病患邊做動作邊瞄一眼**、**治療師事後要信得過**的臨床儀器。畫面依序回答:
現在安全嗎 → 做對了嗎 → 下一步是什麼。數值與圖表是證據層,排在後面。

## 資訊架構

```text
┌──────────┬──────────────────────────────────────────────────────────┐
│ IRMS     │ 01 即時監測           ● 已連線 · IRMS-Knee  [專注][☀][中斷] │
│          ├──────────────────────────────────────────────────────────┤
│ 監測     │ ┌ 主面板(狀態驅動,68%)─────────┐ ┌ 控制欄(32%)──┐ │
│ 動作     │ │ 動作名 / 主指標                  │ │ 次數  保持環     │ │
│ 紀錄     │ │        量表 or 阻斷面板           │ │ 指定動作/參數    │ │
│ 設定     │ │ 教練提示 or 警報列               │ │ 開始/結束療程    │ │
│          │ └──────────────────────────────────┘ └──────────────────┘ │
│ BETA     │ ┌ 證據層:趨勢圖 · 詳細數值 · 3D · 2D(可收合)────────────┐ │
└──────────┴──────────────────────────────────────────────────────────┘
```

- 固定 84px 命令軌(≤1024px 時 72px)是唯一主導覽;72px 命令列顯示工作區、裝置狀態膠片與全域操作。
- body 與 root 永不捲動;只有 `.workspace__main` 可捲動。
- 保留原生 Windows decorations(175% DPI 自訂標題列點擊偏移問題)。
- 介面文字全部來自 `src/i18n/zh-TW.ts` 與 `src/i18n/en.ts`,設定頁切換,預設繁中。

## 即時監測:狀態驅動

`services/dashboardState.ts` 的 `deriveDashboardMode()` 以單一優先序決定目前狀態(先命中者勝):

| 狀態 | 主面板 |
|---|---|
| hardwareError / unsupported / disconnected / noAction | **阻斷面板**取代量表(不畫一個看起來在運作的量表),附下一步按鈕 |
| stale(重連中) | 量表照常、左緣 warning、數值過期提示 |
| alarm | 整片 danger 底 + 4px 邊框 1Hz 漸變 + 警報列(超出量 + 大尺寸靜音鈕) |
| silenced | 同上但邊框虛線、不動,靜音倒數 |
| holding | 整圈 success 邊框 + success 底 |
| returning / inZone / active | 一般量表;在目標區時左緣 success |

- 主指標數值是 HTML 文字(非 SVG),以 `--fs-display` 104px 為上限依容器縮放。
- 量表上色:目標區外中性、區內 success、超限 danger;**accent 不表示「做對」**。
- **專注模式**(命令列「專注」,持久化):隱藏控制欄與證據層,改為線性目標條 + 160px 數值。
- 證據層在視窗高度 < 900px 時預設收合。

## 其他工作區

- **動作處方**:協定工具列 + 篩選列 + register rows;安全上限是 danger 小徽章,不會被截斷。
- **療程紀錄**:連續資料表;示範資料列斜紋底 + 「示範」徽章;未正常結束「未完成」徽章。分析對話框的
  校準漂移提示以可讀欄位名顯示(舊版直接顯示 `proximalZeroRaw` 之類的識別字)。
- **系統設定**:校準 | 一般(語言、主題、協定、圖表、證據層開關)雙欄;軟體更新、韌體 OTA(「有風險」
  徽章)、示範模式為全寬區塊。

## 不變的安全邊界

重建只替換呈現層(`views/`、`components/`、`styles/`、`i18n/`)。BLE 協定、判定引擎、session
controller 指令序列、SQLite schema/migration、校準數學、OTA 安全限制與 updater 簽章驗證未改動。
唯二碰到邏輯層的地方:`sessionController` 新增唯讀 getter `alarmSilencedUntilMs`(供靜音倒數顯示),
以及 `guidance.ts` 修正「已在目標帶內卻提示回降負值」的顯示文字 bug——兩者都不影響判定。

## 驗收基線

- 1280×720、1024×600:body scrollWidth/scrollHeight 等於 viewport(`doc/design-v2/visual-check.mjs` 檢查)。
- 兩主題的所有文字/控制項色彩組合通過 WCAG AA(`doc/design-v2/contrast_check.py`)。
- Windows signed build:保留原生標題列、IRMS icon 與可操作的最小化/最大化/關閉按鈕——**需實機確認**。
