---
tags: [coding-log]
date: 2026-07-13
summary: "自製向量桌布:aurora 網格漸層 SVG(淺/深各一張)取代純 blob 背景,blob 降為點綴動態;feTurbulence 噪點因光柵化過慢移除;71 tests 綠"
---

# 2026-07-13 變更日誌 — Claude 自製向量桌布

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260712_liquid_glass_full_pass|前置:Liquid Glass 全面化]]

## 🎯 目的

使用者問「背景與主題可以換嗎」→ 選「直接換掉現在的」,並問免費高畫質桌布來源;
最終決定「讓 Claude 設計」——自製向量桌布(零授權疑慮、任意解析度銳利、
色系與主題精準對齊)。

## 🔧 變更內容

1. **`assets/bg-light.svg` / `bg-dark.svg`(新增,手工設計)**:
   aurora 網格漸層——淺色 = 近白基底 + 薰衣草紫/天藍/薄荷綠/蜜桃橘四層柔光暈;
   深色 = 深靛基底 + 靛紫/深藍/藍綠/紫紅光暈。viewBox 1440×900,
   `preserveAspectRatio="slice"` 滿版裁切。Vite 內聯為 data URI(< 4KB),零額外請求。
2. **`global.css`**:`.bg-scene` 底層鋪桌布(prefers-color-scheme 換張),
   blob 保留但降濃度(0.55→0.35 / 0.5→0.3)成為點綴動態;
   `--bg-0` 與視窗底色對齊桌布基底色(#EEF2FB / #0B0F1F)。

## 🧠 關鍵決策與教訓

- **feTurbulence 噪點層被移除**:原設計含 fractalNoise 防色帶,但瀏覽器面板
  截圖連續 30s 超時,判斷全視窗光柵化 turbulence 過慢——app 端視窗縮放會重光柵化,
  是效能地雷。柔漸層 + 背景多在玻璃模糊後方,色帶風險本就低。
- 曾嘗試以瀏覽器面板預覽 SVG:file:// 被拒 → 臨時 node HTTP server 可導航,
  但 `computer` 截圖管線在本 session 持續超時(非內容問題),放棄視覺預檢,
  改以 app 實機驗收。
- 外部桌布方案(Unsplash/Pexels,免費可商用)已調研並提供候選,使用者未採。

## ✅ 驗證

- [x] `npm run ci` 全綠:typecheck + 71 tests + build
- [x] `npm run dev` 啟動正常、renderer 無錯誤
- [ ] 👀 使用者視覺驗收:淺/深桌布效果、blob 點綴濃度、與玻璃卡片的搭配

## 📝 後續待辦

- 依驗收調色(光暈位置/色相/濃度只是 SVG 裡幾個數字)
- 若要防色帶噪點:改用預先光柵化的微小 noise PNG(base64)平鋪,勿用 feTurbulence
