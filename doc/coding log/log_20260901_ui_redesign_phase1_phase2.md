---
tags: [coding-log]
date: 2026-09-01
summary: "第一次用新裝好的 craft-ui-designer skill 跑 IRMS 重建的 Phase 1(發現)+ Phase 2(設計 token)。Phase 1 用 AskUserQuestion 一輪問清 IA/情緒基調/視覺方向,裁定:拿掉底部四分頁改單頁內切換、深色高密度數據控制台調性、Bento grid 卡片、不再走 Apple 語系。Phase 2 把這個方向轉成 tailwind.config.js 裡具體的 token(全部錨定在 Tailwind 官方調色盤的真實 hex 值,不是憑印象發明),WCAG 對比度實際算過(最差 6.96:1,遠高於 4.5:1 門檻),build 通過。Phase 3(版面藍圖)留給下一輪,依 skill 規則不把所有 phase 一次做完。"
---

# 2026-09-01 變更日誌 — UI 重建 Phase 1 發現 + Phase 2 設計 Token

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260901_ui_teardown_start|同日稍早:拆除舊版 UI]] ·
> `~/ClaudeConfigSync/skills/craft-ui-designer/SKILL.md`(新裝的設計流程 skill)

## 🎯 請求

使用者提供兩項輸入,啟動 UI 重建的實際設計工作:
1. 要做成一頁式 App,不再執著 Apple 語意。
2. 給了一份用 Gemini Spark 建立的 `craft-ui-designer` 指令,要求參考並優化後裝進這個環境。

## 🔧 已完成

### 裝 skill

把使用者提供的 spec 優化後寫成 `~/ClaudeConfigSync/skills/craft-ui-designer/SKILL.md`(全域,
所有專案可用)。優化重點:Phase 1 發現問卷改用這個環境的 `AskUserQuestion`(一輪問完,而非
自由文字問卷);每個 phase 對應一個 `TaskCreate` 任務追蹤,不把多個 phase 壓縮進同一輪;
明確要求先查真實參考(這台機器的 `E:\Projects\UIReferences` 工作區、已知免費元件庫清單)
再發明數值;Gotchas 補上這次 session 實際踩過的 backdrop-filter stacking context 坑,
確保下一個浮動元件不會重演。已 commit 到 ClaudeConfigSync(`537bfb5`)。

### Phase 1:發現(用新 skill 跑第一次)

`AskUserQuestion` 一輪三題,結果:
- **IA 範圍**:拿掉底部四分頁 icon bar,改成單頁容器內切換(例如頂部 segmented control),
  但仍是一次顯示一個功能區塊,不是把 Dashboard/Actions/History/Settings 全部攤平堆疊。
- **情緒基調**:高科技數據控制台——深色、高密度、像實驗室/監控儀器,不是臨床潔淨風,
  也不是溫和圓潤的健康 App 調性。
- **視覺方向**:Bento grid 資訊卡片,明確不再用 Apple 語系。

### Phase 2:設計 Token

寫進 `IRMS_App/tailwind.config.js` 的 `theme.extend`:

- **色彩**:全部取自 Tailwind 官方調色盤的真實 hex 值(不是憑印象調的顏色)——
  `slate` 當基底中性色(比 `zinc` 冷,更貼近「數據控制台」而非「溫暖極簡」)、
  `cyan` 當主要強調色(醫療遙測顯示器常見的配色邏輯)、`emerald`/`amber`/`red`
  對應既有的 success/warning/danger 命名。
- **字體**:UI 文字沿用專案已經自架的 Inter Variable(不重新弄一套字體載入管線);
  新增 `mono` token 給角度/次數/計時這類數據讀數用,值先寫成 `JetBrains Mono Variable`,
  實際字型檔案留到 Phase 4 真的要渲染數據時再接(目前會 fallback 到系統等寬字體,
  不是斷掉的參照,只是還沒接上真正的字型檔)。
- **陰影/立體感**:刻意不靠大陰影做卡片立體感——深色背景上陰影幾乎看不出來,改用
  `surface`/`surface-raised` 兩層背景色階 + 1px 低透明度邊框做層次,這是 Linear/Vercel/
  GitHub 深色模式實際採用的手法,不是自創。`shadow-floating` 只留給真正浮動的層
  (dropdown/dialog)。
- **圓角**:沒有另外發明數值,直接用 Tailwind 內建刻度,只是取別名讓元件程式碼用語意
  讀(`card` = `rounded-2xl`、`control` = `rounded-lg`)。
- **間距**:沿用 Tailwind 內建的 4px 刻度,沒有另外擴充。

嘗試用 `WebFetch` 去 Aceternity UI 的 bento grid 頁面抓實際的 class 值當佐證,回來的內容
被摘要器濾掉了具體 class(只剩敘述性文字,沒有可用的 hex/class),GitHub raw 路徑也
404。**誠實記下**:沒能拿到第三方元件庫的逐字 class 值,改用 Tailwind 官方調色盤(本身
就是精確、有文件根據的真實數值來源)加上有記錄可查的深色 UI 慣例(邊框+色階分層而非陰影)
當根據,不是用「印象中 bento grid 大概長怎樣」硬猜。

## 🧠 關鍵決策

**沒有把 JetBrains Mono 字型檔案的實際載入也塞進 Phase 2**:token 定義(這個角色該用什麼
字體家族)跟資產載入(那個字體檔案怎麼自架進來)是兩件不同顆粒度的工作,前者屬於 Phase 2
設計決策,後者更像 Phase 4 元件真的要渲染數據時的實作細節。現在寫下的字體名稱不是斷掉的
參照——CSS 字體堆疊本身就有 fallback 機制,只是還沒套用「刻意選的那個字體」而已。

**Phase 2 做完就停,不接著做 Phase 3**:`craft-ui-designer` skill 明確要求 phase 之間要有
使用者驗證,不能一次全部做完丟出來。設計 token 這種相對客觀(有 WCAG 數字背書)的產出
适合先給使用者過目,再決定版面藍圖怎麼展開。

## ✅ 驗證

- [x] 對比度**實際算過**(WCAG 相對亮度公式,寫成一次性 node 腳本跑,不是目測):
      主文字 18.41:1、次文字 12.02:1、muted 文字 6.96:1、accent 11.16:1、
      success/warning/danger 皆 ≥7.29:1——**全數遠高於 AA 門檻**(一般文字 4.5:1,
      大字/UI 元件 3:1)
- [x] `npm run build`:Tailwind + electron-vite 建置成功,無語法錯誤

## 🔎 自我審查

**檢查情境:對比度算出來這麼寬鬆,是不是哪裡算錯了(例如顏色抄錯或公式用反)?**——
交叉檢查 muted 文字(數值最低的一組,6.96:1)用的兩個顏色:`#94a3b8`(Tailwind
`slate-400` 官方定義)、`#0f172a`(`slate-900` 官方定義),兩者本來就是官方調色盤裡
刻意拉開亮度差的兩個色階(400 跟 900,中間隔了 500 個色階),算出高對比度是合理結果,
不是公式錯誤導致的假陽性。**Pass**——後續如果字體變細、背景疊加半透明玻璃效果,
這組數字需要重算,不能直接假設現在算出來的比例會一直成立。

## 📝 後續待辦

- **Phase 3(版面藍圖)留給下一輪**,需要先給使用者看過這次的 token 方向、確認沒問題
  才展開:單頁容器怎麼切、頂部 segmented control 取代底部 tab 的具體位置、Bento grid
  在 Dashboard(即時監測,25Hz 資料流)這種需要即時更新的畫面上要怎麼分卡片。
- JetBrains Mono 實際字型資產尚未接上,Phase 4 動到真的渲染數據讀數的元件時要記得處理。
- `global.css`/`styles/profiles/` 仍在 repo 裡未刪(見上一份日誌),等舊元件被新設計
  逐一取代後再清。
