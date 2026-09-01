---
tags: [coding-log]
date: 2026-09-01
summary: "使用者裁定推掉整個手刻 Liquid Glass UI 系統重來,理由是視覺質感一直「像 AI 生成」,而 GlassDropdown 那個 stacking context bug 只是同一類問題的其中一個症狀。舊版先在 git 存證(legacy-ui-liquid-glass branch + ui-v1-liquid-glass-archive tag),再直接在 main 上拔掉 global.css 的引用、裝 Tailwind CSS 打底。npm run ci 全綠,CSS bundle 39.87kB→15.84kB 證實舊樣式真的不再被打包,隔離啟動截圖確認畫面回到無樣式的原始 HTML。舊的 global.css / styles/profiles/ 檔案本身還在 repo 裡未刪,是刻意留著等逐頁重建時再清,不是漏做。"
---

# 2026-09-01 變更日誌 — UI 重建:拆除舊版 Liquid Glass 系統(第一步)

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260901_dropdown_stacking_fix|同日稍早:GlassDropdown stacking context 修復]]

## 🎯 請求

使用者在 GlassDropdown 修復完成後,提出更大範圍的意見:整個 UI「一眼看出來就是 AI 生成」,
問「有辦法避免一直重複同樣的錯誤嗎」。討論後裁定:不是修修補補,直接把現有 UI 推掉重來,
但要先把舊版存下來。三個關鍵決策點透過 AskUserQuestion 向使用者確認:
1. 舊版怎麼保存 → **IRMS_App 開 git branch/tag 封存**(不額外複製進 UIReferences)
2. 新 UI 在哪裡開始建 → **直接在 IRMS_App 開新 branch 重建**
3. main 上現在能打包發布的 UI 要不要先保持不動 → **現在就在 main 上開始清空重建**

## 🔧 已完成

### 1. 封存舊版

`legacy-ui-liquid-glass` branch + `ui-v1-liquid-glass-archive` tag,都指在含 GlassDropdown
修復的最新 commit(`05abd81`)。往後任何時候想比對或回頭參考,`git checkout
ui-v1-liquid-glass-archive` 就能拿到完整可執行的舊版。

### 2. 導入 Tailwind CSS 打底

`tailwindcss@3` + `postcss` + `autoprefixer`(devDependencies),`tailwind.config.js` 的
`content` 指向 `src/renderer/index.html` 與 `src/renderer/src/**/*.{ts,tsx}`,新建
`src/renderer/src/styles/tailwind.css`(僅三行 `@tailwind base/components/utilities`)。

### 3. 拔掉舊樣式系統

`main.tsx` 的 `import './styles/global.css'` 改成 `import './styles/tailwind.css'`。
**刻意不刪除** `global.css`(1300+ 行)與 `styles/profiles/`(`applyStyleProfile.ts`、
`liquidGlassLight.ts`、`liquidGlassDark.ts`、`registry.ts`)——這些檔案牽連
`useStore.ts` 的 `styleProfileId`、`SettingsView` 的 Appearance 面板、`theme.ts` 供
Chart.js/Three.js 讀 token 的整合層,一次砍掉是另一個規模的重構,會在還沒有新設計可以
替換的狀態下讓多個檔案同時壞掉。現階段只切斷「這份 CSS 有沒有被套用」這一件事,
逐頁重建時再回頭清掉真正不再需要的部分。

## 🧠 關鍵決策

**只斷開引用,不整批刪檔**:`npm run typecheck` 不检查 className 字串对不对得上任何 CSS
規則,所以純粹切換 import 這一步不會讓編譯壞掉——`applyStyleProfile`/`theme.ts` 這些
還在執行,只是現在寫的 inline custom property 沒有任何 CSS 規則會讀它們,不會拋錯,
最多是 Chart.js/Three.js 拿到空字串當顏色,退化成預設色,不是當機。這讓「開始清空」
這個動作本身可以立刻被驗證是安全的(CI 全綠),而不必一次扛下把 store/Settings/theme
三層一起改乾淨的風險。

**留在 `main` 上做,不開 feature branch**:使用者在澄清回合明確選了「現在就在 main 上
清空重建」,理由是舊版已經有 git branch/tag 當安全網,不需要再疊一層 feature branch。

## ✅ 驗證

- [x] `npm run ci`:typecheck 綠、**284 tests(26 files)全綠**、build 成功
- [x] **CSS bundle 從 39.87 kB 縮到 15.84 kB**——量出來的數字證明舊 `global.css` 真的沒有
      被打包進去,不是單純程式碼層面「應該有效」的推論
- [x] 隔離 `--user-data-dir` 啟動封裝產物,暫裝拋棄式 `playwright-core` 連上 CDP 截圖:
      畫面回到無樣式的原始 HTML(logo 圖片原尺寸貼在左上、文字堆疊無版面、無玻璃卡片/
      圓角/陰影),證實舊視覺層確實不再套用,不是「程式碼改了但畫面沒變」的假陰性
- [x] 驗收腳本、`playwright-core`、截圖用完即刪,`git status` 只剩預期中的檔案
      (`package.json`/`package-lock.json`、`main.tsx`、新增的三個 Tailwind 設定檔)

## 🔎 自我審查

**檢查情境:拔掉 `global.css` 後,`applyStyleProfile`/`theme.ts` 這些還在跑的舊系統程式碼
會不會在某個路徑丟出未捕捉的例外(而不是單純「沒效果」)?**——如果會,那就不是單純的
視覺倒退,是會讓整個 app 開不起來的真回歸。`npm run ci` 的 284 tests 涵蓋
`applyStyleProfile`/`calibration`/`theme` 相關的純函式層,全數通過;實機啟動截圖也確認
app 完整跑到可互動狀態(Settings/Dashboard 文字與按鈕都在,只是沒有樣式),沒有白畫面或
崩潰畫面。**Pass**——這一步的風險確實只在視覺層,沒有波及執行期穩定性。

## 📝 後續待辦

- **下一步需要使用者提供方向,不是我自己決定**:要重建的第一個畫面是哪個(Settings?
  Dashboard?)、要用哪些真實參考(UIReferences 的 `inspiration/` 目錄、或直接對照
  Aceternity UI / Magic UI 等元件庫)、色彩與排版語言要保留多少既有的「Apple 語意」
  還是完全另起爐灶——這些是設計判斷,不是我可以自己猜的執行細節,留給下一輪對話。
- `global.css`/`styles/profiles/` 目前仍在 repo 裡但已不生效,逐頁重建到不再需要對照時
  再清掉,不是遺漏。
- `AI_CODING_RULES.md`/`PROJECT_STATUS.md` 的「外觀」相關敘述(Liquid Glass 材質、
  Settings > Appearance 風格設定檔)現在已經跟 `main` 的實際畫面不符,會在新 UI 有實際
  內容可以描述時一併改寫,現階段先在 HOME.md 標記這個落差,避免文件被誤讀成現況。
- issue #3(達標回饋/超限警報/斷線收尾實機 E2E)與這次的 UI 拆除無關,不受影響。
