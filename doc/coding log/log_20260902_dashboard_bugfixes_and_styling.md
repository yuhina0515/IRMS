---
tags: [coding-log]
date: 2026-09-02
summary: "修好三個 Dashboard 上一直存在的真實缺陷(09-01 拆除 global.css 以來就壞了,直到今天實際截圖才第一次被看見):MetricGauge/ProgressRing/AngleVisualizer 讀取的 CSS 變數名稱是舊系統的,量表/進度環一直畫著失效顏色(螢幕上那兩個黑色矩形);Leg3D.tsx 的 THREE.Color() 建構子不吃 CSS4 空白分隔的 rgb() 語法,3D 視圖背景一直是預設白色;2D 姿態視覺化的 SVG 完全沒有寬度上限,實際渲染超過千像素只看得到一小角。三個都用截圖親眼確認修好,不是憑程式碼推論。同時把 Dashboard 既有結構(量表+進度環+session控制、頁籤式次要視覺化)套上新設計系統的樣式。Gemini 建議的「Cockpit」2欄常駐版面尚未採用——與側邊欄/頂部雙導覽的問題一起留給使用者確認。"
---

# 2026-09-02 變更日誌 — Dashboard 真實缺陷修復 + 樣式套用

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260902_gemini_round2_implementation|同日稍早:Actions/History 重建]] ·
> `doc/UI_REDESIGN.md`

## 🎯 請求

使用者:「繼續。」延續 Gemini 第二輪回饋的實作,這次輪到 Dashboard。

## 🔍 根因:三個一直存在、直到今天才被看見的真實缺陷

讀 `MetricGauge.tsx`/`ProgressRing.tsx`/`AngleVisualizer.tsx`/`Leg3D.tsx` 才發現,這幾個
元件從 09-01 拆除 `global.css` 起就沒人碰過,截圖驗證這幾輪也剛好每次都停在別的畫面——
今天是第一次真的點開 Dashboard 的每一個頁籤來看:

1. **MetricGauge/ProgressRing/AngleVisualizer 讀取舊版 CSS 變數名稱**(`var(--accent)`、
   `var(--gauge-track)`、`var(--thigh)` 等,舊系統命名,新系統是 `--color-accent` 這種
   `--color-` 前綴 + RGB triplet 格式)——量表的目標帶弧線、超限刻線全部讀不到值,
   螢幕上就是使用者一直在早期截圖裡看到、被記錄成「已知但延後處理」的那兩個黑色矩形。
2. **`Leg3D.tsx` 的 `THREE.Color()` 不吃 CSS4 空白分隔的 `rgb(15 23 42)` 語法**——就算把
   變數名稱修對,Three.js 自己的字串解析器(不經過瀏覽器的 CSS engine,是它自己的 regex)
   只認舊式逗號語法 `rgb(15,23,42)`,空白語法解析失敗會靜默退回預設白色。3D 視圖背景一直
   是白色,不是我這幾輪疊代忘記處理,是真的解析失敗——截圖親眼看到白底才抓到,不是看
   程式碼能推論出來的。
3. **`.visualizer svg` 沒有寬度上限**——`width:100%; height:auto` 配上 `viewBox="0 0 200
   200"`,在千像素寬的面板裡會被撐到超過千像素的正方形,螢幕上只看得到左上角一小塊,
   同樣是截圖才看到,不是讀程式碼能預料的。

三個都不是這次改動引入的新缺陷,是更早就存在、缺乏實機截圖覆蓋的死角——這次因為終於系統性
地把 Dashboard 四個頁籤都截了一輪,才第一次全部現形。

## 🔧 已完成

### 修復

- `MetricGauge.tsx`/`ProgressRing.tsx`/`AngleVisualizer.tsx`:所有 `var(--x)` 改成
  `rgb(var(--color-x))`(SVG 屬性可以直接吃 CSS 變數,截圖已確認瀏覽器端解析正常,
  問題只在 Three.js 那一側)。
- `theme.ts` 新增 `themeColor()` 輔助函式,**刻意輸出逗號分隔**(`rgb(15,23,42)`)而非
  儲存格式的空白分隔——順手讓 `chartTheme()` 也改用它,少一份重複的字串組裝邏輯。
- `Leg3D.tsx` 全面改用 `themeColor()`,`--leg3d-bg`/`--leg3d-grid-major`/
  `--leg3d-grid-minor` 這幾個沒有獨立存在必要的裝飾用途,直接對應到既有的
  `--color-surface`/`--color-border`/`--color-text-muted`,沒有新增 token。
- `.visualizer svg` 補上 `max-width: min(42vh, 380px)`,跟 `.leg3d-viewport` 用同一個
  尺寸邏輯,並讓外層 `.visualizer` 置中。

### 樣式:Dashboard 既有結構套新設計系統

補齊 `.dashboard-grid`、`.metric-action`/`.metric-sub`、`.metric-gauge`/`.metric-gauge-
notice`、`.knee-badge`、`.coach-hint`/`.phase-badge`、`.calib-chip`、`.ring-wrap`/`.pct`、
`.stat`(含 `.color-thigh`/`.color-shin`/`.color-accent`)——這些 class 先前完全沒有專屬
CSS,Dashboard 樣式進度落後 Settings/Actions/History 一截,這次補齊。`tailwind.config.js`
新增 `thigh`/`shin`/`roll` 三個顏色 token(先前只在 `tailwind.css` 存了 CSS 變數,但沒註冊
成 Tailwind 的 `colors`,`text-thigh` 這類 class 寫了也不會生效)。順手把三個檔案裡殘留的
`var(--...)` 死引用(`DashboardView.tsx`、`SessionControlPanel.tsx`)一併修掉,並把量表
大字、進度環百分比/reps、Session 計時器這幾個真正的即時數值讀數套上 `font-mono`
(呼應 Gemini「數值一律 mono」的規格,這是這批第一次真的碰到會顯示數字的元件)。

### 沒有做:Gemini 的「Cockpit」2 欄常駐版面

Gemini round-2 建議 Dashboard 即時資料區改成 2 欄常駐(左 8 欄圖表/量表、右 4 欄 3D 姿態),
取代現有的頁籤式切換(趨勢圖/3D/2D/詳細數值四選一)。這次**只修樣式與真實缺陷,沒有動版面
結構**——跟上一輪「要不要拿掉頂部 SegmentedControl」是同一類問題:牽動既有的資訊架構
決策(`doc/UI_REDESIGN.md` Phase 3 當時特別記錄了選頁籤而非常駐 4 格的理由:窄螢幕版面
預算),需要使用者確認要不要推翻那個決定,不是我可以在「順便改樣式」的範疇裡一併決定的。

## ✅ 驗證

- [x] `npm run ci`:typecheck 綠、**284 tests(26 files)全綠**、build 成功
- [x] 隔離啟動 + 截圖,**逐一點開 Dashboard 四個頁籤**(這是這幾輪第一次真的做到):
  - 趨勢圖(預設頁籤):量表弧線正確顯示目標帶(cyan)、超限刻線(red)、回位刻線(dashed),
    修復前的黑色矩形消失
  - 3D 姿態:第一次截圖背景仍是白色(確認了 THREE.Color 解析失敗的猜測),改用逗號語法後
    第二次截圖背景正確變回深色/淺色(依主題),格線雙色階正確顯示,大腿/小腿肢段正確上色
  - 2D 姿態:第一次截圖只看到畫面邊緣一小塊(確認了無寬度上限的猜測),補上 `max-width`
    後第二次截圖完整骨架圖正確置中顯示
  - 詳細數值:bento 卡片格正確顯示,色塊對應大腿(amber)/小腿(emerald)/膝夾角(cyan)
- [x] 深淺主題都截圖驗證過 3D/2D 視圖,確認修復對兩個主題都生效,不是只在其中一個主題
      湊巧正確

## 🔎 自我審查

**檢查情境:這三個缺陷的假設(變數命名錯誤/Three.js 解析限制/CSS 寬度沒設)有沒有可能
只是巧合矇對,其實根因是別的?**——每一個都用「改之前截圖 vs 改之後截圖」的對照驗證過,
不是改完看起來正常就當作確認:3D 視圖改動前截圖白底、改動後截圖正確深色/淺色,直接對應
「Three.js 解析空白語法失敗」這個假設(如果假設錯誤,改成逗號語法不會有任何變化);2D
視覺化同樣是改動前截圖確認畫面被撐爆、改動後截圖確認完整顯示。**Pass**——三個修復都有
「改前壞、改後好」的直接對照,不是單靠事後看起來合理就結案。

## 📝 後續待辦

- **需要使用者確認的兩個 IA 問題**(累積到這裡,建議合併一起問):
  1. 側邊欄要不要取代頂部 SegmentedControl(Gemini round-2 建議,牴觸使用者稍早的雙層
     導覽裁定)
  2. Dashboard 次要視覺化要不要從頁籤式改成 Gemini 建議的 2 欄常駐 Cockpit 版面
- Phase 4 到這裡,Dashboard/Actions/History/Settings 四個畫面都已套上新設計系統的基礎
  樣式,剩下的主要是上述兩個 IA 決策與後續的細部打磨。
