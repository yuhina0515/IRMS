---
tags: [coding-log]
summary: "新增外觀風格設定檔系統:把 global.css 原本 :root(淺色)+ prefers-color-scheme: dark 覆寫的雙主題,重構成 styles/profiles/ 底下兩個自足的 StyleProfile 設定檔(liquidGlassLight.ts / liquidGlassDark.ts),經 applyStyleProfile.ts 以 inline custom property 寫在 <html> 上(inline style 特異度蓋過 stylesheet,固定風格因此可覆蓋 OS 深淺色),'system' 則清掉所有覆寫、退回原本的 CSS 規則。新增 Settings.styleProfileId 欄位(persist v6→v7)與 SettingsView 的 Appearance 面板(GlassDropdown 選『跟隨系統』或任一設定檔)。theme.ts 的 onSystemThemeChange 更名/擴充為 onThemeChange,額外訂閱一個 applyStyleProfile 觸發的 window CustomEvent,讓 Leg3D/LiveChart 這類只能靠 getComputedStyle 讀 token 的 canvas 元件在使用者手動切換風格(而非只在 OS 主題切換)時也會重新解析。global.css 的 :root/媒體查詢區塊保留為兩個設定檔的原始資料來源與『跟隨系統』狀態下的唯一生效規則,結構/選擇器未動。typecheck+284 tests+build 全綠。"
date: 2026-08-31
---

# 2026-08-31 變更日誌 — 外觀風格設定檔系統

> **相關文件**:[[HOME|導覽首頁]] · [[OPTIMIZATION|優化待辦]] · [[PROJECT_STATUS|開發進度]] ·
> [[log_20260712_apple_theme|2026-07-12 Apple 風格雙主題(本次重構的對象)]]

## 🎯 目的

使用者要求:「在 IRMS 建立風格系統,並且將每一個風格都設為一個設定檔」。範圍依
[[OPTIMIZATION#修缺陷,不擴大議程|專案排期規則]] 收斂為:建立可擴充的風格設定檔基建,
把既有的兩個主題(淺/深)遷移成第一批設定檔,不發明新的視覺風格、不重寫 CSS 架構
(選擇器/材質規則不動,只把 token 的具體數值移出)。

## 🔍 現況調查

先讀過再動手,確認的事實:
- `global.css` 的 `:root`(35 個 token)+ `@media (prefers-color-scheme: dark)`(覆寫其中
  約 24 個)是唯一的資料來源,切換完全交給 OS,App 內沒有任何手動切換入口。
- `theme.ts` 的 `themeToken()`/`chartTheme()` 靠 `getComputedStyle` 解析同一組 CSS 變數,
  供 Chart.js/Three.js 使用(它們讀不到 `var(--x)`);`onSystemThemeChange()` 只訂閱
  `matchMedia('(prefers-color-scheme: dark)')` 的 change 事件,消費端是 `Leg3D.tsx:99`
  與 `LiveChart.tsx:86`。
- `useStore.ts` 的 `Settings`/`DEFAULT_SETTINGS`/`migrateSettings` 已有成熟的欄位新增慣例
  (務必 bump `version`,否則 zustand persist 的淺層 merge 會讓新欄位變 `undefined`)。
- `SettingsView.tsx` 的既有面板都是 `<div className="panel glass">` + `GlassDropdown`/
  `NumField`/`Toggle` + `set(key, value)` 的固定形狀。

## 🛠 實作

1. **`styles/profiles/types.ts`**:`StyleProfile { id, name, description, tokens }`。
   `tokens` 刻意設計成**每個設定檔自成一體的完整集合,不是對另一個設定檔的差異**——
   這樣未來加第三個風格時不用管其他設定檔覆寫了什麼。
2. **`styles/profiles/liquidGlassLight.ts` / `liquidGlassDark.ts`**:從 global.css 原文
   逐一抄出;dark 版把當年沒被 media query 覆寫的 token(`--radius`/`--glass-blur`/
   `--font`/`--console-text`/兩個 `color-mix()` 公式)也一併寫入完整值,不依賴退回
   light 版——同樣是「設定檔必須自足」的要求。
3. **`styles/profiles/registry.ts`**:`STYLE_PROFILES` 陣列 + `getStyleProfile(id)` +
   `allProfileTokenNames()`(給「跟隨系統」清除覆寫用)。
4. **`styles/applyStyleProfile.ts`**:`'system'` → 對 `<html>` 逐一 `removeProperty`
   每個已知 token 名稱,退回 global.css 的 `:root`/media query 規則(即今天的原始行為
   分毫不差);其他 id → 逐一 `setProperty`,inline style 的特異度必然蓋過任何 stylesheet
   規則,因此固定風格會無視 OS 深淺色直到切回「跟隨系統」。未知 id(例如設定被移除或
   舊資料)退回 `'system'` 而非靜默維持上一次外觀。
5. **`theme.ts`**:`onSystemThemeChange` 更名為 `onThemeChange`,額外監聽一個
   `applyStyleProfile()` 觸發的 `window` CustomEvent(`irms:theme-changed`)。這一步是
   必要的,不是順手擴大範圍——`Leg3D.tsx`/`LiveChart.tsx` 原本只在 `matchMedia` 事件觸發
   時重讀 token,使用者在 Settings 手動切換固定風格完全不會經過那個事件,兩個 canvas
   元件會停在切換前的顏色。兩處呼叫點與 jsdom test-setup 的註解一併改名。
6. **`useStore.ts`**:`Settings.styleProfileId: string`,預設 `'system'`;
   persist `version: 6 → 7`(沿用既有版本註解慣例列出 v7 是什麼)。`migrateSettings`
   本身不用改——它已經是 `{...DEFAULT_SETTINGS, ...rest}`,新欄位自動補齊。
7. **`App.tsx`**:根元件新增一個 `useEffect`,依 `settings.styleProfileId` 呼叫
   `applyStyleProfile()`——涵蓋初次載入(讀出持久化設定)與後續每次切換。
8. **`SettingsView.tsx`**:新增「Appearance 外觀」面板,`GlassDropdown` 選項為
   「跟隨系統 (System)」+ `STYLE_PROFILES` 逐一列出,並提示固定風格會覆蓋系統深淺色。
9. **`global.css`** 檔頭註解改寫:明說這個檔案現在是 profiles 底下兩個設定檔的原始
   資料來源,以及 `'system'` 狀態下才會生效——新增風格請去 `styles/profiles/` 加檔案,
   不要在這裡加新色塊。

## ⚠️ 順手修的兩個測試 fixture

`calibration.test.ts` 與 `useStore.test.ts` 各自手刻一份完整的 `Settings` 物件當測試
固定資料,新增必填欄位後 TS 編譯直接報錯(這正是型別系統該做的事,不是缺陷)——兩處
補上 `styleProfileId: 'system'`。

## ✅ 驗證

- `npm run typecheck`(node + web 兩個 tsconfig):**全綠**,含修完 fixture 後的複驗。
- `npm run test`(vitest):**26 files / 284 tests 全數通過**,涵蓋既有的 migrateSettings/
  reconcileSelection/calibration 測試,無新增測試(本次是基建遷移而非新判定邏輯)。
- `npm run build`(electron-vite):main/preload/renderer 三個 bundle 皆成功產出,
  renderer CSS 39.78 kB(較改動前略增,合理,因為多了新檔案但未刪舊規則)。
- `out/` 建置產物確認在根目錄 `.gitignore` 涵蓋範圍內,未污染 git status。

## 🔎 自我審查

檢查情境:**inline custom property 真的能蓋過 `@media (prefers-color-scheme: dark)` 裡的
`:root` 規則嗎?** ——CSS 特異度規則下,`element.style`(inline)永遠贏過任何 stylesheet
選擇器(不論該選擇器包在哪個 media query 裡),因為 inline style 不參與一般的選擇器
特異度比較,直接排在最上層。因此 `applyStyleProfile('liquid-glass-dark')` 在淺色 OS
主題下依然會顯示深色,`'system'` 則因為完全不寫 inline 屬性而讓兩條 stylesheet 規則
照舊生效——邏輯一致,不需要額外的 JS 分支去偵測 OS 主題再手動套用「系統對應的那個
設定檔」。

## 📌 未涵蓋 / 留給之後

- 沒有新增第三種視覺風格(使用者只要求建系統,不是要更多美術風格)。
- 未做 UI 目視驗收(本次環境無法開 Electron 視窗截圖)——外觀改動的視覺正確性
  待使用者下次操作時確認。
