---
tags: [coding-log]
date: 2026-07-12
summary: "改版 Liquid Glass(iOS 26/27 設計語言):半透明玻璃卡片+backdrop-filter 折射+頂緣高光+膠囊控件,背景鋪色彩漸層;僅動 global.css token/材質層,71 tests 綠"
---

# 2026-07-12 變更日誌 — Liquid Glass 材質改版

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260712_apple_theme|前置:Apple 雙主題]]

## 🎯 目的

使用者看過 Apple 扁平卡片版後,指定改為 iOS 26/27 的 **Liquid Glass** 設計語言。

## 🔧 變更內容(建立在既有 token 架構上,元件零改動)

1. **材質層**(`global.css`):
   - `.glass` = 半透明面(`--surface` 改 rgba)+ `backdrop-filter: blur(20px) saturate(1.7)`
     + 玻璃外緣光圈(`--glass-border`)+ 頂緣高光(`--glass-highlight` inset)+ 柔和外陰影。
   - body 背景鋪 accent/accent-2 的 radial 漸層(玻璃折射需要背景有內容可取樣)。
   - 圓角加大:卡片 18px;按鈕/nav/tabs 全改膠囊(999px)。
   - toast/log-panel 也玻璃化;分隔線 token 拆分:`--glass-border`(卡片外緣光圈)
     vs `--separator`(表格列等內容分隔)。
2. **雙主題維持跟隨系統**:淺色 #E9EDF7 基底 + 白玻璃;深色 #0D1220 基底 + 深藍玻璃。
3. **視窗底色**(`main/index.ts`)對齊新基底色。

## 🧠 關鍵決策

- **canvas token 仍為純色值**:Chart/Leg3D 讀的 `--leg3d-*`、`--chart-*`、系統色
  維持 hex/rgba,`color-mix()` 與玻璃材質只存在於 CSS 端(getComputedStyle 解不了)。
- **效能有意識取捨**:backdrop-filter 是 GPU 開銷,與剛修完的卡頓有張力——
  模糊固定 20px、只掛在卡片級元素,選單/按鈕用半透明填色不疊 blur;
  待使用者實測體感,若掉幀首先降 blur 或移除 stat 卡的玻璃。

## ✅ 驗證

- [x] `npm run ci` 全綠:typecheck + 71 tests + build
- [x] `npm run dev` 啟動正常、無 renderer 錯誤
- [ ] 👀 使用者視覺驗收(淺/深)+ 卡頓體感確認(backdrop-filter 新增 GPU 負載)

## 📝 後續待辦

- 依驗收回饋微調透明度/模糊強度/漸層色
- 若效能不佳:降 blur、減少玻璃層數、或 stat 卡改半透明無 blur
