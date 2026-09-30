---
tags: [coding-log]
date: 2026-07-14
summary: "套用使用者提供的 IRMS logo(去除白色背景、裁出純圖標版本)到頂部 header 與應用程式圖示(.ico);上下 bar 改為內縮浮動樣式,不再貼滿橫向版面"
---

# 2026-07-14 變更日誌 — Logo 套用與上下 bar 內縮

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260714_exe_packaging_and_github_release|前置:打包與發布]]

## 🎯 目的

使用者三項要求:
1. 套用 `IRMS.png` logo 到其他地方前,先去掉白色背景
2. 說明 Windows 程式碼簽章需要什麼
3. 上下 bar 內縮,不要貼滿整個橫向版面

## 🔧 變更內容

### Logo 處理

原始 `IRMS.png`(1024×1024,RGBA 但 alpha 全為 255,背景是接近純白的漸層,
圖標與文字用高飽和度的藍/青色)。用 Pillow 處理:
- 取樣多個座標點確認背景(飽和度 <0.05、亮度 >0.9)與主體(圖標飽和度 0.97+、
  文字飽和度 0.98)可以用「低飽和度 + 高亮度」的組合分數乾淨分離,帶平滑
  過渡帶(0.55–0.75)避免邊緣鋸齒。
- 產出 `assets/logo-transparent.png`(去背整版,含圖標+「IRMS」文字)。
- 自動偵測圖標與文字之間的空白列(row-gap 偵測),裁出純圖標版本
  `assets/logo-icon-only.png`(638×638,含適度留白,置中)。
- 用純圖標版本產生 Windows 應用程式圖示:`build/icon.ico`(多尺寸
  16/24/32/48/64/128/256)與 `build/icon.png`(1024,跨平台慣例備用),
  接上 `electron-builder.yml` 的 `win.icon`。
- `TopHeader.tsx` 在文字 logo 前加上 `<img>` 圖標(28px 高),對應
  `global.css` 新增 `.logo`(flex 排列)與 `.logo-mark` 樣式。
- 新增 `src/renderer/src/env.d.ts`(`/// <reference types="vite/client" />`)
  ——這個專案先前所有圖片資源都是透過 CSS `url()` 引用(SVG 桌布),第一次
  用 JS/TS `import` 圖片,需要 Vite 的內建型別宣告才能讓 TypeScript 認得
  `.png` 模組。

### 上下 bar 內縮

`.top-header` 與 `.bottom-bar` 原本是 `.app`(直式 flex 版面)裡跨滿寬度的
flex item。改用 `margin` 讓兩者變成內縮的浮動玻璃 bar:
- `.top-header`:左右內縮不對稱(左 12px、右 150px)——右側刻意留比較多空間,
  因為視窗無標題列(`titleBarStyle:'hidden'`),右上角疊著原生最小化/最大化/
  關閉鈕(`titleBarOverlay`),bar 本體要真的縮短、讓開那塊區域,而不是只用
  `padding` 讓內容避開(那樣玻璃背景還是會延伸到角落,視覺上跟原生按鈕打架)。
  取代先前用 `padding-right:150px` 做的內距補償寫法。
- `.bottom-bar`:`max-width:640px` + `margin:0 auto`,單純置中,無需不對稱
  (底部沒有視窗控制鈕的疊層問題)。

## 🧠 關鍵決策

- **去背用飽和度+亮度的組合分數,而非單純顏色鍵值(color-key)**——背景是
  漸層(不是單一純白色),用固定色值比對會在漸層區域留下鋸齒邊;組合分數
  (低飽和度×高亮度)搭配平滑過渡帶處理起來更乾淨,兩種底色(深/淺)實測
  都沒有殘留白邊。
- **圖標與文字分離,而非整版 logo 直接當 header 圖**——header 已經有獨立的
  「IRMS.」文字(用 CSS 上色,accent 色的句點),整版 logo 硬塞進去會造成
  「IRMS」文字重複兩次;裁出純圖標版本,保留現有文字排版,只補上圖形標記。
- **上下 bar 用不對稱內縮,不是簡單置中**——如果比照 bottom-bar 用對稱方式
  置中,右側可能不夠寬讓開原生視窗控制鈕疊層,尤其在視窗接近最小寬度
  (1024px)時。

## ✅ 驗證

- `npm run ci`(typecheck+71 tests+build)綠——`env.d.ts` 補上後 TS 才認得
  `.png` import,build 也確認 `logo-icon-only-*.png` 被 Vite 正確打包進
  `out/renderer/assets/`。
- 用 Pillow 合成到深色/淺色兩種底色背景預覽去背結果,確認沒有白色邊緣殘留
  後才套用(見上方去背章節)。
- 瀏覽器對 Vite dev server 做 DOM 級驗證(本 session 截圖工具持續逾時,
  改用 `getBoundingClientRect` 量測驗證):
  - logo `<img>` 的 `naturalWidth > 0`,確認圖片正確載入(非破圖)。
  - `.top-header` 量到左內縮 28px、右內縮 166px(對應 `.app` 16px padding +
    12px/150px margin);`.bottom-bar` 左右皆內縮 320px(1280 寬視窗下,
    max-width 640 置中的預期值),兩者皆確認不再貼滿橫向版面。
  - 無 console 錯誤。

## 📝 後續待辦

- 無邊框視窗(`titleBarOverlay`)本身的視覺效果仍待使用者在真正的 Electron
  視窗裡驗收(純瀏覽器分頁看不到 OS 疊層按鈕的實際位置)。
- `assets/logo-transparent.png`(整版去背 logo,含文字)目前尚未在任何地方
  使用,先保留作為未來(例如 About 畫面、README)可能用到的素材。
